"""
Classificação dos terremotos em regiões (continentes e oceanos).

Cada Regiao tem um polígono. Para um terremoto:
1. dentro de um continente: é daquele continente;
2. no mar, mas na faixa de ~200 km de costa (Regiao.costa) de algum continente: é do continente
   mais próximo dentre os que alcançam o ponto;
3. no mar aberto: é do oceano que contém o ponto (ou o mais próximo, nos mares que os polígonos
   dos oceanos não cobrem). O resultado fica em Terremoto.zona.

O teste ponto-em-polígono usa o shapely, em lote: a base inteira é classificada em segundos.
"""

import numpy as np
import shapely
from shapely.geometry import shape

from ..models import Regiao, Terremoto

LOTE_ATUALIZACAO = 20_000  # ids por UPDATE (o SQLite aceita até 32.766 variáveis por consulta)


def _preparar(geojson):
    geometria = shape(geojson)
    shapely.prepare(geometria)
    return geometria


class Classificador:
    """Os polígonos das regiões, prontos para testar muitos pontos de uma vez."""

    def __init__(self, regioes=None):
        regioes = list(Regiao.objects.order_by("ordem") if regioes is None else regioes)
        self.continentes = [(r.codigo, _preparar(r.geometria), _preparar(r.costa or r.geometria))
                            for r in regioes if r.tipo == Regiao.Tipo.CONTINENTE and r.geometria]
        self.oceanos = [(r.codigo, _preparar(r.geometria))
                        for r in regioes if r.tipo == Regiao.Tipo.OCEANO and r.geometria]

    def classificar(self, latitudes, longitudes) -> np.ndarray:
        """Código da região de cada ponto ("" se não houver nenhuma que sirva)."""
        x = np.asarray(longitudes, dtype=float)
        y = np.asarray(latitudes, dtype=float)
        zonas = np.full(len(x), "", dtype=object)
        livres = np.ones(len(x), dtype=bool)

        # 1. dentro de um continente
        for codigo, geometria, _ in self.continentes:
            dentro = livres & shapely.intersects_xy(geometria, x, y)
            zonas[dentro] = codigo
            livres &= ~dentro

        # 2. no mar, perto da costa: o continente mais próximo dentre os que alcançam o ponto
        if livres.any() and self.continentes:
            melhor = np.full(len(x), np.inf)
            for codigo, geometria, costa in self.continentes:
                candidatos = livres & shapely.intersects_xy(costa, x, y)
                if not candidatos.any():
                    continue
                distancia = shapely.distance(shapely.points(x[candidatos], y[candidatos]), geometria)
                indices = np.flatnonzero(candidatos)
                mais_perto = distancia < melhor[indices]
                zonas[indices[mais_perto]] = codigo
                melhor[indices[mais_perto]] = distancia[mais_perto]
            livres &= zonas == ""

        # 3. mar aberto: o oceano que contém o ponto, ou o mais próximo
        if livres.any() and self.oceanos:
            for codigo, geometria in self.oceanos:
                dentro = livres & shapely.intersects_xy(geometria, x, y)
                zonas[dentro] = codigo
                livres &= ~dentro
            if livres.any():
                indices = np.flatnonzero(livres)
                pontos = shapely.points(x[indices], y[indices])
                distancias = np.array([shapely.distance(pontos, g) for _, g in self.oceanos])
                zonas[indices] = [self.oceanos[i][0] for i in distancias.argmin(axis=0)]
        return zonas

    def zona_do_ponto(self, latitude: float, longitude: float) -> str:
        return str(self.classificar([latitude], [longitude])[0])


def atribuir(terremotos: list[Terremoto]) -> None:
    """Preenche Terremoto.zona dos eventos (ainda não salvos) pelas coordenadas."""
    if not terremotos:
        return
    zonas = Classificador().classificar([t.latitude for t in terremotos],
                                        [t.longitude for t in terremotos])
    for terremoto, zona in zip(terremotos, zonas):
        terremoto.zona = zona


def reclassificar() -> dict[str, int]:
    """
    Recalcula a região de todos os terremotos do banco e devolve quantos há em cada uma.
    Só grava os que mudaram, em lotes de ids, uma região por vez.
    """
    linhas = list(Terremoto.objects.values_list("id", "latitude", "longitude", "zona"))
    if not linhas:
        return {}
    ids, latitudes, longitudes, atuais = (np.array(c, dtype=object if i == 3 else None)
                                          for i, c in enumerate(zip(*linhas)))
    novas = Classificador().classificar(latitudes, longitudes)

    mudaram = novas != atuais
    for codigo in set(novas[mudaram]):
        alvo = ids[mudaram & (novas == codigo)].tolist()
        for i in range(0, len(alvo), LOTE_ATUALIZACAO):
            Terremoto.objects.filter(id__in=alvo[i:i + LOTE_ATUALIZACAO]).update(zona=codigo)
    codigos, quantidades = np.unique(novas.astype(str), return_counts=True)
    return {str(c): int(q) for c, q in zip(codigos, quantidades)}
