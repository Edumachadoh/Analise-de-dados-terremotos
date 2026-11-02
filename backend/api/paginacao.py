"""Paginação padrão: 50 por página, com ?page_size= para o front pedir mais de uma vez."""

from rest_framework.pagination import PageNumberPagination


class PaginacaoPadrao(PageNumberPagination):
    page_size_query_param = "page_size"
    max_page_size = 5000
