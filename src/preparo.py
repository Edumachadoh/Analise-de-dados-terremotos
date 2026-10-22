"""
Leitura e preparo dos dados.

Lê arquivos .csv, .xml ou .json enviados pelo usuário e devolve um DataFrame
limpo, pronto para os gráficos e para o machine learning.
"""

import json
from pathlib import Path

import pandas as pd

EXTENSOES = ("csv", "xml", "json")


def ler_arquivo(arquivo, nome: str) -> pd.DataFrame:
    """
    Lê um arquivo (caminho ou objeto de upload) conforme a extensão do nome.
    Levanta ValueError se o formato não for suportado ou o conteúdo for inválido.
    """
    extensao = Path(nome).suffix.lower().lstrip(".")
    if extensao not in EXTENSOES:
        raise ValueError(f"Formato .{extensao} não suportado. Use CSV, XML ou JSON.")

    try:
        if extensao == "csv":
            df = pd.read_csv(arquivo, sep=None, engine="python")  # detecta , ou ;
        elif extensao == "xml":
            df = pd.read_xml(arquivo)
        else:
            df = _ler_json(arquivo)
    except Exception as erro:
        raise ValueError(f"Não foi possível ler {nome}: {erro}") from erro

    if df.empty:
        raise ValueError("O arquivo não tem nenhuma linha de dados.")
    return df


def _ler_json(arquivo) -> pd.DataFrame:
    """
    Aceita uma lista de registros, um objeto com uma lista dentro
    ou um GeoJSON (achata properties e coordenadas).
    """
    conteudo = arquivo.read() if hasattr(arquivo, "read") else Path(arquivo).read_bytes()
    dados = json.loads(conteudo)

    if isinstance(dados, dict) and "features" in dados:  # GeoJSON
        linhas = []
        for f in dados["features"]:
            linha = dict(f.get("properties", {}))
            coords = (f.get("geometry") or {}).get("coordinates") or []
            for nome, valor in zip(("longitude", "latitude", "depth"), coords):
                linha[nome] = valor
            linhas.append(linha)
        return pd.DataFrame(linhas)

    if isinstance(dados, dict):  # procura a primeira lista de registros
        for valor in dados.values():
            if isinstance(valor, list):
                return pd.json_normalize(valor)
    return pd.json_normalize(dados)


def preparar(df: pd.DataFrame) -> pd.DataFrame:
    """
    Limpeza leve: remove duplicadas, converte colunas de data
    (inclusive tempo em milissegundos, como vem do USGS) e texto numérico.
    """
    df = df.drop_duplicates().copy()

    for col in df.columns:
        if df[col].dtype != object:
            if col.lower() in ("time", "updated") and pd.api.types.is_integer_dtype(df[col]):
                df[col] = pd.to_datetime(df[col], unit="ms", errors="coerce")
            continue
        convertido = pd.to_numeric(df[col], errors="coerce")
        if convertido.notna().mean() > 0.9:  # coluna numérica salva como texto
            df[col] = convertido
        elif any(k in col.lower() for k in ("date", "data", "time")):
            datas = pd.to_datetime(df[col], errors="coerce")
            if datas.notna().mean() > 0.9:
                df[col] = datas
    return df


def colunas_numericas(df: pd.DataFrame) -> list[str]:
    return df.select_dtypes("number").columns.tolist()


def colunas_categoricas(df: pd.DataFrame, max_valores: int = 30) -> list[str]:
    """Colunas de texto ou com poucos valores distintos (boas para barras e pizza)."""
    cols = []
    for col in df.columns:
        if pd.api.types.is_datetime64_any_dtype(df[col]):
            continue
        if df[col].dtype == object or df[col].nunique() <= max_valores:
            if 1 < df[col].nunique() <= max_valores:
                cols.append(col)
    return cols


def colunas_data(df: pd.DataFrame) -> list[str]:
    return [c for c in df.columns if pd.api.types.is_datetime64_any_dtype(df[c])]


def detectar_coordenadas(df: pd.DataFrame) -> tuple[str, str] | None:
    """Acha as colunas de latitude e longitude pelo nome, se existirem."""
    nomes = {c.lower(): c for c in df.columns}
    for lat, lon in (("latitude", "longitude"), ("lat", "lon"), ("lat", "lng")):
        if lat in nomes and lon in nomes:
            return nomes[lat], nomes[lon]
    return None


def resumo(df: pd.DataFrame) -> pd.DataFrame:
    """Tabela com tipo, nulos e valores distintos de cada coluna."""
    return pd.DataFrame({
        "tipo": df.dtypes.astype(str),
        "nulos": df.isna().sum(),
        "% nulos": (df.isna().mean() * 100).round(1),
        "distintos": df.nunique(),
    })
