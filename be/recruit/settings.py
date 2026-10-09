"""
Django settings — teacher recruitment platform.

Architecture mirrors `allcoachingAdmin` (see CLAUDE.md §1). The one place this
file deliberately DIVERGES from it is secrets: allcoaching has its Razorpay
secret, DB password and CDN keys committed in settings.py and `DEBUG` on in
production. Those are in its git history forever and cannot be un-published by
deleting the line. This repo is handed over to a client, so every secret is read
from the environment and `DEBUG` defaults to False — a missing variable fails
loudly at boot rather than quietly shipping a default.
"""

import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent


def env(key: str, default=None, required: bool = False):
    value = os.environ.get(key, default)
    if required and not value:
        raise RuntimeError(f"Missing required environment variable: {key}")
    return value


def env_bool(key: str, default: bool = False) -> bool:
    return str(os.environ.get(key, default)).strip().lower() in ("1", "true", "yes", "on")


def env_list(key: str, default: str = "") -> list:
    return [p.strip() for p in os.environ.get(key, default).split(",") if p.strip()]


# ── Core ────────────────────────────────────────────────────────────────────

# A generated fallback keeps `manage.py` usable on a fresh clone with no .env;
# it changes every boot, so any session or signature made with it dies with the
# process. That is the point — it can never silently become the production key.
SECRET_KEY = env("DJANGO_SECRET_KEY") or ("dev-only-" + os.urandom(16).hex())

DEBUG = env_bool("DJANGO_DEBUG", False)

ALLOWED_HOSTS = env_list("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1,0.0.0.0")

# Behind nginx/Cloudflare the request arrives on http; without this Django
# builds http:// absolute URLs in password/OTP mail and `request.is_secure()`
# is False, which breaks secure cookies.
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
USE_X_FORWARDED_HOST = True

CSRF_TRUSTED_ORIGINS = env_list("DJANGO_CSRF_TRUSTED_ORIGINS")

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "corsheaders",
    "django_filters",
    # Our apps. `app` owns integrations + shared plumbing; every other app owns
    # its own models/serializers/views/urls (CLAUDE.md §2).
    "app",
    "user",
    "teacher",
    "school",
    "vacancy",
    "application",
    "cms",
    "notifications",
    "panel",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    # Serves STATIC_ROOT under gunicorn once DEBUG is off.
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "recruit.urls"

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

WSGI_APPLICATION = "recruit.wsgi.application"
ASGI_APPLICATION = "recruit.asgi.application"

# ── Database ────────────────────────────────────────────────────────────────
#
# Postgres when POSTGRES_DB is set, SQLite otherwise. SQLite is for a fresh
# clone and the test suite only — `JSONField` works on both, but the
# case-insensitive lookups and the `distinct()` behaviour differ, so anything
# shipped is verified against Postgres.

if env("POSTGRES_DB"):
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": env("POSTGRES_DB"),
            "USER": env("POSTGRES_USER", "postgres"),
            "PASSWORD": env("POSTGRES_PASSWORD", required=True),
            "HOST": env("POSTGRES_HOST", "127.0.0.1"),
            "PORT": env("POSTGRES_PORT", "5432"),
            "CONN_MAX_AGE": int(env("POSTGRES_CONN_MAX_AGE", "500")),
        }
    }
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / "db.sqlite3",
        }
    }

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
     "OPTIONS": {"min_length": 8}},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-in"
TIME_ZONE = "Asia/Kolkata"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STATICFILES_DIRS = [BASE_DIR / "static"] if (BASE_DIR / "static").exists() else []
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"},
}

# Uploads — CVs, certificates, logos, photographs. One server, one disk, served
# by nginx at MEDIA_URL in production (see CLAUDE.md §6). Switching to S3 or a
# CDN later is one STORAGES entry; nothing in the models knows where files go.
MEDIA_URL = env("MEDIA_URL", "/media/")
MEDIA_ROOT = Path(env("MEDIA_ROOT", str(BASE_DIR / "media")))

