"""
Configurações do projeto.

Valores sensíveis ou que mudam entre ambientes (SECRET_KEY, DEBUG,
ALLOWED_HOSTS) vêm do arquivo .env, carregado pelo python-dotenv.
Veja o .env.example para a lista de variáveis.
"""

import os
from pathlib import Path

from django.core.exceptions import ImproperlyConfigured
from dotenv import load_dotenv

# Raiz do projeto (a pasta que contém o manage.py)
BASE_DIR = Path(__file__).resolve().parent.parent

# Lê o .env da raiz e coloca as variáveis em os.environ
load_dotenv(BASE_DIR / ".env")


# =============================================================================
# Segurança e ambiente
# =============================================================================
SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
    # Falha cedo e com mensagem clara, em vez de rodar com uma chave vazia
    raise ImproperlyConfigured(
        "SECRET_KEY não definida. Copie o .env.example para .env e preencha a chave."
    )

# bool("False") seria True, porque qualquer texto não vazio é verdadeiro.
# Por isso a comparação explícita com o texto "true".
DEBUG = os.getenv("DEBUG", "False").strip().lower() == "true"

ALLOWED_HOSTS = [
    host.strip()
    for host in os.getenv("ALLOWED_HOSTS", "localhost,127.0.0.1").split(",")
    if host.strip()
]


# =============================================================================
# Aplicações
# =============================================================================
INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # Terceiros
    "rest_framework",
    "django_filters",
    # Projeto
    "api",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"


# =============================================================================
# Banco de dados
# =============================================================================
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / "db.sqlite3",
    }
}


# =============================================================================
# Validação de senhas (usada pelo admin)
# =============================================================================
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]


# =============================================================================
# Idioma e fuso horário
# =============================================================================
LANGUAGE_CODE = "pt-br"

# Os horários dos terremotos vêm do USGS em UTC. Mantemos o banco em UTC
# para não haver conversão: o mesmo instante tem o mesmo valor no USGS e aqui.
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True


# =============================================================================
# Arquivos estáticos (CSS e JS do admin e da API navegável)
# =============================================================================
STATIC_URL = "static/"


# =============================================================================
# Django REST Framework
# =============================================================================
REST_FRAMEWORK = {
    # Filtros por query string (?mag_min=5) e ordenação (?ordering=-mag)
    "DEFAULT_FILTER_BACKENDS": [
        "django_filters.rest_framework.DjangoFilterBackend",
        "rest_framework.filters.OrderingFilter",
    ],
    # A base tem milhares de terremotos; sem paginação, uma listagem
    # devolveria tudo de uma vez. Com ela, cada página traz PAGE_SIZE itens
    # e a resposta inclui os links "next" e "previous".
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 50,
    # JSON para clientes (Postman, Streamlit, scripts) e a página navegável
    # do DRF para testes pelo navegador
    "DEFAULT_RENDERER_CLASSES": [
        "rest_framework.renderers.JSONRenderer",
        "rest_framework.renderers.BrowsableAPIRenderer",
    ],
}


# =============================================================================
# Arquivos gerados pela aplicação (modelos de ML treinados)
# =============================================================================
MEDIA_ROOT = BASE_DIR / "media"
PASTA_MODELOS = MEDIA_ROOT / "modelos"


# =============================================================================
# Coleta de terremotos (API do USGS)
# =============================================================================
USGS_URL = "https://earthquake.usgs.gov/fdsnws/event/1"

# Recorte retangular da região analisada (Japão): (lat_min, lat_max, lon_min, lon_max)
REGIAO_ANALISE = (24.0, 46.0, 122.0, 146.0)

# Base padrão: últimos 3 anos. Re-treino: últimos 6 anos.
ANOS_COLETA_PADRAO = 3
ANOS_RETREINO = 6


# =============================================================================
# E-mail
# =============================================================================
MAILERS = {
    "default": {
        "BACKEND": "django.core.mail.backends.console.EmailBackend",
    },
}
