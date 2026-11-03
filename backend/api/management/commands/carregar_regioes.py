"""
Cria (ou atualiza) as regiões de análise, os continentes e os oceanos, e reclassifica os terremotos.

    python manage.py carregar_regioes

Os polígonos vêm do Natural Earth (domínio público), em data/fontes/:
  - ne_110m_admin_0_countries.geojson: os países, com o campo CONTINENT; cada continente é a
    união dos seus países;
  - ne_110m_geography_marine_polys.geojson: os oceanos (Pacífico e Atlântico juntam as partes
    norte e sul).

O Natural Earth põe a Rússia inteira na Europa e a Guiana Francesa na França; aqui a parte da
Rússia a leste dos Urais (60°E, mais a Chukotka, do outro lado do antimeridiano) vai para a Ásia e
a Guiana Francesa para a América do Sul.

Cada continente também ganha `costa`: o polígono com uma faixa de ~200 km de mar em volta (2° de
latitude), usada para que o terremoto no mar perto da costa pertença ao continente. A magnitude
de completude e o tamanho da célula, que podem ser ajustados no admin, não são sobrescritos ao
recarregar. Regiões que não estão mais na lista são removidas (com os modelos treinados nelas).
Depois de carregar, cada terremoto da base recebe a região a que pertence (Terremoto.zona).
"""

import json

import shapely
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from shapely.geometry import box, mapping, shape
from shapely.ops import unary_union
from shapely.validation import make_valid

from api.models import Regiao
from api.services import zonas

PASTA = settings.BASE_DIR / "data" / "fontes"
FAIXA_COSTA = 2.0  # graus: ~220 km de latitude
AREA_MINIMA_CAIXA = 4.0  # graus²: partes menores (ilhotas) não entram na consulta ao USGS

# CONTINENT do Natural Earth -> (código, nome)
CONTINENTES = {
    "Africa": ("africa", "África"),
    "Antarctica": ("antartida", "Antártida"),
    "Asia": ("asia", "Ásia"),
    "Europe": ("europa", "Europa"),
    "North America": ("america-do-norte", "América do Norte"),
    "Oceania": ("oceania", "Oceania"),
    "South America": ("america-do-sul", "América do Sul"),
}
# (código, nome) -> polígonos de oceano do Natural Earth (em minúsculas) que o formam
OCEANOS = {
    ("oceano-pacifico", "Oceano Pacífico"): ["north pacific ocean", "south pacific ocean"],
    ("oceano-atlantico", "Oceano Atlântico"): ["north atlantic ocean", "south atlantic ocean"],
    ("oceano-indico", "Oceano Índico"): ["indian ocean"],
    ("oceano-artico", "Oceano Ártico"): ["arctic ocean"],
    ("oceano-antartico", "Oceano Antártico"): ["southern ocean"],
}


# Parte da Rússia que fica na Europa: do antimeridiano oeste até os Urais
EUROPA_RUSSA = box(-100, -90, 60, 90)


def _partes_por_continente(paises):
    """{continente: [geometrias]}, com as correções da Rússia e da Guiana Francesa."""
    partes = {continente: [] for continente in CONTINENTES}
    for f in paises:
        continente = f["properties"]["CONTINENT"]
        if continente not in partes:
            continue  # "Seven seas (open ocean)"
        geometria = make_valid(shape(f["geometry"]))
        nome = f["properties"].get("ADMIN")
        if nome == "Russia":
            partes["Europe"].append(geometria.intersection(EUROPA_RUSSA))
            partes["Asia"].append(geometria.difference(EUROPA_RUSSA))
        elif nome == "France":
            for parte in getattr(geometria, "geoms", [geometria]):
                ponto = parte.representative_point()
                destino = "South America" if ponto.x < -30 and ponto.y < 20 else continente
                partes[destino].append(parte)
        else:
            partes[continente].append(geometria)
    return partes


def _ler(nome):
    caminho = PASTA / nome
    if not caminho.exists():
        raise CommandError(f"{caminho} não existe.")
    return json.loads(caminho.read_text(encoding="utf-8"))["features"]


def _geojson(geometria, tolerancia):
    """Simplifica e arredonda (poucos milhares de pontos por região) e devolve um GeoJSON."""
    geometria = shapely.set_precision(geometria.simplify(tolerancia, preserve_topology=True), 0.001)
    return mapping(geometria)


def _caixas(geometria):
    """Uma caixa [lat_min, lat_max, lon_min, lon_max] por parte da região, sem as ilhotas."""
    partes = list(geometria.geoms) if hasattr(geometria, "geoms") else [geometria]
    caixas = []
    for parte in partes:
        lon_min, lat_min, lon_max, lat_max = parte.bounds
        caixa = [max(lat_min, -90), min(lat_max, 90), max(lon_min, -180), min(lon_max, 180)]
        caixas.append((round((caixa[1] - caixa[0]) * (caixa[3] - caixa[2]), 2),
                       [round(v, 2) for v in caixa]))
    grandes = [c for area, c in caixas if area >= AREA_MINIMA_CAIXA]
    return grandes or [max(caixas)[1]]


class Command(BaseCommand):
    help = "Carrega os continentes e oceanos e reclassifica os terremotos por região."

    def handle(self, *args, **opcoes):
        paises = _ler("ne_110m_admin_0_countries.geojson")
        mares = _ler("ne_110m_geography_marine_polys.geojson")

        regioes = []  # (codigo, nome, tipo, geometria, costa)
        partes_continente = _partes_por_continente(paises)
        for continente, (codigo, nome) in CONTINENTES.items():
            uniao = unary_union(partes_continente[continente])
            regioes.append((codigo, nome, Regiao.Tipo.CONTINENTE, uniao, uniao.buffer(FAIXA_COSTA)))
        for (codigo, nome), nomes in OCEANOS.items():
            partes = [make_valid(shape(f["geometry"])) for f in mares
                      if (f["properties"].get("name") or "").lower() in nomes]
            if not partes:
                raise CommandError(f"Nenhum polígono para {nome} em {PASTA}.")
            regioes.append((codigo, nome, Regiao.Tipo.OCEANO, unary_union(partes), None))

        for ordem, (codigo, nome, tipo, geometria, costa) in enumerate(regioes):
            Regiao.objects.update_or_create(codigo=codigo, defaults={
                "nome": nome, "tipo": tipo, "ordem": ordem,
                "geometria": _geojson(geometria, 0.05),
                "costa": _geojson(costa, 0.1) if costa is not None else {},
                "caixas": _caixas(costa if costa is not None else geometria),
            })
        removidas, _ = Regiao.objects.exclude(codigo__in=[r[0] for r in regioes]).delete()
        self.stdout.write(f"{len(regioes)} regiões no banco ({removidas} objetos antigos removidos).")

        self.stdout.write("Classificando os terremotos por região...")
        contagem = zonas.reclassificar()
        for regiao in Regiao.objects.order_by("ordem"):
            self.stdout.write(f"  {regiao.nome}: {contagem.get(regiao.codigo, 0)}")
        if contagem.get(""):
            self.stdout.write(f"  (sem região: {contagem['']})")
        self.stdout.write(self.style.SUCCESS("Pronto."))
