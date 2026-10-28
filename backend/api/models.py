"""
Models da API.

- Terremoto: um evento sísmico do catálogo do USGS.
- Coleta: o registro de cada importação feita a partir do USGS.
- ModeloTreinado: um modelo de machine learning treinado, com parâmetros e métricas.
"""

from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models



class Terremoto(models.Model):
    """Um terremoto registrado pelo USGS."""

    class Alerta(models.TextChoices):
        VERDE = "green", "Verde"
        AMARELO = "yellow", "Amarelo"
        LARANJA = "orange", "Laranja"
        VERMELHO = "red", "Vermelho"

    # Faixas de profundidade usuais em sismologia, em km
    LIMITE_RASO = 70
    LIMITE_INTERMEDIARIO = 300

    # Identificação
    usgs_id = models.CharField(
        "ID no USGS", max_length=40, unique=True,
        help_text="Identificador do evento no catálogo do USGS",
    )
    local = models.CharField("descrição do local", max_length=255, blank=True)

    # Localização. Os validators não criam restrição no banco: eles rodam no
    # full_clean() e no ModelSerializer, que os copia automaticamente.
    latitude = models.FloatField(validators=[MinValueValidator(-90), MaxValueValidator(90)])
    longitude = models.FloatField(validators=[MinValueValidator(-180), MaxValueValidator(180)])
    profundidade_km = models.FloatField(
        "profundidade (km)",
        validators=[MinValueValidator(-10), MaxValueValidator(800)],
    )

    # Magnitude e tempo
    magnitude = models.FloatField(validators=[MinValueValidator(-2), MaxValueValidator(10)])
    tipo_magnitude = models.CharField("escala da magnitude", max_length=10, blank=True)
    data_hora = models.DateTimeField("data e hora (UTC)")
    atualizado_em = models.DateTimeField("última atualização no USGS", null=True, blank=True)

    # Impacto
    tsunami = models.BooleanField("alerta de tsunami", default=False)
    alerta = models.CharField("alerta PAGER", max_length=10, choices=Alerta.choices,
                              null=True, blank=True)
    significancia = models.IntegerField("significância", null=True, blank=True)
    relatos = models.IntegerField("relatos de quem sentiu", null=True, blank=True)
    intensidade_relatada = models.FloatField("intensidade relatada (CDI)", null=True, blank=True)
    intensidade_estimada = models.FloatField("intensidade estimada (MMI)", null=True, blank=True)

    # Qualidade do registro
    estacoes = models.IntegerField("estações usadas (nst)", null=True, blank=True)
    lacuna_azimutal = models.FloatField("lacuna azimutal (gap)", null=True, blank=True)
    distancia_estacao = models.FloatField("distância à estação mais próxima (dmin)",
                                          null=True, blank=True)
    rms = models.FloatField(null=True, blank=True)
    status = models.CharField(max_length=20, blank=True)
    rede = models.CharField("rede sismográfica", max_length=10, blank=True)

    class Meta:
        ordering = ["-data_hora"]
        # Índices nos campos mais usados em filtros e agrupamentos
        indexes = [
            models.Index(fields=["data_hora"]),
            models.Index(fields=["magnitude"]),
        ]

    def __str__(self):
        return f"M{self.magnitude:.1f} · {self.local or 'sem local'} · {self.data_hora:%d/%m/%Y}"

    @property
    def faixa_profundidade(self) -> str:
        """Raso (< 70 km), intermediário (70 a 300 km) ou profundo (> 300 km)."""
        if self.profundidade_km < self.LIMITE_RASO:
            return "raso"
        if self.profundidade_km <= self.LIMITE_INTERMEDIARIO:
            return "intermediario"
        return "profundo"


class Coleta(models.Model):
    """Registro de uma importação de terremotos a partir do USGS."""

    class Status(models.TextChoices):
        EM_ANDAMENTO = "em_andamento", "Em andamento"
        CONCLUIDA = "concluida", "Concluída"
        ERRO = "erro", "Erro"

    iniciada_em = models.DateTimeField(auto_now_add=True)
    finalizada_em = models.DateTimeField(null=True, blank=True)
    anos = models.PositiveSmallIntegerField(
        validators=[MinValueValidator(1), MaxValueValidator(20)],
        help_text="Quantos anos para trás, a partir de hoje",
    )
    magnitude_minima = models.FloatField(
        null=True, blank=True, help_text="Vazio = todas as magnitudes",
    )
    origem = models.CharField(max_length=20, default="usgs",
                              help_text="usgs ou o nome do arquivo CSV importado")
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.EM_ANDAMENTO)
    recebidos = models.PositiveIntegerField(default=0)
    novos = models.PositiveIntegerField(default=0)
    atualizados = models.PositiveIntegerField(default=0)
    mensagem = models.TextField(blank=True)

    class Meta:
        ordering = ["-iniciada_em"]

    def __str__(self):
        return f"Coleta {self.pk} · {self.anos} anos · {self.get_status_display()}"


class ModeloTreinado(models.Model):
    """Um modelo de ML treinado. O objeto do scikit-learn fica salvo em arquivo."""

    algoritmo = models.CharField(max_length=40)
    parametros = models.JSONField(default=dict, blank=True)

    # Definição do problema usada no treino
    magnitude_alvo = models.FloatField(
        help_text="Prevê se a célula terá ao menos um terremoto com magnitude >= este valor",
    )
    tamanho_celula = models.FloatField(default=1.0, help_text="Lado da célula, em graus")
    meses_teste = models.PositiveSmallIntegerField(default=6)

    # Dados usados
    dados_inicio = models.DateTimeField(null=True, blank=True)
    dados_fim = models.DateTimeField(null=True, blank=True)
    total_terremotos = models.PositiveIntegerField(default=0)

    # Resultado
    metricas = models.JSONField(default=dict, blank=True)
    arquivo = models.CharField(max_length=255, blank=True)
    ativo = models.BooleanField(default=False, help_text="Modelo usado nas previsões")
    treinado_em = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-treinado_em"]
        verbose_name = "modelo treinado"
        verbose_name_plural = "modelos treinados"

    def __str__(self):
        return f"{self.algoritmo} · M≥{self.magnitude_alvo:g} · {self.treinado_em:%d/%m/%Y %H:%M}"
