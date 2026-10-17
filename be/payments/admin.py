"""Payments in the admin.

Every ModelAdmin extends **unfold's** `ModelAdmin`, not Django's. One that
extends Django's renders an unstyled form body inside the skinned shell, which
reads as a broken page rather than a missed import.

The ledger is read-only here on purpose. An `Order` is a record of money that
moved, and the admin is not the place to edit one — refunds go through the panel
endpoint, which records who did it and why. Editable by default is how a
reconciliation becomes impossible to trust.
"""

from django.contrib import admin
from unfold.admin import ModelAdmin

from payments.models import Order, Plan, WebhookEvent


@admin.register(Plan)
class PlanAdmin(ModelAdmin):
    """The one table here that is meant to be edited — this is where the price
    lives, so a commercial decision does not need a deploy."""

    list_display = ("name", "code", "audience", "interval", "amount_paise", "is_active", "order")
    list_filter = ("audience", "interval", "is_active")
    search_fields = ("name", "code")
    ordering = ("order", "amount_paise")


@admin.register(Order)
class OrderAdmin(ModelAdmin):
    list_display = (
        "receipt_no", "user", "plan", "amount_paise", "status", "method", "paid_at",
    )
    list_filter = ("status", "plan", "method")
    search_fields = (
        "receipt_no", "user__name", "user__phone",
        "razorpay_order_id", "razorpay_payment_id",
    )
    date_hierarchy = "created_at"
    # A record of money, not a form. Refunds go through v1/panel/payments/…,
    # which writes down who authorised them.
    readonly_fields = tuple(f.name for f in Order._meta.fields)

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(WebhookEvent)
class WebhookEventAdmin(ModelAdmin):
    """What Razorpay told us. The first place to look when a payment shows as
    unpaid and the payer insists otherwise."""

    list_display = ("kind", "event_id", "handled", "note", "received_at")
    list_filter = ("kind", "handled")
    search_fields = ("event_id", "note")
    date_hierarchy = "received_at"
    readonly_fields = tuple(f.name for f in WebhookEvent._meta.fields)

    def has_add_permission(self, request):
        return False
