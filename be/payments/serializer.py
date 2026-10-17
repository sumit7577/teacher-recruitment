"""Payment serializers. Two-serializer pattern (CLAUDE.md §4.3).

Every read serializer lists its fields explicitly. On this app that matters more
than anywhere else: `notes` can carry whatever a caller put in it, and
`failure_reason` is Razorpay's words about someone's bank card. Neither belongs
in a response to the person who paid.
"""

from rest_framework import serializers

from payments.models import Order, Plan


class PlanReadSerializer(serializers.ModelSerializer):
    amount_rupees = serializers.CharField(read_only=True)

    class Meta:
        model = Plan
        fields = (
            "id", "code", "name", "description", "audience", "interval",
            "amount_paise", "amount_rupees", "grants_days", "grants_vacancies",
        )


class OrderReadSerializer(serializers.ModelSerializer):
    """What the payer sees about their own order.

    No `failure_reason` and no `notes`. A payer is told "that payment did not go
    through, try again" by the interface; the bank's exact wording is for the
    staff member they ring afterwards.
    """

    amount_rupees = serializers.CharField(read_only=True)
    plan_name = serializers.CharField(source="plan.name", read_only=True)
    plan_code = serializers.CharField(source="plan.code", read_only=True)

    class Meta:
        model = Order
        fields = (
            "id", "plan_name", "plan_code", "amount_paise", "amount_rupees",
            "currency", "status", "method", "receipt_no", "created_at", "paid_at",
        )


class OrderPanelSerializer(serializers.ModelSerializer):
    """What staff see: everything, including who and why."""

    amount_rupees = serializers.CharField(read_only=True)
    plan_name = serializers.CharField(source="plan.name", read_only=True)
    user_name = serializers.CharField(source="user.name", read_only=True)
    user_phone = serializers.CharField(source="user.phone", read_only=True)
    refunded_by_name = serializers.CharField(source="refunded_by.name", read_only=True, default="")

    class Meta:
        model = Order
        fields = (
            "id", "plan_name", "user_name", "user_phone",
            "amount_paise", "amount_rupees", "currency", "status", "method",
            "receipt_no", "razorpay_order_id", "razorpay_payment_id",
            "failure_reason", "refunded_paise", "refunded_at", "refunded_by_name",
            "refund_reason", "created_at", "paid_at",
        )


class OrderCreateSerializer(serializers.Serializer):
    """Start a checkout.

    A plan code and nothing else. **No amount.** The price is read from the plan
    on the server — a client that supplies its own amount is a client that can
    supply ₹1, and no amount of validation downstream recovers from trusting it
    in the first place.
    """

    plan = serializers.SlugField(max_length=40)


class OrderVerifySerializer(serializers.Serializer):
    """What Razorpay's checkout hands back to the browser."""

    razorpay_order_id = serializers.CharField(max_length=64)
    razorpay_payment_id = serializers.CharField(max_length=64)
    razorpay_signature = serializers.CharField(max_length=128)


class RefundSerializer(serializers.Serializer):
    # Optional: absent means refund the whole thing, which is what staff mean
    # nine times out of ten.
    amount_paise = serializers.IntegerField(required=False, min_value=1)
    reason = serializers.CharField(max_length=300, allow_blank=True, required=False)
