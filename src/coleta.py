"""
Coleta de terremotos do catálogo ComCat (USGS).

Baixa os eventos em GeoJSON, contorna o limite de 20.000 eventos por consulta
dividindo o período em janelas menores e salva os dados em data/raw/.

Uso (a partir da raiz do projeto):
    python src/coleta.py                       # global, 10 anos, M >= 5
    python src/coleta.py --regiao chile        # só uma região
    python src/coleta.py --regiao todas        # global + cada região
    python src/coleta.py --anos 5 --minmag 5.5
"""

import argparse
import json
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pandas as pd
import requests

URL_BASE = "https://earthquake.usgs.gov/fdsnws/event/1"
LIMITE_API = 20_000          # máximo de eventos que a API devolve por consulta
TENTATIVAS = 3               # novas tentativas em caso de falha de rede

# Pasta de saída: <raiz do projeto>/data/raw, independente de onde o script é chamado
PASTA_RAW = Path(__file__).resolve().parent.parent / "data" / "raw"

# Recortes regionais: (lat_min, lat_max, lon_min, lon_max)
REGIOES = {
    "chile":      (-56, -17, -76, -66),
    "japao":      (24, 46, 122, 146),
    "indonesia":  (-11, 6, 95, 141),
    "california": (32, 42, -125, -114),
}

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


def _params(inicio: datetime, fim: datetime, minmag: float, regiao: str | None) -> dict:
    """Monta os parâmetros comuns às chamadas de count e query."""
    params = {
        "starttime": inicio.strftime("%Y-%m-%dT%H:%M:%S"),
        "endtime": fim.strftime("%Y-%m-%dT%H:%M:%S"),
        "minmagnitude": minmag,
        "eventtype": "earthquake",
    }
    if regiao:
        lat_min, lat_max, lon_min, lon_max = REGIOES[regiao]
        params.update(minlatitude=lat_min, maxlatitude=lat_max,
                      minlongitude=lon_min, maxlongitude=lon_max)
    return params


def contar(inicio, fim, minmag, regiao=None) -> int:
    """Quantos eventos a consulta retornaria (sem baixar os dados)."""
    return int(_get("count", _params(inicio, fim, minmag, regiao)).text)


def baixar_janela(inicio, fim, minmag, regiao=None) -> list[dict]:
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
def coletar(anos: int = 10, minmag: float = 5.0, regiao: str | None = None):
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


def salvar(nome: str, features: list[dict], df: pd.DataFrame) -> None:
    """Salva o GeoJSON bruto e a versão tabular em CSV."""
    PASTA_RAW.mkdir(parents=True, exist_ok=True)

    # remove duplicatas também do GeoJSON, mantendo a mesma base do CSV
    unicos = list({f["id"]: f for f in features}.values())
    caminho_geo = PASTA_RAW / f"terremotos_{nome}.geojson"
    with open(caminho_geo, "w", encoding="utf-8") as arq:
        json.dump({"type": "FeatureCollection", "features": unicos}, arq)

    caminho_csv = PASTA_RAW / f"terremotos_{nome}.csv"
    df.to_csv(caminho_csv, index=False)

    positivos = int(df["tsunami"].sum()) if not df.empty else 0
    print(f"  salvo: {caminho_csv.name} e {caminho_geo.name} "
          f"({len(df)} eventos, {positivos} com alerta de tsunami)")


def main():
    parser = argparse.ArgumentParser(description="Coleta de terremotos do USGS")
    parser.add_argument("--anos", type=int, default=10, help="anos para trás a partir de hoje")
    parser.add_argument("--minmag", type=float, default=5.0, help="magnitude mínima")
    parser.add_argument("--regiao", default="global",
                        choices=["global", "todas", *REGIOES],
                        help="global, todas (global + regiões) ou uma região")
    args = parser.parse_args()

    if args.regiao == "todas":
        alvos = ["global", *REGIOES]
    else:
        alvos = [args.regiao]

    for alvo in alvos:
        print(f"\n[{alvo}] M >= {args.minmag}, últimos {args.anos} anos")
        features, df = coletar(args.anos, args.minmag, None if alvo == "global" else alvo)
        salvar(alvo, features, df)


if __name__ == "__main__":
    main()