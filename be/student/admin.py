"""Families in the admin. Unfold's ModelAdmin, not Django's — one that extends
Django's renders an unstyled form inside the skinned shell."""

from django.contrib import admin
from unfold.admin import ModelAdmin, TabularInline

from student.models import StudentProfile, TuitionRequirement


class RequirementInline(TabularInline):
    model = TuitionRequirement
    extra = 0
    fields = ("klass", "subjects", "mode", "status", "created_at")
    readonly_fields = ("created_at",)


@admin.register(StudentProfile)
class StudentProfileAdmin(ModelAdmin):
    list_display = (
        "student_name", "klass", "city", "guardian_name", "consent_state", "created_at",
    )
    list_filter = ("klass", "is_hidden", "account_holder", "board")
    search_fields = ("student_name", "guardian_name", "user__phone", "user__name")
    date_hierarchy = "created_at"
    inlines = [RequirementInline]
    readonly_fields = ("guardian_consent_at", "guardian_consent_by")

    @admin.display(description="Consent", boolean=False)
    def consent_state(self, obj) -> str:
        """The queue the office works. A minor without consent is invisible to
        every teacher, so this column is the difference between a profile that
        does nothing and one that works."""
        if not obj.is_minor:
            return "Adult — not needed"
        if obj.guardian_consent_at:
            return f"Given by {obj.guardian_consent_by or 'guardian'}"
        return "WAITING"


@admin.register(TuitionRequirement)
class TuitionRequirementAdmin(ModelAdmin):
    list_display = ("student", "klass", "mode", "status", "city", "created_at")
    list_filter = ("status", "klass", "mode", "medium")
    search_fields = ("student__student_name", "subjects", "city")
    date_hierarchy = "created_at"
