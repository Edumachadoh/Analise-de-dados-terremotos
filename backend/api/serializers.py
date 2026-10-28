"""
Serializers: convertem objetos em JSON (saída) e validam o JSON recebido (entrada).
"""

from django.conf import settings
from rest_framework import serializers

from .models import Coleta, ModeloTreinado, Terremoto
from .services import ml


class TerremotoSerializer(serializers.ModelSerializer):
    # Calculado a partir da profundidade; só leitura
    faixa_profundidade = serializers.CharField(read_only=True)

    class Meta:
        model = Terremoto
        fields = "__all__"
        # Os validators de faixa (latitude entre -90 e 90 etc.) vêm do model


class ColetaSerializer(serializers.ModelSerializer):
    """Leitura de uma coleta e entrada para iniciar uma nova."""

    class Meta:
        model = Coleta
        fields = ["id", "iniciada_em", "finalizada_em", "anos", "magnitude_minima", "origem",
                  "status", "recebidos", "novos", "atualizados", "mensagem"]
        read_only_fields = ["id", "iniciada_em", "finalizada_em", "origem", "status",
                            "recebidos", "novos", "atualizados", "mensagem"]
        extra_kwargs = {"anos": {"required": False}}

    def validate_magnitude_minima(self, valor):
        if valor is not None and not -2 <= valor <= 10:
            raise serializers.ValidationError("Deve estar entre -2 e 10.")
        return valor

    def validate(self, dados):
        dados.setdefault("anos", settings.ANOS_COLETA_PADRAO)
        return dados


class ModeloTreinadoSerializer(serializers.ModelSerializer):
    algoritmo_nome = serializers.SerializerMethodField()

    class Meta:
        model = ModeloTreinado
        fields = ["id", "algoritmo", "algoritmo_nome", "parametros", "magnitude_alvo",
                  "tamanho_celula", "meses_teste", "dados_inicio", "dados_fim",
                  "total_terremotos", "metricas", "ativo", "treinado_em"]
        read_only_fields = fields

    def get_algoritmo_nome(self, obj):
        return ml.ALGORITMOS.get(obj.algoritmo, {}).get("nome", obj.algoritmo)


class TreinoSerializer(serializers.Serializer):
    """
    Entrada do treino (POST /api/modelos/).
    atualizar_dados=true busca no USGS os últimos `anos` antes de treinar:
    é o re-treino com dados novos.
    """
    algoritmo = serializers.ChoiceField(choices=list(ml.ALGORITMOS))
    parametros = serializers.DictField(required=False, default=dict)
    magnitude_alvo = serializers.FloatField(default=4.5, min_value=2.5, max_value=8)
    meses_teste = serializers.IntegerField(default=6, min_value=1, max_value=24)
    tamanho_celula = serializers.ChoiceField(choices=[0.5, 1.0, 2.0], default=1.0)
    anos = serializers.IntegerField(required=False, min_value=1, max_value=20,
                                    help_text="Janela de dados usada (padrão: toda a base)")
    atualizar_dados = serializers.BooleanField(default=False)

    def validate(self, dados):
        # Reaproveita a validação do serviço de ML e devolve os parâmetros completos
        try:
            dados["parametros"] = ml.validar_parametros(dados["algoritmo"], dados["parametros"])
        except ml.ErroModelo as erro:
            raise serializers.ValidationError({"parametros": str(erro)}) from erro
        if dados["atualizar_dados"] and "anos" not in dados:
            dados["anos"] = settings.ANOS_RETREINO
        return dados


class PrevisaoQuerySerializer(serializers.Serializer):
    """Parâmetros de GET /api/previsoes/."""
    modelo = serializers.IntegerField(required=False, help_text="Padrão: o modelo ativo")
    latitude = serializers.FloatField(required=False, min_value=-90, max_value=90)
    longitude = serializers.FloatField(required=False, min_value=-180, max_value=180)
    limite = serializers.IntegerField(required=False, min_value=1, max_value=1000)

    def validate(self, dados):
        if ("latitude" in dados) != ("longitude" in dados):
            raise serializers.ValidationError("Informe latitude e longitude juntas.")
        return dados
