"""
Importação de terremotos para o banco.

Converte os dados do USGS (GeoJSON da API ou o CSV gerado pela coleta) em
objetos Terremoto e grava no banco. Cada importação gera um registro de Coleta,
com a contagem de eventos novos e atualizados.
"""

import math
from pathlib import Path
from datetime import datetime, timezone

import pandas as pd
from django.conf import settings
from django.db import transaction
from django.utils import timezone as dj_timezone

from ..models import Coleta, Terremoto
from . import usgs

# Campos atualizados quando o evento já existe no banco (o USGS revisa eventos)
CAMPOS_ATUALIZAVEIS = [
    "local", "latitude", "longitude", "profundidade_km", "magnitude", "tipo_magnitude",
    "data_hora", "atualizado_em", "tsunami", "alerta", "significancia", "relatos",
    "intensidade_relatada", "intensidade_estimada", "estacoes", "lacuna_azimutal",
    "distancia_estacao", "rms", "status", "rede",
]

LOTE_CONSULTA = 10_000  # ids por consulta ao verificar quais eventos já existem

# Colunas que um CSV precisa ter para ser importado (nomes do USGS)
COLUNAS_OBRIGATORIAS = {"id", "mag", "time", "latitude", "longitude", "depth"}


# -----------------------------------------------------------------------------
# Conversão
# -----------------------------------------------------------------------------
def _vazio(valor) -> bool:
    return valor is None or (isinstance(valor, float) and math.isnan(valor))


def _num(valor, tipo=float):
    return None if _vazio(valor) else tipo(valor)


def _data_ms(valor):
    """O USGS manda o tempo em milissegundos desde 1970, em UTC."""
    if _vazio(valor):
        return None
    return datetime.fromtimestamp(int(valor) / 1000, tz=timezone.utc)


def _texto(valor) -> str:
    return "" if _vazio(valor) else str(valor)


def tempo_em_ms(serie: pd.Series) -> pd.Series:
    """
    Converte uma coluna de tempo para milissegundos desde 1970 (UTC).
    Aceita os dois formatos: milissegundos (como vem da API do USGS) ou data
    ISO (ex.: "2024-04-29 14:11:19.731000", como no banco). Data sem fuso é UTC.
    Valores que não são nenhum dos dois viram NaN.
    """
    numerico = pd.to_numeric(serie, errors="coerce")
    texto = serie.where(numerico.isna() & serie.notna())
    datas = pd.to_datetime(texto, utc=True, errors="coerce", format="ISO8601")
    ms = (datas - pd.Timestamp(0, tz="UTC")) // pd.Timedelta(milliseconds=1)
    return numerico.fillna(ms)


def ms_em_texto(valor) -> str:
    """Milissegundos desde 1970 -> data ISO em UTC, no formato do banco."""
    data = _data_ms(valor)
    return "" if data is None else data.replace(tzinfo=None).isoformat(sep=" ", timespec="microseconds")


def terremoto_de_registro(reg: dict) -> Terremoto:
    """
    Cria um Terremoto (ainda não salvo) a partir de um registro com os nomes
    de campo do USGS: id, mag, time, place, longitude, latitude, depth etc.
    """
    alerta = _texto(reg.get("alert")) or None
    return Terremoto(
        usgs_id=str(reg["id"]),
        local=_texto(reg.get("place"))[:255],
        latitude=float(reg["latitude"]),
        longitude=float(reg["longitude"]),
        profundidade_km=float(reg["depth"]),
        magnitude=float(reg["mag"]),
        tipo_magnitude=_texto(reg.get("magType")),
        data_hora=_data_ms(reg["time"]),
        atualizado_em=_data_ms(reg.get("updated")),
        tsunami=bool(_num(reg.get("tsunami"), int) or 0),
        alerta=alerta if alerta in Terremoto.Alerta.values else None,
        significancia=_num(reg.get("sig"), int),
        relatos=_num(reg.get("felt"), int),
        intensidade_relatada=_num(reg.get("cdi")),
        intensidade_estimada=_num(reg.get("mmi")),
        estacoes=_num(reg.get("nst"), int),
        lacuna_azimutal=_num(reg.get("gap")),
        distancia_estacao=_num(reg.get("dmin")),
        rms=_num(reg.get("rms")),
        status=_texto(reg.get("status")),
        rede=_texto(reg.get("net")),
    )


def registro_de_feature(feature: dict) -> dict:
    """Achata uma feature GeoJSON. coordinates = [longitude, latitude, profundidade]."""
    lon, lat, prof = feature["geometry"]["coordinates"]
    return {"id": feature["id"], **feature["properties"],
            "longitude": lon, "latitude": lat, "depth": prof}


