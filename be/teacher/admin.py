from django.contrib import admin
from unfold.admin import ModelAdmin, TabularInline

from teacher.models import TeacherDocument, TeacherExperience, TeacherProfile


class DocumentInline(TabularInline):
    model = TeacherDocument
    extra = 0
    fields = ("kind", "title", "file", "status", "verified_by", "verified_at", "note")
    readonly_fields = ("verified_at",)


class ExperienceInline(TabularInline):
    model = TeacherExperience
    extra = 0


@admin.register(TeacherProfile)
class TeacherProfileAdmin(ModelAdmin):
    list_display = ("user", "post", "city", "experience_band", "verification", "is_open_to_work", "created_at")
    list_filter = ("post", "verification", "is_open_to_work", "experience_band", "police_verified")
    search_fields = ("user__name", "user__phone", "user__email", "headline", "highest_qualification")
    inlines = (DocumentInline, ExperienceInline)
    readonly_fields = ("id", "created_at", "updated_at", "experience_band")


@admin.register(TeacherDocument)
class TeacherDocumentAdmin(ModelAdmin):
    list_display = ("teacher", "kind", "status", "verified_by", "verified_at", "uploaded_at")
    list_filter = ("kind", "status")
    search_fields = ("teacher__user__name", "teacher__user__phone", "title")
