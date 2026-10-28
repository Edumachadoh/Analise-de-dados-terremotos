"""
Estatísticas calculadas no banco, com o ORM do Django.

Cada função recebe um queryset (já filtrado pela view) e devolve dados
prontos para gráficos: o agrupamento é feito em SQL, não em Python.
"""

from django.db.models import Avg, Case, CharField, Count, Max, Min, Q, Value, When
from django.db.models.functions import TruncMonth

from ..models import Terremoto

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
