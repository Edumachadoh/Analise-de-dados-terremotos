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


def _params(inicio: datetime, fim: datetime, magnitude_minima: float | None) -> dict:
    lat_min, lat_max, lon_min, lon_max = settings.REGIAO_CHILE
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


def contar(inicio, fim, magnitude_minima=None) -> int:
    """Quantos eventos a consulta devolveria, sem baixá-los."""
    return int(_get("count", _params(inicio, fim, magnitude_minima)).text)


def _baixar_janela(inicio, fim, magnitude_minima) -> list[dict]:
    """Baixa uma janela; se passar do limite da API, divide ao meio (recursão)."""
    total = contar(inicio, fim, magnitude_minima)
    if total == 0:
        return []
    if total > LIMITE_API:
        meio = inicio + (fim - inicio) / 2
        return (_baixar_janela(inicio, meio, magnitude_minima)
                + _baixar_janela(meio, fim, magnitude_minima))
    params = _params(inicio, fim, magnitude_minima) | {"format": "geojson"}
    return _get("query", params).json()["features"]


def buscar_terremotos(anos: int, magnitude_minima: float | None = None) -> list[dict]:
    """
    Baixa os terremotos do Chile dos últimos `anos`, em janelas de um ano.
    Devolve a lista de features GeoJSON, sem duplicatas.
    """
    fim = datetime.now(timezone.utc).replace(microsecond=0, tzinfo=None)
    inicio = fim - timedelta(days=365 * anos)

    features = []
    janela = inicio
    while janela < fim:
        janela_fim = min(janela + timedelta(days=365), fim)
        features += _baixar_janela(janela, janela_fim, magnitude_minima)
        janela = janela_fim

    # um evento na borda entre duas janelas pode vir duas vezes
    return list({f["id"]: f for f in features}.values())
