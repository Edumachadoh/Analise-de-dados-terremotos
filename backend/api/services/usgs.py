"""
Cliente da API do USGS (FDSN Event Web Service).

Responsável só pela comunicação HTTP: monta os parâmetros, faz as requisições
e contorna o limite de 20.000 eventos por consulta dividindo o período.
Não sabe nada sobre o banco de dados; quem grava é o serviço de importação.
"""

import time
from datetime import datetime, timedelta, timezone

import requests
from django.conf import settings

LIMITE_API = 20_000   # máximo de eventos que a API devolve por consulta
TENTATIVAS = 3        # novas tentativas em falhas de rede
TIMEOUT = 180         # segundos


class ErroUSGS(Exception):
    """Falha ao consultar a API do USGS."""


# Faz o GET na API do USGS, com novas tentativas em falhas de rede
def _get(metodo: str, params: dict) -> requests.Response:
    """GET com novas tentativas. Erros 4xx não são repetidos: o pedido está errado."""
    url = f"{settings.USGS_URL}/{metodo}"
    for tentativa in range(1, TENTATIVAS + 1):
        try:
            resp = requests.get(url, params=params, timeout=TIMEOUT)
        except (requests.ConnectionError, requests.Timeout) as erro:
            if tentativa == TENTATIVAS:
                raise ErroUSGS(f"USGS inacessível: {erro}") from erro
            time.sleep(5 * tentativa)
            continue

        if 400 <= resp.status_code < 500:
            raise ErroUSGS(f"USGS respondeu {resp.status_code}: {resp.text[:300]}")
        if resp.status_code >= 500:
            if tentativa == TENTATIVAS:
                raise ErroUSGS(f"USGS respondeu {resp.status_code}")
            time.sleep(5 * tentativa)
            continue
        return resp


# Monta os parâmetros da consulta: período, magnitude mínima e recorte geográfico
def _params(inicio: datetime, fim: datetime, magnitude_minima: float | None,
            limites: tuple | None = None) -> dict:
    # limites = uma caixa (lat_min, lat_max, lon_min, lon_max); sem ela, vale settings.REGIAO_ANALISE
    lat_min, lat_max, lon_min, lon_max = limites or settings.REGIAO_ANALISE
    params = {
        "starttime": inicio.strftime("%Y-%m-%dT%H:%M:%S"),
        "endtime": fim.strftime("%Y-%m-%dT%H:%M:%S"),
        "eventtype": "earthquake",
        "minlatitude": lat_min, "maxlatitude": lat_max,
        "minlongitude": lon_min, "maxlongitude": lon_max,
    }
    if magnitude_minima is not None:
        # sem minmagnitude, a API devolve todas as magnitudes
        params["minmagnitude"] = magnitude_minima
    return params


# Conta quantos eventos a consulta devolveria, sem baixá-los
def contar(inicio, fim, magnitude_minima=None, limites=None) -> int:
    """Quantos eventos a consulta devolveria, sem baixá-los."""
    return int(_get("count", _params(inicio, fim, magnitude_minima, limites)).text)


# Baixa uma janela de tempo, dividindo-a ao meio se passar do limite da API
def _baixar_janela(inicio, fim, magnitude_minima, limites=None) -> list[dict]:
    """Baixa uma janela; se passar do limite da API, divide ao meio (recursão)."""
    total = contar(inicio, fim, magnitude_minima, limites)
    if total == 0:
        return []
    if total > LIMITE_API:
        meio = inicio + (fim - inicio) / 2
        return (_baixar_janela(inicio, meio, magnitude_minima, limites)
                + _baixar_janela(meio, fim, magnitude_minima, limites))
    params = _params(inicio, fim, magnitude_minima, limites) | {"format": "geojson"}
    return _get("query", params).json()["features"]


# Baixa os terremotos dos últimos anos, no recorte padrão ou nas caixas dadas
def buscar_terremotos(anos: int, magnitude_minima: float | None = None,
                      caixas: list | None = None) -> list[dict]:
    """Baixa os terremotos dos últimos `anos`, no recorte padrão ou nas `caixas` dadas."""
    fim = datetime.now(timezone.utc).replace(microsecond=0, tzinfo=None)
    return buscar_periodo(fim - timedelta(days=365 * anos), fim, magnitude_minima, caixas)


# Baixa os terremotos de um período, em janelas de um ano
def buscar_periodo(inicio: datetime, fim: datetime, magnitude_minima: float | None = None,
                   caixas: list | None = None) -> list[dict]:
    """
    Baixa os terremotos entre `inicio` e `fim` (UTC, sem fuso), em janelas de um ano.
    Sem `caixas`, usa o recorte padrão; com elas, consulta uma por vez.
    Devolve a lista de features GeoJSON, sem duplicatas.
    """
    features = []
    for limites in caixas or [None]:
        janela = inicio
        while janela < fim:
            janela_fim = min(janela + timedelta(days=365), fim)
            features += _baixar_janela(janela, janela_fim, magnitude_minima, limites)
            janela = janela_fim

    # um evento na borda entre duas janelas (ou entre duas caixas) pode vir duas vezes
    return list({f["id"]: f for f in features}.values())
