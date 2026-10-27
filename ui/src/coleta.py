"""
Coleta de terremotos do catálogo ComCat (USGS).

Os filtros ficam definidos no bloco CONFIGURAÇÃO logo abaixo.
Para coletar, basta rodar, a partir da raiz do projeto:

    python src/coleta.py

O script baixa os eventos em GeoJSON, contorna o limite de 20.000 eventos por
consulta dividindo o período em janelas menores e salva o resultado em data/raw/.
"""

import json
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pandas as pd
import requests

# =============================================================================
# CONFIGURAÇÃO DA COLETA — altere aqui os filtros
# =============================================================================
REGIAO = "japao"        # "global" ou uma das chaves de REGIOES abaixo
MAGNITUDE_MINIMA = None  # None = todas as magnitudes; ou um número, ex.: 5.0
ANOS = 3                # quantos anos para trás, a partir de hoje
FORMATO = "csv"         # "csv", "geojson" ou "ambos"

# Recortes regionais: (lat_min, lat_max, lon_min, lon_max)
REGIOES = {
    "chile":      (-56, -17, -76, -66),
    "japao":      (24, 46, 122, 146),
    "indonesia":  (-11, 6, 95, 141),
    "california": (32, 42, -125, -114),
}
# =============================================================================

URL_BASE = "https://earthquake.usgs.gov/fdsnws/event/1"
LIMITE_API = 20_000          # máximo de eventos que a API devolve por consulta
TENTATIVAS = 3               # novas tentativas em caso de falha de rede

# Pasta de saída: <raiz do projeto>/data/raw, independente de onde o script é chamado
PASTA_RAW = Path(__file__).resolve().parent.parent / "data" / "raw"

# Campos de "properties" que serão mantidos
CAMPOS = [
    "mag", "magType", "time", "updated", "place", "tsunami", "alert", "sig",
    "felt", "cdi", "mmi", "nst", "gap", "dmin", "rms", "status", "net", "type",
]


# ----------------------------------------------------------------------------
# Comunicação com a API
# ----------------------------------------------------------------------------
def _get(metodo: str, params: dict) -> requests.Response:
    """GET na API com novas tentativas. Erros 4xx não são repetidos."""
    for tentativa in range(1, TENTATIVAS + 1):
        try:
            resp = requests.get(f"{URL_BASE}/{metodo}", params=params, timeout=180)
            if 400 <= resp.status_code < 500:
                # erro do pedido (parâmetro inválido, limite excedido): repetir não resolve
                raise ValueError(f"API respondeu {resp.status_code}: {resp.text[:300]}")
            resp.raise_for_status()
            return resp
        except (requests.ConnectionError, requests.Timeout, requests.HTTPError) as erro:
            if tentativa == TENTATIVAS:
                raise
            espera = 5 * tentativa
            print(f"  falha ({erro.__class__.__name__}), nova tentativa em {espera}s...")
            time.sleep(espera)


def _params(inicio: datetime, fim: datetime, minmag: float | None, regiao: str) -> dict:
    """Monta os parâmetros comuns às chamadas de count e query."""
    params = {
        "starttime": inicio.strftime("%Y-%m-%dT%H:%M:%S"),
        "endtime": fim.strftime("%Y-%m-%dT%H:%M:%S"),
        "eventtype": "earthquake",
    }
    if minmag is not None:
        # sem minmagnitude a API devolve todas as magnitudes, inclusive as negativas
        params["minmagnitude"] = minmag
    if regiao != "global":
        lat_min, lat_max, lon_min, lon_max = REGIOES[regiao]
        params.update(minlatitude=lat_min, maxlatitude=lat_max,
                      minlongitude=lon_min, maxlongitude=lon_max)
    return params


def contar(inicio, fim, minmag, regiao) -> int:
    """Quantos eventos a consulta retornaria (sem baixar os dados)."""
    return int(_get("count", _params(inicio, fim, minmag, regiao)).text)


def baixar_janela(inicio, fim, minmag, regiao) -> list[dict]:
    """
    Baixa as features GeoJSON de uma janela de tempo.
    Se a janela passar do limite da API, divide ao meio e baixa cada metade.
    """
    total = contar(inicio, fim, minmag, regiao)
    if total == 0:
        return []
    if total > LIMITE_API:
        meio = inicio + (fim - inicio) / 2
        return (baixar_janela(inicio, meio, minmag, regiao)
                + baixar_janela(meio, fim, minmag, regiao))

    params = _params(inicio, fim, minmag, regiao) | {"format": "geojson"}
    features = _get("query", params).json()["features"]
    print(f"  {inicio:%Y-%m-%d} a {fim:%Y-%m-%d}: {len(features)} eventos")
    return features


