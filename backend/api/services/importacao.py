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
    existentes = dict(Terremoto.objects.filter(usgs_id__in=ids).values_list("usgs_id", "id"))

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
    """Busca os terremotos do Japão dos últimos `anos` na API do USGS e grava."""
    coleta = Coleta.objects.create(anos=anos, magnitude_minima=magnitude_minima)
    return _executar(
        coleta,
        lambda: [registro_de_feature(f) for f in usgs.buscar_terremotos(anos, magnitude_minima)],
    )


def importar_csv(caminho, anos: int = 0) -> Coleta:
    """
    Importa o CSV gerado pela coleta do projeto (mesmas colunas do USGS).
    Útil para carregar a base sem depender da API.
    """
    def ler():
        df = pd.read_csv(caminho)
        faltando = {"id", "mag", "time", "latitude", "longitude", "depth"} - set(df.columns)
        if faltando:
            raise ValueError(f"Colunas ausentes no CSV: {sorted(faltando)}")
        return df.to_dict("records")

    coleta = Coleta.objects.create(anos=max(anos, 1), origem=Path(caminho).name[:20])
    return _executar(coleta, ler)
