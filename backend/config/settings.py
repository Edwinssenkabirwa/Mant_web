"""
Django settings for the Mant Bridges LTD platform.

Backend: Django REST Framework serving JSON to a React (Vite) frontend.
Database: SQLite by default, switchable to PostgreSQL through environment variables.
"""
from datetime import timedelta
from pathlib import Path

from dotenv import load_dotenv
import os

from django.core.exceptions import ImproperlyConfigured

BASE_DIR = Path(__file__).resolve().parent.parent

load_dotenv(BASE_DIR / ".env")
load_dotenv(BASE_DIR / ".env.supabase", override=False)


def env_list(name, default=""):
    return [item.strip() for item in os.getenv(name, default).split(",") if item.strip()]


def env_bool(name, default=False):
    return os.getenv(name, str(default)).strip().lower() in ("1", "true", "yes", "on")


DEV_SECRET_KEY = "django-insecure-mant-bridges-dev-key"
SECRET_KEY = os.getenv("DJANGO_SECRET_KEY", DEV_SECRET_KEY)

# Vercel sets VERCEL in the process environment for every build and every request, so it is
# a platform fact rather than something a caller can assert. It is used twice below: to
# decide what DEBUG defaults to, and to decide whose hostnames are safe to trust.
RUNNING_ON_VERCEL = bool(os.environ.get("VERCEL"))

# Debug pages cannot exist on a request-driven host. A fresh image has no .env, so the old
# default of True meant a half-configured deployment quietly served development pages and
# the route map off an empty SQLite file, and looked like it had deployed. Now it stops at
# boot and names what is missing instead.
DEBUG = env_bool("DJANGO_DEBUG", not RUNNING_ON_VERCEL)
ALLOWED_HOSTS = env_list("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1")

# Vercel names the current deployment in VERCEL_URL and the production alias in
# VERCEL_PROJECT_PRODUCTION_URL. Both are written by the platform into the process
# environment, never taken from the request, so trusting them cannot widen who gets an
# answer — every preview would otherwise 400 with DisallowedHost until someone read the
# new hostname off the log and typed it into the dashboard. Custom domains still belong in
# DJANGO_ALLOWED_HOSTS, which is also where they are checked.
if RUNNING_ON_VERCEL:
    for _name in ("VERCEL_URL", "VERCEL_PROJECT_PRODUCTION_URL"):
        _host = os.environ.get(_name, "").strip().lower().split(":")[0]
        if _host and _host not in ALLOWED_HOSTS:
            ALLOWED_HOSTS.append(_host)

# Without this, a host that cannot read .env still boots — with the development key
# and the debug pages switched on. Failing here is the loud version of the same mistake.
if not DEBUG and (SECRET_KEY == DEV_SECRET_KEY or len(SECRET_KEY) < 50):
    raise ImproperlyConfigured(
        "DJANGO_SECRET_KEY must be a long random value while DJANGO_DEBUG=False. "
        "Generate one with: python -c \"from django.core.management.utils import "
        "get_random_secret_key as k; print(k())\""
    )

DJANGO_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
]

THIRD_PARTY_APPS = [
    "rest_framework",
    "rest_framework_simplejwt",
    "corsheaders",
    "django_filters",
    "drf_spectacular",
]

LOCAL_APPS = [
    "apps.core",
    "apps.accounts",
    "apps.properties",
    "apps.blog",
    "apps.leases",
    "apps.billing",
    "apps.messaging",
]

INSTALLED_APPS = DJANGO_APPS + THIRD_PARTY_APPS + LOCAL_APPS

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
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
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"
# ASGI_APPLICATION is deliberately not set. Nothing here installs channels, daphne or
# uvicorn, and a host that finds both entrypoints switches to the ASGI one — the request
# path this project has never been exercised on.

DB_ENGINE = os.getenv("DB_ENGINE", "sqlite").strip().lower()

