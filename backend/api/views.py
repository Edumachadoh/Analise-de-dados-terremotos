"""
Views da API: recebem a requisição, delegam o trabalho aos serializers e
services, e devolvem a resposta com o status HTTP adequado.
A regra de negócio fica em api/services/, não aqui.
"""

from django.conf import settings
from django.db.models import Count
from django.shortcuts import get_object_or_404
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from shapely.geometry import shape

from .filters import TerremotoFilter
from .models import Coleta, ModeloTreinado, Regiao, Terremoto
from .serializers import (ColetaSerializer, ImportacaoRegiaoSerializer, ModeloTreinadoSerializer,
                          PrevisaoQuerySerializer, RegiaoSerializer, TerremotoSerializer,
                          TreinoSerializer, UploadCsvSerializer)
from .services import estatisticas, importacao, ml
from .services.usgs import ErroUSGS


class TerremotoViewSet(viewsets.ModelViewSet):
    """
    CRUD de terremotos.

    Filtros: magnitude_min, magnitude_max, profundidade_min, profundidade_max,
    data_inicio, data_fim (AAAA-MM-DD), latitude_min/max, longitude_min/max,
    local, faixa_profundidade (raso, intermediario, profundo), tsunami, alerta,
    regiao (código do continente ou oceano, ex.: america-do-sul).
    Ordenação: ?ordering=-magnitude (campos: data_hora, magnitude, profundidade_km).
    """
    queryset = Terremoto.objects.all()
    serializer_class = TerremotoSerializer
    filterset_class = TerremotoFilter
    ordering_fields = ["data_hora", "magnitude", "profundidade_km"]
    ordering = ["-data_hora"]


class RegiaoViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Regiões que a interface analisa: continentes e oceanos.

    total_terremotos diz quantos eventos da base pertencem à região; 0 significa que os
    dados dela ainda não foram importados. Use ?com_dados=true para listar só as que têm.
    POST /api/regioes/{codigo}/importar/ busca no USGS os terremotos da região.
    """
    queryset = Regiao.objects.all()
    serializer_class = RegiaoSerializer
    lookup_field = "codigo"
    pagination_class = None  # são poucas

    def get_queryset(self):
        regioes = list(super().get_queryset())
        if self.action != "list":
            return regioes
        contagem = dict(Terremoto.objects.values_list("zona").annotate(total=Count("id")))
        for r in regioes:
            r.total_terremotos = contagem.get(r.codigo, 0)
        if self.request.query_params.get("com_dados") in ("true", "1"):
            regioes = [r for r in regioes if r.total_terremotos]
        return regioes

    def get_object(self):
        regiao = get_object_or_404(Regiao, codigo=self.kwargs["codigo"])
        regiao.total_terremotos = regiao.filtrar(Terremoto.objects.all()).count()
        return regiao

    @action(detail=False)
    def mapa(self, request):
        """Os polígonos de todas as regiões (GeoJSON) para desenhar o mapa de escolha."""
        mapa = []
        for r in Regiao.objects.all():
            geometria = shape(r.geometria)
            maior = max(getattr(geometria, "geoms", [geometria]), key=lambda parte: parte.area)
            ponto = maior.representative_point()  # onde escrever o nome da região
            mapa.append({"codigo": r.codigo, "tipo": r.tipo, "ordem": r.ordem,
                         "centro": [ponto.y, ponto.x], "geometria": r.geometria, "costa": r.costa})
        return Response(mapa)

    @action(detail=True, methods=["post"], url_path="importar")
    def importar(self, request, codigo=None):
        """
        Busca no USGS os terremotos da região e grava no banco.

        Corpo: {"anos": 3, "magnitude_minima": null}. Sem magnitude_minima, usa a magnitude
        de completude da região. Eventos que já existem são atualizados, não duplicados.
        """
        regiao = get_object_or_404(Regiao, codigo=codigo)
        entrada = ImportacaoRegiaoSerializer(data=request.data)
        entrada.is_valid(raise_exception=True)
        try:
            coleta = importacao.importar_do_usgs(entrada.validated_data["anos"],
                                                 entrada.validated_data["magnitude_minima"],
                                                 regiao=regiao)
        except ErroUSGS as erro:
            # A falha foi do serviço externo, não do cliente: 502 Bad Gateway.
            # A coleta fica registrada com status "erro" e a mensagem.
            return Response(ColetaSerializer(erro.coleta).data, status=status.HTTP_502_BAD_GATEWAY)
        except ValueError as erro:
            raise ValidationError({"detail": str(erro)}) from erro  # região sem caixas: 400
        return Response(ColetaSerializer(coleta).data, status=status.HTTP_201_CREATED)


class EstatisticaViewSet(viewsets.ViewSet):
    """
    Estatísticas para gráficos. Aceitam os mesmos filtros de /api/terremotos/.
    """

    def _queryset(self, request):
        filtro = TerremotoFilter(request.query_params, queryset=Terremoto.objects.all())
        if not filtro.is_valid():
            raise ValidationError(filtro.errors)  # vira 400 com os erros por campo
        return filtro.qs

    def list(self, request):
        """Resumo geral: total, magnitudes, período e o evento mais forte."""
        return Response(estatisticas.resumo(self._queryset(request)))

    @action(detail=False, url_path="por-mes")
    def por_mes(self, request):
        """Quantidade e magnitude média por mês."""
        return Response(estatisticas.por_mes(self._queryset(request)))

    @action(detail=False, url_path="por-magnitude")
    def por_magnitude(self, request):
        """Quantidade por faixa de magnitude."""
        return Response(estatisticas.por_faixa_magnitude(self._queryset(request)))

    @action(detail=False, url_path="por-profundidade")
    def por_profundidade(self, request):
        """Quantidade e magnitude média por faixa de profundidade."""
        return Response(estatisticas.por_faixa_profundidade(self._queryset(request)))

    @action(detail=False, url_path="correlacao")
    def correlacao(self, request):
        """Correlação de Pearson entre magnitude, profundidade, estações, lacuna e rms."""
        return Response(estatisticas.correlacao(self._queryset(request)))

    @action(detail=False, url_path="janelas")
    def janelas(self, request):
        """AUC de cada feature de histórico do ML (alvo M >= 4,5, células de 1°)."""
        return Response(estatisticas.poder_das_janelas(self._queryset(request)))

    @action(detail=False, url_path="casos-positivos")
    def casos_positivos(self, request):
        """Fração de célula x período com terremoto >= alvo, por alvo e tamanho de célula."""
        return Response(estatisticas.casos_positivos(self._queryset(request)))


class ColetaViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin,
                    mixins.CreateModelMixin, viewsets.GenericViewSet):
    """
    Histórico de importações. POST busca os dados no USGS e grava no banco.

    Corpo do POST: {"anos": 6, "magnitude_minima": null}
    """
    queryset = Coleta.objects.all()
    serializer_class = ColetaSerializer

    def create(self, request, *args, **kwargs):
        entrada = self.get_serializer(data=request.data)
        entrada.is_valid(raise_exception=True)
        dados = entrada.validated_data
        try:
            coleta = importacao.importar_do_usgs(dados["anos"], dados.get("magnitude_minima"))
        except ErroUSGS as erro:
            # A falha foi do serviço externo, não do cliente: 502 Bad Gateway.
            # A coleta fica registrada com status "erro" e a mensagem.
            coleta = erro.coleta
            return Response(self.get_serializer(coleta).data, status=status.HTTP_502_BAD_GATEWAY)
        return Response(self.get_serializer(coleta).data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=["post"], url_path="upload",
            parser_classes=[MultiPartParser, FormParser], serializer_class=UploadCsvSerializer)
    def upload(self, request):
        """
        Importa um arquivo .csv, .json ou .xml enviado pelo usuário (multipart/form-data).

        Campos: arquivo (com as colunas do USGS) e magnitude_minima (opcional).
        Eventos já existentes são atualizados pelo id, não duplicados.
        """
        entrada = UploadCsvSerializer(data=request.data)
        entrada.is_valid(raise_exception=True)
        arquivo = entrada.validated_data["arquivo"]
        try:
            coleta = importacao.importar_csv(
                arquivo, magnitude_minima=entrada.validated_data["magnitude_minima"],
                nome=arquivo.name,
            )
        except ValueError as erro:
            # Arquivo com formato ou colunas inválidas: o erro é do cliente, 400.
            # A coleta fica registrada com status "erro" e a mensagem.
            return Response(ColetaSerializer(erro.coleta).data, status=status.HTTP_400_BAD_REQUEST)
        return Response(ColetaSerializer(coleta).data, status=status.HTTP_201_CREATED)


class ModeloViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin,
                    mixins.DestroyModelMixin, viewsets.GenericViewSet):
    """
    Modelos de machine learning.

    POST treina um novo modelo, que passa a ser o ativo. Exemplo:
        {"algoritmo": "random_forest",
         "parametros": {"n_estimators": 200, "max_depth": 10},
         "magnitude_alvo": 4.0,
         "atualizar_dados": true}
    Com atualizar_dados=true, busca no USGS os últimos 6 anos antes de treinar
    (re-treino com dados novos).
    """
    queryset = ModeloTreinado.objects.all()
    serializer_class = ModeloTreinadoSerializer

    def get_serializer_class(self):
        # O formulário da API navegável mostra os campos de treino no POST
        return TreinoSerializer if self.action == "create" else ModeloTreinadoSerializer

    def create(self, request, *args, **kwargs):
        entrada = TreinoSerializer(data=request.data)
        entrada.is_valid(raise_exception=True)
        dados = entrada.validated_data

        if dados["atualizar_dados"]:
            try:
                importacao.importar_do_usgs(dados["anos"])
            except ErroUSGS as erro:
                return Response({"detail": f"Falha ao atualizar os dados: {erro}"},
                                status=status.HTTP_502_BAD_GATEWAY)
        try:
            modelo = ml.treinar(
                algoritmo=dados["algoritmo"], parametros=dados["parametros"],
                magnitude_alvo=dados["magnitude_alvo"], meses_teste=dados["meses_teste"],
                tamanho_celula=dados["tamanho_celula"], anos=dados.get("anos"),
            )
        except ml.ErroModelo as erro:
            raise ValidationError({"detail": str(erro)}) from erro
        return Response(ModeloTreinadoSerializer(modelo).data, status=status.HTTP_201_CREATED)

    def perform_destroy(self, instance):
        # Apaga também o arquivo salvo do modelo
        if instance.arquivo:
            (settings.PASTA_MODELOS / instance.arquivo).unlink(missing_ok=True)
        instance.delete()

    @action(detail=False)
    def algoritmos(self, request):
        """Algoritmos disponíveis e os parâmetros configuráveis de cada um."""
        return Response(ml.listar_algoritmos())

    @action(detail=True, methods=["post"])
    def ativar(self, request, pk=None):
        """Torna este o modelo usado nas previsões."""
        modelo = ml.ativar(self.get_object())
        return Response(ModeloTreinadoSerializer(modelo).data)


class PrevisaoViewSet(viewsets.ViewSet):
    """
    Probabilidade de terremoto por região nos próximos 30 dias.

    Parâmetros: modelo (padrão: o ativo), latitude e longitude (só a célula do
    ponto), limite (as N localidades mais prováveis), regiao (só as localidades
    dessa região).
    Exemplo: /api/previsoes/?regiao=america-do-sul&limite=1
    """

    def list(self, request):
        entrada = PrevisaoQuerySerializer(data=request.query_params)
        entrada.is_valid(raise_exception=True)
        dados = entrada.validated_data

        if "modelo" in dados:
            modelo = get_object_or_404(ModeloTreinado, pk=dados["modelo"])
        else:
            modelo = ModeloTreinado.objects.filter(ativo=True).first()
            if modelo is None:
                return Response({"detail": "Nenhum modelo treinado. Use POST /api/modelos/."},
                                status=status.HTTP_404_NOT_FOUND)
        try:
            resultado = ml.prever(modelo, dados.get("latitude"), dados.get("longitude"),
                                  dados.get("limite"), dados.get("regiao"))
        except ml.ErroModelo as erro:
            raise ValidationError({"detail": str(erro)}) from erro
        return Response(resultado)
