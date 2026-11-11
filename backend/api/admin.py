# Importa o módulo de administração do Django,
# responsável por disponibilizar a interface de gerenciamento dos dados.
from django.contrib import admin

from .models import Coleta, ModeloTreinado, Regiao, Terremoto


 # Define as informações que serão exibidas na listagem das regiões,
 # facilitando a identificação e a consulta dos registros.
@admin.register(Regiao)
class RegiaoAdmin(admin.ModelAdmin):
    list_display = ("ordem", "nome", "tipo", "magnitude_completude")
    exclude = ("geometria", "costa")  # polígonos enormes: só o comando carregar_regioes os grava

# Define as principais informações dos terremotos
# que serão apresentadas na listagem administrativa.
@admin.register(Terremoto)
class TerremotoAdmin(admin.ModelAdmin):
    list_display = ("data_hora", "magnitude", "profundidade_km", "local", "tsunami")

     # Disponibiliza filtros para facilitar a consulta dos terremotos
    # conforme a ocorrência de tsunami, o tipo de magnitude e o alerta.
    list_filter = ("tsunami", "tipo_magnitude", "alerta")

    # Permite pesquisar registros utilizando a localização do terremoto
    # ou seu identificador na base de dados do USGS.
    search_fields = ("local", "usgs_id")

    # Organiza a navegação dos registros por data,
    # permitindo consultar os terremotos por ano, mês e dia.
    date_hierarchy = "data_hora"


# Apresenta informações sobre cada processo de coleta,
# incluindo os parâmetros utilizados e os resultados obtidos.
@admin.register(Coleta)
class ColetaAdmin(admin.ModelAdmin):
    list_display = ("id", "iniciada_em", "anos", "magnitude_minima", "status",
                    "recebidos", "novos", "atualizados")
    list_filter = ("status",)

# Exibe informações dos modelos treinados,
# permitindo identificar o algoritmo utilizado,
# a magnitude-alvo, o estado de ativação e a data do treinamento.
@admin.register(ModeloTreinado)
class ModeloTreinadoAdmin(admin.ModelAdmin):
    list_display = ("id", "algoritmo", "magnitude_alvo", "ativo", "treinado_em")
    list_filter = ("algoritmo", "ativo")
