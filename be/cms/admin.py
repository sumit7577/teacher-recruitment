from django.contrib import admin

from cms.models import Enquiry, Page, ProcessStep, Service, SiteSetting, TeamMember, Testimonial


@admin.register(SiteSetting)
class SiteSettingAdmin(admin.ModelAdmin):
    list_display = ("brand_name", "phone", "email", "updated_at")

    def has_add_permission(self, request):
        # A singleton. `SiteSetting.load()` reads the first row, so a second one
        # would be silently ignored and whoever created it would be editing a row
        # the site never reads.
        return not SiteSetting.objects.exists()


@admin.register(Page)
class PageAdmin(admin.ModelAdmin):
    list_display = ("slug", "title", "is_published", "updated_at")
    search_fields = ("slug", "title", "heading")


@admin.register(Service)
class ServiceAdmin(admin.ModelAdmin):
    list_display = ("title", "order", "is_published")
    search_fields = ("title",)


@admin.register(ProcessStep)
class ProcessStepAdmin(admin.ModelAdmin):
    list_display = ("title", "audience", "timing", "order", "is_published")
    list_filter = ("audience",)
    search_fields = ("title",)


@admin.register(TeamMember)
class TeamMemberAdmin(admin.ModelAdmin):
    list_display = ("name", "role", "order", "is_published")
    search_fields = ("name", "role")


@admin.register(Testimonial)
class TestimonialAdmin(admin.ModelAdmin):
    list_display = ("author", "institution", "side", "order", "is_published")
    list_filter = ("side",)
    search_fields = ("author", "institution", "quote")


@admin.register(Enquiry)
class EnquiryAdmin(admin.ModelAdmin):
    list_display = ("name", "side", "phone", "city", "status", "created_at")
    list_filter = ("side", "status", "created_at")
    search_fields = ("name", "phone", "email", "institution_name")
    readonly_fields = ("id", "created_at", "ip")
