"""Root URLconf. Mounts only `app.urls` and the Django admin — the same
two-line shape as allcoaching's project urls (CLAUDE.md §3)."""

from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path("admin/", admin.site.urls),
    path("", include("app.urls")),
]

# In production nginx serves MEDIA_URL directly; this is the dev-server path.
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
