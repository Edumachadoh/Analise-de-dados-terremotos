"""
Comando para carregar terremotos no banco.

    python manage.py importar_terremotos                     # USGS, últimos 3 anos
    python manage.py importar_terremotos --anos 6            # USGS, últimos 6 anos
    python manage.py importar_terremotos --magnitude-minima 4.5
    python manage.py importar_terremotos --arquivo data/raw/terremotos_global_m2.5_3anos.csv
"""

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from api.services import importacao
from api.services.usgs import ErroUSGS


class Command(BaseCommand):
    help = "Importa terremotos do mundo inteiro a partir da API do USGS ou de um CSV."

    def add_arguments(self, parser):
        parser.add_argument("--anos", type=int, default=settings.ANOS_COLETA_PADRAO,
                            help="anos para trás, a partir de hoje (padrão: %(default)s)")
        parser.add_argument("--magnitude-minima", type=float, default=None,
                            help="magnitude mínima (padrão: %s)" % settings.MAGNITUDE_MINIMA_COLETA)
        parser.add_argument("--arquivo", default=None,
                            help="CSV com as colunas do USGS, em vez da API")

    def handle(self, *args, **opcoes):
        try:
            if opcoes["arquivo"]:
                self.stdout.write(f"Importando {opcoes['arquivo']}...")
                coleta = importacao.importar_csv(opcoes["arquivo"], anos=opcoes["anos"])
            else:
                self.stdout.write(f"Buscando no USGS os últimos {opcoes['anos']} anos...")
                coleta = importacao.importar_do_usgs(opcoes["anos"], opcoes["magnitude_minima"])
        except (ErroUSGS, ValueError, FileNotFoundError) as erro:
            raise CommandError(str(erro)) from erro

        self.stdout.write(self.style.SUCCESS(
            f"Coleta {coleta.pk}: {coleta.recebidos} recebidos, "
            f"{coleta.novos} novos, {coleta.atualizados} atualizados."
        ))
