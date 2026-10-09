from django.contrib import admin
from unfold.admin import ModelAdmin

from school.models import School


@admin.register(School)
class SchoolAdmin(ModelAdmin):
    list_display = ("name", "institution_type", "city", "board", "status", "created_at")
    list_filter = ("status", "institution_type", "board")
    search_fields = ("name", "city", "contact_person", "user__phone", "office_email")
    readonly_fields = ("id", "created_at", "updated_at", "verified_at")
