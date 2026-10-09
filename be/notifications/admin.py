from django.contrib import admin
from unfold.admin import ModelAdmin

from notifications.models import Device, Notification, PushCampaign


@admin.register(Device)
class DeviceAdmin(ModelAdmin):
    list_display = ("user", "platform", "app_version", "is_active", "last_seen_at")
    list_filter = ("platform", "is_active")
    search_fields = ("user__name", "user__phone", "token")


@admin.register(Notification)
class NotificationAdmin(ModelAdmin):
    list_display = ("user", "kind", "title", "read_at", "created_at")
    list_filter = ("kind",)
    search_fields = ("user__name", "user__phone", "title")


@admin.register(PushCampaign)
class PushCampaignAdmin(ModelAdmin):
    list_display = ("title", "audience", "status", "recipients", "delivered", "failed", "sent_at")
    list_filter = ("audience", "status")
    search_fields = ("title", "body")
