"""
Rotas da API. O DefaultRouter gera as URLs de cada ViewSet e a raiz
navegável em /api/, que lista os endpoints.

    /api/terremotos/                    CRUD + filtros
    /api/estatisticas/                  resumo (e /por-mes/, /por-magnitude/, /por-profundidade/)
    /api/coletas/                       histórico e nova importação do USGS
    /api/coletas/upload/                importação de um CSV enviado (multipart)
    /api/modelos/                       modelos treinados; POST treina
    /api/modelos/algoritmos/            algoritmos e parâmetros disponíveis
    /api/modelos/{id}/ativar/           escolhe o modelo das previsões
    /api/previsoes/                     probabilidade por região
"""

from rest_framework.routers import DefaultRouter

from .views import (ColetaViewSet, EstatisticaViewSet, ModeloViewSet, PrevisaoViewSet,
                    TerremotoViewSet)

router = DefaultRouter()
router.register(r"terremotos", TerremotoViewSet, basename="terremoto")
router.register(r"estatisticas", EstatisticaViewSet, basename="estatistica")
router.register(r"coletas", ColetaViewSet, basename="coleta")
router.register(r"modelos", ModeloViewSet, basename="modelo")
router.register(r"previsoes", PrevisaoViewSet, basename="previsao")

urlpatterns = router.urls