# ----------------------------------------------------------------------------
# Conversão
# ----------------------------------------------------------------------------
def features_para_dataframe(features: list[dict]) -> pd.DataFrame:
    """
    Achata as features GeoJSON em uma tabela.
    geometry.coordinates vem na ordem [longitude, latitude, profundidade].
    """
    linhas = []
    for f in features:
        lon, lat, prof = f["geometry"]["coordinates"]
        props = f["properties"]
        linha = {"id": f["id"]}
        linha.update({campo: props.get(campo) for campo in CAMPOS})
        linha.update(longitude=lon, latitude=lat, depth=prof)
        linhas.append(linha)

    df = pd.DataFrame(linhas)
    if not df.empty:
        # eventos na borda entre duas janelas podem vir duas vezes
        df = df.drop_duplicates(subset="id").sort_values("time").reset_index(drop=True)
    return df


# ----------------------------------------------------------------------------
# Orquestração
# ----------------------------------------------------------------------------
def coletar(anos: int, minmag: float | None, regiao: str):
    """Baixa o período inteiro, ano a ano, e devolve (features, DataFrame)."""
    fim = datetime.now(timezone.utc).replace(microsecond=0, tzinfo=None)
    inicio = fim - timedelta(days=365 * anos)

    features = []
    janela_inicio = inicio
    while janela_inicio < fim:
        janela_fim = min(janela_inicio + timedelta(days=365), fim)
        features += baixar_janela(janela_inicio, janela_fim, minmag, regiao)
        janela_inicio = janela_fim

    return features, features_para_dataframe(features)


def salvar(nome: str, features: list[dict], df: pd.DataFrame, formato: str) -> None:
    """Salva a versão tabular em CSV e/ou o GeoJSON bruto, conforme o formato pedido."""
    PASTA_RAW.mkdir(parents=True, exist_ok=True)
    salvos = []

    if formato in ("csv", "ambos"):
        caminho_csv = PASTA_RAW / f"terremotos_{nome}.csv"
        df.to_csv(caminho_csv, index=False)
        salvos.append(caminho_csv.name)

    if formato in ("geojson", "ambos"):
        # remove duplicatas também do GeoJSON, mantendo a mesma base do CSV
        unicos = list({f["id"]: f for f in features}.values())
        caminho_geo = PASTA_RAW / f"terremotos_{nome}.geojson"
        with open(caminho_geo, "w", encoding="utf-8") as arq:
            json.dump({"type": "FeatureCollection", "features": unicos}, arq)
        salvos.append(caminho_geo.name)

    positivos = int(df["tsunami"].fillna(0).sum()) if not df.empty else 0
    print(f"  salvo: {' e '.join(salvos)} ({len(df)} eventos, {positivos} com alerta de tsunami)")


def validar_configuracao() -> None:
    """Confere a configuração antes de chamar a API, com mensagens claras."""
    if REGIAO != "global" and REGIAO not in REGIOES:
        raise ValueError(f"REGIAO inválida: {REGIAO!r}. Use 'global' ou {list(REGIOES)}.")
    if FORMATO not in ("csv", "geojson", "ambos"):
        raise ValueError(f"FORMATO inválido: {FORMATO!r}. Use 'csv', 'geojson' ou 'ambos'.")
    if not isinstance(ANOS, int) or ANOS < 1:
        raise ValueError(f"ANOS deve ser um inteiro maior que zero, recebido: {ANOS!r}.")


def nome_base() -> str:
    """Nome dos arquivos de saída; registra os filtros para uma coleta não sobrescrever outra."""
    rotulo_mag = "todas" if MAGNITUDE_MINIMA is None else f"{MAGNITUDE_MINIMA:g}"
    return f"{REGIAO}_m{rotulo_mag}_{ANOS}anos"


def arquivo_saida() -> Path:
    """Caminho do arquivo principal gerado pela configuração atual."""
    extensao = "geojson" if FORMATO == "geojson" else "csv"
    return PASTA_RAW / f"terremotos_{nome_base()}.{extensao}"


def executar() -> pd.DataFrame:
    """Roda a coleta com a configuração do topo do arquivo, salva e devolve os dados."""
    validar_configuracao()
    filtro_mag = "todas as magnitudes" if MAGNITUDE_MINIMA is None else f"M >= {MAGNITUDE_MINIMA:g}"
    print(f"[{REGIAO}] {filtro_mag}, últimos {ANOS} anos, formato {FORMATO}")

    features, df = coletar(ANOS, MAGNITUDE_MINIMA, REGIAO)
    salvar(nome_base(), features, df, FORMATO)
    return df


def carregar_ou_coletar(forcar: bool = False) -> pd.DataFrame:
    """
    Usa o arquivo já baixado, se existir; senão, roda a coleta.
    Com forcar=True, sempre baixa de novo (para atualizar os dados).
    """
    caminho = arquivo_saida()
    if caminho.exists() and not forcar:
        if caminho.suffix == ".csv":
            return pd.read_csv(caminho)
        with open(caminho, encoding="utf-8") as arq:
            return features_para_dataframe(json.load(arq)["features"])
    return executar()


if __name__ == "__main__":
    executar()