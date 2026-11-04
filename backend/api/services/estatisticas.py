"""
Estatísticas calculadas no banco, com o ORM do Django.

Cada função recebe um queryset (já filtrado pela view) e devolve dados
prontos para gráficos: o agrupamento é feito em SQL, não em Python.
"""

import pandas as pd
from django.db.models import Avg, Case, CharField, Count, Max, Min, Q, Value, When
from django.db.models.functions import TruncMonth
from sklearn.metrics import roc_auc_score

from ..models import Terremoto
from . import ml

FAIXAS_MAGNITUDE = [
    ("menor que 3", Q(magnitude__lt=3)),
    ("3 a 3,9", Q(magnitude__gte=3, magnitude__lt=4)),
    ("4 a 4,9", Q(magnitude__gte=4, magnitude__lt=5)),
    ("5 a 5,9", Q(magnitude__gte=5, magnitude__lt=6)),
    ("6 ou mais", Q(magnitude__gte=6)),
]


def _arredondar(valor, casas=2):
    return round(valor, casas) if valor is not None else None


def resumo(queryset) -> dict:
    agregado = queryset.aggregate(
        total=Count("id"),
        magnitude_media=Avg("magnitude"),
        magnitude_maxima=Max("magnitude"),
        profundidade_media=Avg("profundidade_km"),
        primeiro=Min("data_hora"),
        ultimo=Max("data_hora"),
        com_tsunami=Count("id", filter=Q(tsunami=True)),
    )
    mais_forte = queryset.order_by("-magnitude").first()
    return {
        "total": agregado["total"],
        "magnitude_media": _arredondar(agregado["magnitude_media"]),
        "magnitude_maxima": agregado["magnitude_maxima"],
        "profundidade_media_km": _arredondar(agregado["profundidade_media"], 1),
        "periodo": {"inicio": agregado["primeiro"], "fim": agregado["ultimo"]},
        "com_alerta_tsunami": agregado["com_tsunami"],
        "mais_forte": mais_forte and {
            "id": mais_forte.pk, "magnitude": mais_forte.magnitude,
            "local": mais_forte.local, "data_hora": mais_forte.data_hora,
        },
    }


def por_mes(queryset) -> list[dict]:
    linhas = (queryset.annotate(mes=TruncMonth("data_hora")).values("mes")
              .annotate(total=Count("id"), magnitude_media=Avg("magnitude"),
                        magnitude_maxima=Max("magnitude"))
              .order_by("mes"))
    return [{"mes": l["mes"].strftime("%Y-%m"), "total": l["total"],
             "magnitude_media": _arredondar(l["magnitude_media"]),
             "magnitude_maxima": l["magnitude_maxima"]} for l in linhas]


def por_faixa_magnitude(queryset) -> list[dict]:
    contagens = queryset.aggregate(**{
        f"f{i}": Count("id", filter=condicao) for i, (_, condicao) in enumerate(FAIXAS_MAGNITUDE)
    })
    return [{"faixa": nome, "total": contagens[f"f{i}"]}
            for i, (nome, _) in enumerate(FAIXAS_MAGNITUDE)]


def por_faixa_profundidade(queryset) -> list[dict]:
    raso, intermediario = Terremoto.LIMITE_RASO, Terremoto.LIMITE_INTERMEDIARIO
    faixa = Case(
        When(profundidade_km__lt=raso, then=Value("raso")),
        When(profundidade_km__lte=intermediario, then=Value("intermediario")),
        default=Value("profundo"),
        output_field=CharField(),
    )
    linhas = (queryset.annotate(faixa=faixa).values("faixa")
              .annotate(total=Count("id"), magnitude_media=Avg("magnitude")))
    por_nome = {l["faixa"]: l for l in linhas}
    return [{"faixa": nome,
             "total": por_nome.get(nome, {}).get("total", 0),
             "magnitude_media": _arredondar(por_nome.get(nome, {}).get("magnitude_media"))}
            for nome in ("raso", "intermediario", "profundo")]


# Sem a significância: o USGS a calcula a partir da magnitude, e a correlação seria óbvia
CAMPOS_CORRELACAO = ["magnitude", "profundidade_km", "estacoes", "lacuna_azimutal", "rms"]


def correlacao(queryset) -> dict:
    """
    Correlação de Pearson entre as colunas numéricas (matriz n x n, None onde não dá para calcular).
    Cada par usa só os terremotos que têm as duas colunas preenchidas (o USGS nem sempre informa tudo).
    """
    df = pd.DataFrame.from_records(queryset.values(*CAMPOS_CORRELACAO), columns=CAMPOS_CORRELACAO).astype(float)
    matriz = df.corr(min_periods=3).to_numpy()
    return {"colunas": CAMPOS_CORRELACAO,
            "valores": [[None if pd.isna(v) else round(float(v), 4) for v in linha] for linha in matriz]}


# =============================================================================
# Análises que decidem as escolhas do ML (usam a mesma tabela célula x período)
# =============================================================================
JANELAS = ["eventos_periodo_anterior", "eventos_3_periodos", "eventos_12_periodos",
           "taxa_historica", "atividade_geral_3_periodos"]
TAMANHOS_CELULA = [0.5, 1.0, 2.0]
ALVOS = [4.5, 5.0, 6.0]


def poder_das_janelas(queryset, magnitude_alvo=4.5, tamanho_celula=1.0) -> list[dict]:
    """
    AUC de cada feature de histórico sozinha, para prever terremoto >= alvo no período
    seguinte (0,5 = chute, 1 = perfeito).
    """
    try:
        painel, _ = ml.montar_painel(ml._dataframe(queryset), magnitude_alvo, tamanho_celula)
    except ml.ErroModelo:
        return []
    if painel["alvo"].nunique() < 2:
        return []
    return [{"feature": f, "auc": round(float(roc_auc_score(painel["alvo"], painel[f])), 3)}
            for f in JANELAS]


def casos_positivos(queryset) -> list[dict]:
    """
    Linhas da tabela do ML (célula x período) e quantas têm terremoto >= alvo,
    para cada tamanho de célula e magnitude-alvo.
    """
    try:
        df = ml._dataframe(queryset)
    except ml.ErroModelo:
        return []
    resultado = []
    for tamanho in TAMANHOS_CELULA:
        try:
            eventos, n_periodos, _ = ml.celulas_e_periodos(df, tamanho)
        except ml.ErroModelo:
            return []
        celulas = len(eventos[["cel_lat", "cel_lon"]].drop_duplicates())
        linhas = celulas * (n_periodos - 1)  # o período 0 não tem passado e sai da tabela
        com_passado = eventos[eventos["periodo"] > 0]
        for alvo in ALVOS:
            positivos = len(com_passado.loc[com_passado["magnitude"] >= alvo,
                                            ["cel_lat", "cel_lon", "periodo"]].drop_duplicates())
            resultado.append({"tamanho_celula": tamanho, "magnitude_alvo": alvo, "linhas": linhas,
                              "positivos": positivos, "taxa": round(positivos / linhas, 4)})
    return resultado
