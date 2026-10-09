"""Django admin — the developer's and the owner's backdoor.

Deliberately thin. The client's staff work in the Next.js panel; this exists for
the two things the panel must never be able to do — grant `is_staff_member`, and
look at a row when something has gone wrong.
"""

from django.contrib import admin

from user.models import AuthToken, User


@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    list_display = ("name", "phone", "email", "roles_display", "is_staff_member", "is_active", "date_joined")
    list_filter = ("is_staff_member", "is_active", "date_joined")
    search_fields = ("name", "phone", "email")
    readonly_fields = ("id", "password", "google_sub", "date_joined", "date_updated", "last_login_at")

    @admin.display(description="Roles")
    def roles_display(self, obj):
        return ", ".join(obj.roles) or "—"


@admin.register(AuthToken)
class AuthTokenAdmin(admin.ModelAdmin):
    list_display = ("user", "role", "device", "created", "last_used_at")
    list_filter = ("role",)
    readonly_fields = ("id", "key_hash", "created", "last_used_at")