if DB_ENGINE == "postgresql":
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": os.getenv("DB_NAME", "mantbridges"),
            "USER": os.getenv("DB_USER", "postgres"),
            "PASSWORD": os.getenv("DB_PASSWORD", ""),
            "HOST": os.getenv("DB_HOST", "localhost"),
            "PORT": os.getenv("DB_PORT", "5432"),
            # A serverless function is frozen between requests and its connections with it,
            # so each request opens its own. Raise this only on a host with a real process
            # lifetime, and only against a session-mode pooler.
            "CONN_MAX_AGE": int(os.getenv("DJANGO_DB_CONN_MAX_AGE", "0")),
            "CONN_HEALTH_CHECKS": True,
            # Supabase's pooler defaults to transaction mode, which discards the session
            # state a server-side cursor lives on. Queries then fail part-way through a
            # page rather than at connect, so the safe default is to not use them.
            "DISABLE_SERVER_SIDE_CURSORS": env_bool(
                "DJANGO_DB_DISABLE_SERVER_SIDE_CURSORS", True
            ),
        }
    }
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / "db.sqlite3",
        }
    }

if not DEBUG and DB_ENGINE != "postgresql":
    raise ImproperlyConfigured(
        "DJANGO_DEBUG=False requires DB_ENGINE=postgresql with DB_NAME, DB_USER, DB_HOST "
        "and DB_PORT. SQLite is a file in the deploy directory: a request-driven host "
        "starts from a fresh image, so the database would be empty on every cold start."
    )

if not DEBUG and DB_ENGINE == "postgresql":
    gaps = [name for name in ("DB_NAME", "DB_USER", "DB_HOST", "DB_PASSWORD")
            if not os.getenv(name, "").strip()]
    if gaps:
        raise ImproperlyConfigured(
            "PostgreSQL is selected but " + ", ".join(gaps) + " is empty. Every request "
            "would fail on the first query, so this stops here instead of at the database."
        )

AUTH_USER_MODEL = "accounts.User"

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
     "OPTIONS": {"min_length": 8}},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = os.getenv("DJANGO_TIME_ZONE", "Africa/Kampala")
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

MEDIA_URL = "media/"
MEDIA_ROOT = BASE_DIR / "media"

STORAGES = {
    "default": {
        "BACKEND": "apps.core.storage_backends.SupabasePublicMediaStorage",
    },
    "staticfiles": {
        "BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage",
    },
}

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# A Vercel function refuses any request body over 4.5 MB before Django sees it, so on that
# host these are set to 4: the form then answers with its own message rather than the
# platform dropping the upload with a status the app cannot explain.
MAX_UPLOAD_MB = int(os.getenv("DJANGO_MAX_UPLOAD_MB", "15"))
FILE_UPLOAD_MAX_MEMORY_SIZE = MAX_UPLOAD_MB * 1024 * 1024
DATA_UPLOAD_MAX_MEMORY_SIZE = MAX_UPLOAD_MB * 1024 * 1024

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
        "rest_framework.authentication.SessionAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": ("rest_framework.permissions.IsAuthenticated",),
    "DEFAULT_FILTER_BACKENDS": (
        "django_filters.rest_framework.DjangoFilterBackend",
        "rest_framework.filters.SearchFilter",
        "rest_framework.filters.OrderingFilter",
    ),
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 12,
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "DATETIME_FORMAT": "iso-8601",
    "EXCEPTION_HANDLER": "apps.core.exceptions.api_exception_handler",
    # Public newsletter endpoints only; see apps.core.throttles.
    "DEFAULT_THROTTLE_RATES": {
        "newsletter_subscribe": os.getenv("NEWSLETTER_SUBSCRIBE_RATE", "20/min"),
        "newsletter_token": os.getenv("NEWSLETTER_TOKEN_RATE", "60/min"),
    },
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(hours=12),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=14),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": False,
    "AUTH_HEADER_TYPES": ("Bearer",),
    "UPDATE_LAST_LOGIN": True,
}

