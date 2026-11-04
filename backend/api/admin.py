from django.contrib import admin

from .models import Coleta, ModeloTreinado, Regiao, Terremoto


@admin.register(Regiao)
class RegiaoAdmin(admin.ModelAdmin):
    list_display = ("ordem", "nome", "tipo", "magnitude_completude")
    exclude = ("geometria", "costa")  # polígonos enormes: só o comando carregar_regioes os grava


@admin.register(Terremoto)
class TerremotoAdmin(admin.ModelAdmin):
    list_display = ("data_hora", "magnitude", "profundidade_km", "local", "tsunami")
    list_filter = ("tsunami", "tipo_magnitude", "alerta")
    search_fields = ("local", "usgs_id")
    date_hierarchy = "data_hora"


@admin.register(Coleta)
class ColetaAdmin(admin.ModelAdmin):
    list_display = ("id", "iniciada_em", "anos", "magnitude_minima", "status",
                    "recebidos", "novos", "atualizados")
    list_filter = ("status",)


@admin.register(ModeloTreinado)
class ModeloTreinadoAdmin(admin.ModelAdmin):
    list_display = ("id", "algoritmo", "magnitude_alvo", "ativo", "treinado_em")
    list_filter = ("algoritmo", "ativo")