# A CV is a PDF and a certificate is a photo of one. 10 MB covers both with
# room to spare, and anything larger is a scan nobody wants to download.
MAX_UPLOAD_BYTES = int(env("MAX_UPLOAD_BYTES", str(10 * 1024 * 1024)))
DATA_UPLOAD_MAX_MEMORY_SIZE = MAX_UPLOAD_BYTES
FILE_UPLOAD_MAX_MEMORY_SIZE = 5 * 1024 * 1024

# ── DRF ─────────────────────────────────────────────────────────────────────

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": ("user.auth.CustomAuthentication",),
    "DEFAULT_PERMISSION_CLASSES": ("rest_framework.permissions.IsAuthenticated",),
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 10,
    "DEFAULT_FILTER_BACKENDS": ("django_filters.rest_framework.DjangoFilterBackend",),
    "EXCEPTION_HANDLER": "user.service.custom_exception_handler",
    "UNAUTHENTICATED_USER": None,
}

CORS_ALLOWED_ORIGINS = env_list(
    "CORS_ALLOWED_ORIGINS",
    "http://localhost:3000,http://127.0.0.1:3000",
)
CORS_ALLOW_CREDENTIALS = False

# ── Integrations ────────────────────────────────────────────────────────────

# SMS OTP. Same provider as allcoaching (Fast2SMS); the DLT template id and
# sender are the client's own once their DLT registration is through.
SMS_API_URL = env("SMS_API_URL", "https://www.fast2sms.com/dev/bulkV2")
SMS_API_KEY = env("SMS_API_KEY")
SMS_SENDER_ID = env("SMS_SENDER_ID", "")
SMS_TEMPLATE_ID = env("SMS_TEMPLATE_ID", "")
# Any phone listed here skips the SMS gateway and accepts OTP_TEST_CODE. For
# Play Store review and for demoing the panel without burning SMS credits.
OTP_TEST_PHONES = env_list("OTP_TEST_PHONES")
OTP_TEST_CODE = env("OTP_TEST_CODE", "000000")
OTP_TTL_SECONDS = int(env("OTP_TTL_SECONDS", "600"))
# With no SMS credentials, print the code to the log and report it as sent.
# Without this nobody can sign in on a dev machine, which makes the whole
# frontend undevelopable. Defaults to DEBUG and is NEVER silently on in
# production: there, a missing key must surface as "we could not send the code"
# rather than as a sign-in box that accepts nothing.
OTP_CONSOLE_FALLBACK = env_bool("OTP_CONSOLE_FALLBACK", DEBUG)

# Firebase Cloud Messaging — new-vacancy and demo-class pushes to the app.
FCM_CREDENTIALS_FILE = env("FCM_CREDENTIALS_FILE", str(BASE_DIR / "secrets" / "firebase-admin.json"))

# Google sign-in (the "or Google" in the proposal). Web client id; the Android
# client verifies against the same project.
GOOGLE_OAUTH_CLIENT_IDS = env_list("GOOGLE_OAUTH_CLIENT_IDS")

# Where enquiry forms and application alerts are emailed.
EMAIL_BACKEND = env("EMAIL_BACKEND", "django.core.mail.backends.console.EmailBackend")
EMAIL_HOST = env("EMAIL_HOST", "")
EMAIL_PORT = int(env("EMAIL_PORT", "587"))
EMAIL_HOST_USER = env("EMAIL_HOST_USER", "")
EMAIL_HOST_PASSWORD = env("EMAIL_HOST_PASSWORD", "")
EMAIL_USE_TLS = env_bool("EMAIL_USE_TLS", True)
DEFAULT_FROM_EMAIL = env("DEFAULT_FROM_EMAIL", "no-reply@localhost")
# The firm's inbox — contact forms and new applications land here.
OFFICE_EMAIL = env("OFFICE_EMAIL", "")

# Public origin of the Next.js site, used in emails and push deep links.
SITE_ORIGIN = env("SITE_ORIGIN", "http://localhost:3000")

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "root": {"handlers": ["console"], "level": env("LOG_LEVEL", "INFO")},
}