SPECTACULAR_SETTINGS = {
    "TITLE": "Mant Bridges LTD API",
    "DESCRIPTION": "Property listings, blog, tenancy, rent collection and receipts.",
    "VERSION": "1.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
    "COMPONENT_SPLIT_REQUEST": True,
}

CORS_ALLOWED_ORIGINS = env_list(
    "CORS_ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"
)
# The SPA authorises with a Bearer token from localStorage, never with cookies, so
# credentialed cross-origin requests are not part of any flow here.
CORS_ALLOW_CREDENTIALS = env_bool("CORS_ALLOW_CREDENTIALS", False)

# Needed only when the SPA is served from a different origin than the API and something
# does send cookies. Explicit https:// origins, comma-separated.
CSRF_TRUSTED_ORIGINS = env_list("CSRF_TRUSTED_ORIGINS")

# The host terminates SSL and proxies to Passenger, so requests arrive as http and Django
# would build http:// media links. Set to "HTTP_X_FORWARDED_PROTO,on" (or
# "HTTP_X_FORWARDED_SSL,on", whichever header the host actually forwards) only after
# confirming it — trusting a header the front end does not set is worse than not setting it.
_ssl_header = os.getenv("DJANGO_TRUSTED_SSL_HEADER", "").strip()
SECURE_PROXY_SSL_HEADER = tuple(_ssl_header.split(",", 1)) if "," in _ssl_header else None

# /api/schema/ and /api/docs/ publish every route, including the desk's and the landlords'.
API_DOCS_ENABLED = env_bool("DJANGO_API_DOCS", DEBUG)

# Uploaded images are validated by Pillow before saving.
SILENCED_SYSTEM_CHECKS = []

EMAIL_BACKEND = os.getenv(
    "EMAIL_BACKEND", "django.core.mail.backends.console.EmailBackend"
)
EMAIL_HOST = os.getenv("EMAIL_HOST", "localhost")
EMAIL_PORT = int(os.getenv("EMAIL_PORT", "587"))
EMAIL_HOST_USER = os.getenv("EMAIL_HOST_USER", "")
EMAIL_HOST_PASSWORD = os.getenv("EMAIL_HOST_PASSWORD", "")
EMAIL_USE_TLS = env_bool("EMAIL_USE_TLS", True)
DEFAULT_FROM_EMAIL = os.getenv("DEFAULT_FROM_EMAIL", "no-reply@mantbridges.com")

# Base URL used for the links inside newsletter emails. In development this is the Vite
# server; production must point it at the public site origin.
PUBLIC_SITE_URL = os.getenv("PUBLIC_SITE_URL", "http://127.0.0.1:5173").rstrip("/")
NEWSLETTER_CONFIRM_HOURS = int(os.getenv("NEWSLETTER_CONFIRM_HOURS", "72"))

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "simple": {"format": "[{levelname}] {asctime} {name}: {message}", "style": "{"},
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "simple",
        },
    },
    "root": {"handlers": ["console"], "level": os.getenv("LOG_LEVEL", "INFO")},
    "loggers": {
        "django.db.backends": {"level": "WARNING", "handlers": ["console"], "propagate": False},
        "apps": {"level": "INFO", "handlers": ["console"], "propagate": False},
    },
}

if not DEBUG:
    SECURE_BROWSER_XSS_FILTER = True
    X_FRAME_OPTIONS = "DENY"
    CSRF_COOKIE_SECURE = True
    SESSION_COOKIE_SECURE = True
    SECURE_CONTENT_TYPE_NOSNIFF = True
    # Both stay off until the host's SSL termination is checked by hand: turning
    # SECURE_SSL_REDIRECT on while the proxy still reports plain http traps the whole
    # site in a redirect loop, and HSTS cannot be walked back once a browser has cached it.
    SECURE_SSL_REDIRECT = env_bool("DJANGO_SECURE_SSL_REDIRECT", False)
    SECURE_HSTS_SECONDS = int(os.getenv("DJANGO_SECURE_HSTS_SECONDS", "0"))