# -----------------------------------------------------------------------------
# Gravação
# -----------------------------------------------------------------------------
@transaction.atomic
def salvar_terremotos(terremotos: list[Terremoto]) -> tuple[int, int]:
    """
    Insere os eventos novos e atualiza os existentes, comparando pelo usgs_id.
    Usa bulk_create/bulk_update: poucas consultas mesmo com milhares de eventos.
    Devolve (novos, atualizados).
    """
    ids = [t.usgs_id for t in terremotos]
    # Consulta em lotes: o SQLite aceita no máximo 32.766 variáveis por consulta
    existentes = {}
    for i in range(0, len(ids), LOTE_CONSULTA):
        existentes.update(Terremoto.objects.filter(usgs_id__in=ids[i:i + LOTE_CONSULTA])
                          .values_list("usgs_id", "id"))

    novos, atualizar = [], []
    for t in terremotos:
        if t.usgs_id in existentes:
            t.pk = existentes[t.usgs_id]
            atualizar.append(t)
        else:
            novos.append(t)

    Terremoto.objects.bulk_create(novos, batch_size=500)
    Terremoto.objects.bulk_update(atualizar, CAMPOS_ATUALIZAVEIS, batch_size=500)
    return len(novos), len(atualizar)


def _executar(coleta: Coleta, obter_registros) -> Coleta:
    """Roda a importação e registra o resultado (ou o erro) na Coleta."""
    try:
        registros = obter_registros()
        terremotos = [terremoto_de_registro(r) for r in registros]
        novos, atualizados = salvar_terremotos(terremotos)
        coleta.recebidos = len(terremotos)
        coleta.novos, coleta.atualizados = novos, atualizados
        coleta.status = Coleta.Status.CONCLUIDA
    except Exception as erro:
        coleta.status = Coleta.Status.ERRO
        coleta.mensagem = str(erro)[:2000]
        erro.coleta = coleta  # a view usa para devolver o registro do erro
        raise
    finally:
        coleta.finalizada_em = dj_timezone.now()
        coleta.save()
    return coleta


def importar_do_usgs(anos: int, magnitude_minima: float | None = None) -> Coleta:
    """
    Busca os terremotos do mundo inteiro dos últimos `anos` na API do USGS e grava.
    Sem magnitude_minima, usa settings.MAGNITUDE_MINIMA_COLETA.
    """
    if magnitude_minima is None:
        magnitude_minima = settings.MAGNITUDE_MINIMA_COLETA
    coleta = Coleta.objects.create(anos=anos, magnitude_minima=magnitude_minima)
    return _executar(
        coleta,
        lambda: [registro_de_feature(f) for f in usgs.buscar_terremotos(anos, magnitude_minima)],
    )


def ler_csv(arquivo, magnitude_minima: float | None = None) -> tuple[list[dict], int]:
    """
    Lê um CSV com as colunas do USGS (as mesmas de data/raw/) e devolve
    (registros válidos, quantidade de linhas descartadas).

    Descarta as linhas sem os campos obrigatórios, com coordenadas fora da faixa
    ou abaixo da magnitude mínima. Erros de formato viram ValueError.
    """
    try:
        df = pd.read_csv(arquivo)
    except (pd.errors.ParserError, pd.errors.EmptyDataError, UnicodeDecodeError) as erro:
        raise ValueError(f"Não foi possível ler o CSV: {erro}") from erro

    faltando = COLUNAS_OBRIGATORIAS - set(df.columns)
    if faltando:
        raise ValueError(f"Colunas ausentes no CSV: {sorted(faltando)}")

    total = len(df)
    df = df.dropna(subset=sorted(COLUNAS_OBRIGATORIAS))
    for coluna in ("mag", "latitude", "longitude", "depth"):
        df[coluna] = pd.to_numeric(df[coluna], errors="coerce")
    df["time"] = tempo_em_ms(df["time"])
    if "updated" in df.columns:
        df["updated"] = tempo_em_ms(df["updated"])
    df = df.dropna(subset=["mag", "time", "latitude", "longitude", "depth"])
    df = df[df["latitude"].between(-90, 90) & df["longitude"].between(-180, 180)
            & df["mag"].between(-2, 10)]
    if "type" in df.columns:
        df = df[df["type"].fillna("earthquake") == "earthquake"]
    if magnitude_minima is not None:
        df = df[df["mag"] >= magnitude_minima]
    df = df.drop_duplicates(subset="id", keep="last")
    return df.to_dict("records"), total - len(df)


def importar_csv(arquivo, anos: int = 0, magnitude_minima: float | None = None,
                 nome: str | None = None) -> Coleta:
    """
    Importa um CSV com as colunas do USGS. `arquivo` pode ser um caminho
    (comando importar_terremotos) ou um arquivo enviado pela API (upload).
    """
    nome = nome or Path(str(arquivo)).name
    coleta = Coleta.objects.create(anos=max(anos, 1), magnitude_minima=magnitude_minima,
                                   origem=nome[:20])

    def ler():
        registros, descartados = ler_csv(arquivo, magnitude_minima)
        if descartados:
            coleta.mensagem = f"{descartados} linha(s) descartada(s) por dados inválidos, " \
                              "tipo diferente de terremoto ou magnitude abaixo da mínima."
        return registros

    return _executar(coleta, ler)
