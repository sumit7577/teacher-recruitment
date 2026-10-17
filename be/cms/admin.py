from django.contrib import admin
from unfold.admin import ModelAdmin

from cms.models import Enquiry, Faq, Page, ProcessStep, Service, SiteSetting, SuccessStory, TeamMember, Testimonial


@admin.register(SiteSetting)
class SiteSettingAdmin(ModelAdmin):
    list_display = ("brand_name", "phone", "email", "updated_at")
    readonly_fields = ("updated_at",)

    # Twenty-three fields in one column is a wall. Grouped by the question each
    # answers, so someone changing the office phone number is not scrolling past
    # the colour pickers to find it. `collapse` hides the two that are set once
    # and then left alone for a year.
    fieldsets = (
        ("Brand", {
            "fields": ("brand_name", "tagline", "logo", "logo_dark", "favicon"),
        }),
        ("Colours", {
            "fields": ("accent_colour", "deep_colour"),
            "description": "Hex, with the #. These drive the whole public site, "
                           "so a change here repaints every page.",
        }),
        ("Contact", {
            "fields": ("phone", "whatsapp", "email", "address", "map_url", "office_hours"),
        }),
        ("About the firm", {
            "fields": ("established_year", "about_heading", "about_body", "stats"),
        }),
        ("Social links", {
            "fields": ("social",),
            "classes": ("collapse",),
        }),
        ("Search engines", {
            "fields": ("seo_title", "seo_description", "og_image", "google_verification"),
            "classes": ("collapse",),
            "description": "Left empty, the site falls back to the brand name and "
                           "tagline above.",
        }),
        ("", {"fields": ("updated_at",)}),
    )

    def has_add_permission(self, request):
        # A singleton. `SiteSetting.load()` reads the first row, so a second one
        # would be silently ignored and whoever created it would be editing a row
        # the site never reads.
        return not SiteSetting.objects.exists()


@admin.register(Page)
class PageAdmin(ModelAdmin):
    list_display = ("slug", "title", "is_published", "updated_at")
    search_fields = ("slug", "title", "heading")


@admin.register(Service)
class ServiceAdmin(ModelAdmin):
    list_display = ("title", "order", "is_published")
    search_fields = ("title",)


@admin.register(ProcessStep)
class ProcessStepAdmin(ModelAdmin):
    list_display = ("title", "audience", "timing", "order", "is_published")
    list_filter = ("audience",)
    search_fields = ("title",)


@admin.register(TeamMember)
class TeamMemberAdmin(ModelAdmin):
    list_display = ("name", "role", "order", "is_published")
    search_fields = ("name", "role")


@admin.register(Testimonial)
class TestimonialAdmin(ModelAdmin):
    list_display = ("author", "institution", "side", "order", "is_published")
    list_filter = ("side",)
    search_fields = ("author", "institution", "quote")


@admin.register(Enquiry)
class EnquiryAdmin(ModelAdmin):
    list_display = ("name", "side", "phone", "city", "status", "created_at")
    list_filter = ("side", "status", "created_at")
    search_fields = ("name", "phone", "email", "institution_name")
    readonly_fields = ("id", "created_at", "ip")


@admin.register(Faq)
class FaqAdmin(ModelAdmin):
    list_display = ("question", "audience", "order", "is_published")
    list_filter = ("audience", "is_published")
    search_fields = ("question", "answer")


@admin.register(SuccessStory)
class SuccessStoryAdmin(ModelAdmin):
    list_display = ("headline", "teacher_name", "institution_name", "city",
                    "days_to_place", "order", "is_published")
    list_filter = ("is_published", "teacher_post")
    search_fields = ("headline", "teacher_name", "institution_name")
