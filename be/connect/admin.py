"""Interest, chat and moderation in the admin.

**Messages are deliberately read-only and not searchable by body.** Staff need
to be able to read a conversation that has been reported — that is the point of
the moderation queue — but a full-text search box over every private message on
the platform is a different thing, and nobody asked for it.
"""

from django.contrib import admin
from unfold.admin import ModelAdmin

from connect.models import Block, Interest, Message, Report, Thread


@admin.register(Interest)
class InterestAdmin(ModelAdmin):
    list_display = ("sender", "recipient", "context", "status", "created_at", "responded_at")
    list_filter = ("status", "context")
    search_fields = ("sender__name", "sender__phone", "recipient__name", "recipient__phone")
    date_hierarchy = "created_at"
    readonly_fields = ("created_at", "responded_at", "seen_at")


@admin.register(Thread)
class ThreadAdmin(ModelAdmin):
    list_display = ("id", "interest", "last_message_at", "created_at")
    readonly_fields = tuple(f.name for f in Thread._meta.fields)

    def has_add_permission(self, request):
        # A thread exists only because an interest was accepted. Letting the
        # admin mint one would be the single route to a conversation nobody
        # agreed to.
        return False


@admin.register(Message)
class MessageAdmin(ModelAdmin):
    list_display = ("thread", "sender", "short", "created_at", "read_at")
    list_filter = ("created_at",)
    # By participant, never by body.
    search_fields = ("sender__name", "sender__phone")
    date_hierarchy = "created_at"
    readonly_fields = tuple(f.name for f in Message._meta.fields)

    @admin.display(description="Message")
    def short(self, obj) -> str:
        return obj.body[:80] + ("…" if len(obj.body) > 80 else "")

    def has_add_permission(self, request):
        return False


@admin.register(Report)
class ReportAdmin(ModelAdmin):
    list_display = ("target", "reason", "by", "status", "created_at", "handled_at")
    list_filter = ("status", "reason")
    search_fields = ("target__name", "target__phone", "by__name", "by__phone", "detail")
    date_hierarchy = "created_at"


@admin.register(Block)
class BlockAdmin(ModelAdmin):
    list_display = ("by", "target", "created_at")
    search_fields = ("by__name", "by__phone", "target__name", "target__phone")
