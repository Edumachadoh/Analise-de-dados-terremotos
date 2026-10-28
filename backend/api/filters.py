"""
Filtros por query string para os terremotos.

Exemplo:
    /api/terremotos/?magnitude_min=5&data_inicio=2025-01-01&faixa_profundidade=raso
"""

import django_filters

from .models import Terremoto


class TerremotoFilter(django_filters.FilterSet):
    magnitude_min = django_filters.NumberFilter(field_name="magnitude", lookup_expr="gte")
    magnitude_max = django_filters.NumberFilter(field_name="magnitude", lookup_expr="lte")
    profundidade_min = django_filters.NumberFilter(field_name="profundidade_km", lookup_expr="gte")
    profundidade_max = django_filters.NumberFilter(field_name="profundidade_km", lookup_expr="lte")
    data_inicio = django_filters.DateFilter(field_name="data_hora", lookup_expr="date__gte")
    data_fim = django_filters.DateFilter(field_name="data_hora", lookup_expr="date__lte")
    latitude_min = django_filters.NumberFilter(field_name="latitude", lookup_expr="gte")
    latitude_max = django_filters.NumberFilter(field_name="latitude", lookup_expr="lte")
    longitude_min = django_filters.NumberFilter(field_name="longitude", lookup_expr="gte")
    longitude_max = django_filters.NumberFilter(field_name="longitude", lookup_expr="lte")
    local = django_filters.CharFilter(field_name="local", lookup_expr="icontains")
    faixa_profundidade = django_filters.ChoiceFilter(
        method="filtrar_faixa",
        choices=[("raso", "Raso"), ("intermediario", "Intermediário"), ("profundo", "Profundo")],
    )

    class Meta:
        model = Terremoto
        fields = ["tsunami", "alerta", "tipo_magnitude"]

    def filtrar_faixa(self, queryset, name, valor):
        """A faixa não é uma coluna do banco: vira um filtro de intervalo."""
        raso, intermediario = Terremoto.LIMITE_RASO, Terremoto.LIMITE_INTERMEDIARIO
        if valor == "raso":
            return queryset.filter(profundidade_km__lt=raso)
        if valor == "intermediario":
            return queryset.filter(profundidade_km__gte=raso, profundidade_km__lte=intermediario)
        return queryset.filter(profundidade_km__gt=intermediario)
