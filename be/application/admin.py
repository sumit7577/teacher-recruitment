from django.contrib import admin
from unfold.admin import ModelAdmin, TabularInline

from application.models import Application, ApplicationEvent, DemoClass, Offer


class EventInline(TabularInline):
    model = ApplicationEvent
    extra = 0
    # Append-only — the log is only worth keeping if it cannot be edited after
    # the fact.
    readonly_fields = ("from_stage", "to_stage", "by", "note", "at")
    can_delete = False


class DemoInline(TabularInline):
    model = DemoClass
    extra = 0


@admin.register(Application)
class ApplicationAdmin(ModelAdmin):
    list_display = ("teacher", "vacancy", "stage", "consultant", "applied_at", "stage_changed_at")
    list_filter = ("stage",)
    search_fields = ("teacher__user__name", "teacher__user__phone", "vacancy__title")
    inlines = (DemoInline, EventInline)
    readonly_fields = ("id", "applied_at", "updated_at", "stage_changed_at")


@admin.register(DemoClass)
class DemoClassAdmin(ModelAdmin):
    list_display = ("application", "scheduled_at", "topic", "grade", "status", "rating")
    list_filter = ("status", "mode")
    search_fields = ("topic", "application__teacher__user__name")


@admin.register(Offer)
class OfferAdmin(ModelAdmin):
    list_display = ("application", "salary_lpa", "joining_date", "status", "sent_at")
    list_filter = ("status",)
    search_fields = ("application__teacher__user__name",)
