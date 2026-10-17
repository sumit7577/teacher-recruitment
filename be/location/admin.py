"""States, districts and blocks.

Editable because a district genuinely does get renamed or split, and when it
does the office should not wait for a deploy. Normally populated by
`seed_states` and `import_locations`.
"""

from django.contrib import admin
from unfold.admin import ModelAdmin

from location.models import Block, District, State


@admin.register(State)
class StateAdmin(ModelAdmin):
    list_display = ("name", "lgd_code", "is_union_territory")
    search_fields = ("name", "lgd_code")


@admin.register(District)
class DistrictAdmin(ModelAdmin):
    list_display = ("name", "state", "lgd_code")
    list_filter = ("state",)
    search_fields = ("name", "lgd_code")
    autocomplete_fields = ()


@admin.register(Block)
class BlockAdmin(ModelAdmin):
    list_display = ("name", "kind", "district")
    list_filter = ("kind",)
    search_fields = ("name", "lgd_code", "district__name")
