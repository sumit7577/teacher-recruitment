from django.contrib import admin

from vacancy.models import Vacancy


@admin.register(Vacancy)
class VacancyAdmin(admin.ModelAdmin):
    list_display = ("title", "institution_name", "post", "city", "status", "published_at", "view_count")
    list_filter = ("status", "post", "institution_type", "board", "is_featured", "source")
    search_fields = ("title", "subject", "school_name", "city", "school__name")
    readonly_fields = ("id", "created_at", "updated_at", "view_count", "experience_band")
