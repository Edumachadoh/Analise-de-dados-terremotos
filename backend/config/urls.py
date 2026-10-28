"""
Rotas principais do projeto.

- /admin/  painel administrativo do Django
- /api/    rotas da API de terremotos (definidas em api/urls.py)
"""

from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include("api.urls")),
]
