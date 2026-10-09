from django.apps import AppConfig as DjangoAppConfig


class AppConfig(DjangoAppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "app"

    def ready(self) -> None:
        """Register the `<pid:slug>` URL converter project-wide.

        Done at app-ready so it is installed before any feature app's urls.py
        imports and tries to `path("<pid:pk>/", ...)`.
        """
        from django.urls import register_converter

        from app.public_id import PublicIdConverter

        register_converter(PublicIdConverter, "pid")
        self._set_admin_defaults()

    @staticmethod
    def _set_admin_defaults() -> None:
        """Three defaults on the admin base class rather than on each admin.

        * `list_per_page = 25` — Django's 100 is a wall of rows with a stray
          page link under it.
        * `get_ordering` falling back to `-pk` — Postgres makes no promise about
          row order without ORDER BY, so an unordered queryset behind a
          paginator can repeat a row on page 2 that already appeared on page 1.
        * autocomplete for every FK whose target admin declares `search_fields`
          — a plain relation widget renders one `<option>` per row in the target
          table every time the form opens. Fine at fifty teachers, ruinous at
          five thousand, and this product's whole job is to accumulate teachers.

        Set on the base class so each behaves as a default: Python resolves the
        attribute on the subclass first, so an admin that declares its own keeps
        it.
        """
        from django.contrib.admin import ModelAdmin
        from django.contrib.admin.sites import site
        from django.db.models import ForeignKey, ManyToManyField

        ModelAdmin.list_per_page = 25

        def get_ordering(self, request):
            return self.ordering or self.model._meta.ordering or ("-pk",)

        def get_autocomplete_fields(self, request):
            declared = tuple(self.autocomplete_fields or ())
            skip = set(declared)
            skip |= set(self.raw_id_fields or ())
            skip |= set(getattr(self, "filter_horizontal", None) or ())
            skip |= set(getattr(self, "filter_vertical", None) or ())

            promoted = []
            for field in self.model._meta.get_fields():
                if not isinstance(field, (ForeignKey, ManyToManyField)):
                    continue
                if not getattr(field, "concrete", False) or field.name in skip:
                    continue
                target = site._registry.get(field.related_model)
                # Strict rather than optimistic: a field promoted without the
                # target admin declaring `search_fields` renders a widget whose
                # endpoint 403s — a working select turned into a dead box.
                if target is not None and getattr(target, "search_fields", None):
                    promoted.append(field.name)
            return declared + tuple(promoted)

        ModelAdmin.get_ordering = get_ordering
        ModelAdmin.get_autocomplete_fields = get_autocomplete_fields
