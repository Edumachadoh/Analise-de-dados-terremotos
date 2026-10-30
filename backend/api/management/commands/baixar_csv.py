"""
Comando para baixar um período do USGS e salvar em CSV, sem gravar no banco.
O arquivo gerado pode ser enviado depois pelo upload (POST /api/coletas/upload/).

    python manage.py baixar_csv --de 6 --ate 3          # de 6 a 3 anos atrás
    python manage.py baixar_csv --de 6 --ate 3 --magnitude-minima 4.0

As colunas são as mesmas dos arquivos em data/raw/. As colunas time e updated
saem como data ISO em UTC, no formato da tabela api_terremoto
(ex.: "2024-04-29 14:11:19.731000").
"""

from datetime import datetime, timedelta, timezone

import pandas as pd
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from api.services import usgs
from api.services.importacao import ms_em_texto

# Mesma ordem de colunas dos CSVs em data/raw/
COLUNAS = ["id", "mag", "magType", "time", "updated", "place", "tsunami", "alert", "sig",
           "felt", "cdi", "mmi", "nst", "gap", "dmin", "rms", "status", "net", "type",
           "longitude", "latitude", "depth"]


class Command(BaseCommand):
    help = "Baixa os terremotos de um período do USGS e salva em CSV na pasta data/."

    def add_arguments(self, parser):
        parser.add_argument("--de", type=int, required=True,
                            help="início do período, em anos atrás (ex.: 6)")
        parser.add_argument("--ate", type=int, required=True,
                            help="fim do período, em anos atrás (ex.: 3)")
        parser.add_argument("--magnitude-minima", type=float,
                            default=settings.MAGNITUDE_MINIMA_COLETA,
                            help="magnitude mínima (padrão: %(default)s)")

    def handle(self, *args, **opcoes):
        de, ate, magnitude = opcoes["de"], opcoes["ate"], opcoes["magnitude_minima"]
        if de <= ate:
            raise CommandError("--de deve ser maior que --ate (ex.: --de 6 --ate 3).")

        agora = datetime.now(timezone.utc).replace(microsecond=0, tzinfo=None)
        inicio, fim = agora - timedelta(days=365 * de), agora - timedelta(days=365 * ate)
        self.stdout.write(f"Buscando no USGS de {inicio:%Y-%m-%d} a {fim:%Y-%m-%d}, "
                          f"M >= {magnitude:g}...")
        try:
            features = usgs.buscar_periodo(inicio, fim, magnitude)
        except usgs.ErroUSGS as erro:
            raise CommandError(str(erro)) from erro

        linhas = []
        for f in features:
            lon, lat, prof = f["geometry"]["coordinates"]
            linha = {"id": f["id"], **f["properties"], "longitude": lon, "latitude": lat,
                     "depth": prof}
            linhas.append({coluna: linha.get(coluna) for coluna in COLUNAS})
        df = pd.DataFrame(linhas, columns=COLUNAS).sort_values("time")
        df["time"] = df["time"].map(ms_em_texto)
        df["updated"] = df["updated"].map(ms_em_texto)

        pasta = settings.BASE_DIR / "data"
        pasta.mkdir(exist_ok=True)
        caminho = pasta / f"terremotos_global_m{magnitude:g}_{de}a{ate}anos.csv"
        df.to_csv(caminho, index=False)
        self.stdout.write(self.style.SUCCESS(f"{len(df)} terremotos salvos em {caminho}"))
