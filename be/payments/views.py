"""Taking money, and recording that it was taken.

Four audiences, same rules as everywhere else (CLAUDE.md §3):

    v1/public/plans/     what is for sale. Anonymous — a price is a public fact.
    v1/pay/              a signed-in user buying something.
    v1/panel/payments/   staff reading the ledger and issuing refunds.
    razorpay-webhook/    Razorpay itself. The signature IS the authentication.

## The rule this module is built around

**Only the webhook may mark an order paid.**

The browser also tells us a payment succeeded, and that message is signed, and
we do verify the signature — but all it proves is that the browser is not lying
about which payment id goes with which order id. It does not prove the bank
moved any money, and a determined person controls their own browser.

So `OrderVerifyView` verifies the signature, records the payment id, asks
Razorpay directly what the status is, and only then settles. The webhook does
the same thing independently. Whichever arrives first wins; `Order.mark_paid` is
idempotent so the loser changes nothing. That redundancy is deliberate: webhooks
are occasionally delayed by minutes, and a user who has paid should not be
staring at an unpaid screen for either of those minutes.
"""

import json
import logging

from django.db import transaction
from django.http import HttpResponse, HttpResponseBadRequest, HttpResponseForbidden
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST
from rest_framework.generics import ListAPIView
from rest_framework.permissions import AllowAny
from rest_framework.views import APIView

from app import mailer, razorpay_api
from app.responses import fail, ok
from payments.models import Order, Plan, WebhookEvent
from payments.serializer import (
    OrderCreateSerializer,
    OrderPanelSerializer,
    OrderReadSerializer,
    OrderVerifySerializer,
    PlanReadSerializer,
    RefundSerializer,
)
from user.auth import CustomAuthentication, IsSignedIn, IsStaff

logger = logging.getLogger(__name__)


# ── what is for sale ────────────────────────────────────────────────────────


class PlanListView(ListAPIView):
    """GET v1/public/plans/ — the price list. No token.

    Anonymous because a price has to be readable before anyone signs up, and
    hiding it behind a token only means the pricing page cannot render.
    `?audience=teacher` narrows it.
    """

    authentication_classes = []
    permission_classes = [AllowAny]
    serializer_class = PlanReadSerializer
    pagination_class = None

    def get_queryset(self):
        plans = Plan.objects.filter(is_active=True)
        audience = self.request.query_params.get("audience")
        if audience in dict(Plan.AUDIENCE_CHOICES):
            plans = plans.filter(audience=audience)
        return plans


# ── buying ──────────────────────────────────────────────────────────────────


class OrderCreateView(APIView):
    """POST v1/pay/order — open a checkout.

    Returns everything the browser's Razorpay widget needs, including the key
    id. The key id is public by design (it is in the page source of every site
    using Razorpay); the *secret* never leaves this server.
    """

    authentication_classes = [CustomAuthentication]
    permission_classes = [IsSignedIn]

    def post(self, request):
        if not razorpay_api.configured():
            return fail("Payments are not switched on yet.", status_code=503)

        serializer = OrderCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        plan = Plan.objects.filter(code=serializer.validated_data["plan"], is_active=True).first()
        if plan is None:
            return fail("That plan is not available.", status_code=404)

        # The row exists before Razorpay is called, so an order that Razorpay
        # creates but whose response we never see is still traceable to a user.
        order = Order.objects.create(
            user=request.user,
            plan=plan,
            amount_paise=plan.amount_paise,
            notes={"plan": plan.code},
        )

        created = razorpay_api.create_order(
            amount_paise=order.amount_paise,
            receipt=str(order.id),
            # Echoed back on the webhook. It is how an event that arrives with
            # no session still finds its row.
            notes={"order": str(order.id), "user": str(request.user.id), "plan": plan.code},
        )
        if not created["status"]:
            order.status = Order.STATUS_FAILED
            order.failure_reason = str(created.get("error", ""))[:300]
            order.save(update_fields=["status", "failure_reason", "updated_at"])
            return fail("Could not start that payment. Try again in a moment.", status_code=502)

        order.razorpay_order_id = created["data"]["id"]
        order.save(update_fields=["razorpay_order_id", "updated_at"])

        return ok("Order created.", {
            "order": OrderReadSerializer(order).data,
            "razorpay_order_id": order.razorpay_order_id,
            "amount_paise": order.amount_paise,
            "currency": order.currency,
            "key_id": razorpay_api._key(),
            "name": request.user.name,
            "email": request.user.email or "",
            "phone": request.user.phone,
        })


class OrderVerifyView(APIView):
    """POST v1/pay/verify — the browser reporting back.

    Three steps, in this order, and the third is the one that matters:

      1. Check the signature. Proves the browser did not invent the pairing.
      2. Record the payment id against the order either way.
      3. **Ask Razorpay what the status actually is**, and settle on that.

    Step 3 is why this cannot be spoofed. A forged call gets past step 1 only
    with the API secret, and even then step 3 asks Razorpay about a payment id
    that either is captured or is not.
    """

    authentication_classes = [CustomAuthentication]
    permission_classes = [IsSignedIn]

    def post(self, request):
        serializer = OrderVerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        order = Order.objects.filter(
            razorpay_order_id=data["razorpay_order_id"], user=request.user,
        ).first()
        if order is None:
            return fail("No such order.", status_code=404)

        if not razorpay_api.verify_checkout_signature(
            data["razorpay_order_id"], data["razorpay_payment_id"], data["razorpay_signature"],
        ):
            logger.warning("checkout signature failed for order %s", order.id)
            return fail("That payment could not be verified.", status_code=400)

        # Already settled by the webhook, which beat the browser here. Common,
        # not exceptional — answer success rather than confusing the user.
        if order.status == Order.STATUS_PAID:
            return ok("Payment received.", OrderReadSerializer(order).data)

        fetched = razorpay_api.fetch_payment(data["razorpay_payment_id"])
        if not fetched["status"]:
            return fail("We could not confirm that payment yet. It will update shortly.", status_code=202)

        payment = fetched["data"]
        if payment.get("status") != "captured":
            order.status = Order.STATUS_FAILED
            order.failure_reason = (payment.get("error_description") or payment.get("status") or "")[:300]
            order.save(update_fields=["status", "failure_reason", "updated_at"])
            return fail("That payment did not go through.", status_code=400)

        settle(order, payment)
        order.refresh_from_db()
        return ok("Payment received.", OrderReadSerializer(order).data)


class MyOrdersView(ListAPIView):
    """GET v1/pay/orders — what this account has paid, newest first."""

    authentication_classes = [CustomAuthentication]
    permission_classes = [IsSignedIn]
    serializer_class = OrderReadSerializer

    def get_queryset(self):
        # Tenant isolation in the queryset, never in a parameter (CLAUDE.md §4.1).
        return Order.objects.filter(user=self.request.user).select_related("plan")


# ── settling, in one place ──────────────────────────────────────────────────


def settle(order: Order, payment: dict) -> bool:
    """Mark an order paid and send the receipt. Safe to call twice.

    Both the browser callback and the webhook land here, so this is the only
    function that writes `status = paid`. Keeping it in one place is what makes
    "a receipt is emailed exactly once" true rather than aspirational.
    """
    with transaction.atomic():
        # Lock the row: the webhook and the browser callback genuinely do arrive
        # at the same moment, and without this both can pass the `mark_paid`
        # guard and issue two receipt numbers for one payment.
        locked = Order.objects.select_for_update().get(pk=order.pk)
        newly = locked.mark_paid(payment.get("id", ""), payment.get("method", ""))

    if not newly:
        return False

    _email_receipt(locked)
    return True


def _email_receipt(order: Order) -> None:
    """Best-effort. A receipt that fails to send must not un-take the money."""
    to = (order.user.email or "").strip()
    if not to:
        return
    try:
        mailer.send(
            to=to,
            subject=f"Receipt {order.receipt_no} — ₹{order.amount_rupees}",
            text=(
                f"Hello {order.user.name or ''},\n\n"
                f"We have received ₹{order.amount_rupees} for {order.plan.name}.\n\n"
                f"Receipt number: {order.receipt_no}\n"
                f"Paid on: {timezone.localtime(order.paid_at).strftime('%d %B %Y, %I:%M %p')}\n\n"
                f"Keep this email — it is your receipt."
            ),
        )
    except Exception:  # noqa: BLE001
        logger.exception("receipt email failed for order %s", order.id)


# ── the webhook ─────────────────────────────────────────────────────────────


@csrf_exempt
@require_POST
def razorpay_webhook(request):
    """POST razorpay-webhook/ — Razorpay telling us what happened.

    Auth-exempt because **the signature is the authentication**. There is no
    session here and no token; the only thing that distinguishes a real event
    from a forged one is an HMAC of the raw body with the webhook secret.

    Not a DRF view. DRF reads and re-serialises the body, and the signature is
    over the raw bytes — byte for byte, key order and whitespace included. A
    re-serialised body produces a different digest and rejects every genuine
    event while looking entirely correct.

    Always answers 200 once the signature passes, including for events it has no
    handler for. A non-200 makes Razorpay retry the same event for hours.
    """
    signature = request.headers.get("X-Razorpay-Signature", "")
    if not razorpay_api.verify_webhook_signature(request.body, signature):
        logger.warning("razorpay webhook rejected: bad signature")
        return HttpResponseForbidden("bad signature")

    try:
        event = json.loads(request.body.decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        return HttpResponseBadRequest("bad json")

    kind = event.get("event", "")
    entity = (event.get("payload", {}).get("payment", {}) or {}).get("entity", {}) or {}
    # Razorpay does not send a stable event id in every version of this payload,
    # so the idempotency key is the payment id plus the event name — unique per
    # (payment, transition), which is exactly the granularity we need.
    event_id = f"{entity.get('id', '')}:{kind}" if entity.get("id") else event.get("id", "")
    if not event_id:
        return HttpResponse("ignored")

    record, created = WebhookEvent.objects.get_or_create(
        event_id=event_id, defaults={"kind": kind, "payload": event},
    )
    if not created:
        # Already seen. Razorpay retries until it gets a 200, so this is the
        # normal path for any event whose first delivery we were slow to answer.
        return HttpResponse("duplicate")

    try:
        note = _handle(kind, entity)
        record.handled = True
        record.note = note[:300]
    except Exception as exc:  # noqa: BLE001
        # Recorded, not retried. A handler that throws will throw again on every
        # retry; the row is the breadcrumb for whoever investigates.
        logger.exception("webhook handler failed for %s", event_id)
        record.note = f"error: {exc}"[:300]
    record.save(update_fields=["handled", "note"])

    return HttpResponse("ok")


def _handle(kind: str, entity: dict) -> str:
    """Act on one event. Returns a note for the audit row."""
    if kind not in ("payment.captured", "payment.failed"):
        return "no handler"

    order = _order_for(entity)
    if order is None:
        return "no matching order"

    if kind == "payment.captured":
        return "settled" if settle(order, entity) else "already settled"

    if order.status != Order.STATUS_PAID:
        order.status = Order.STATUS_FAILED
        order.failure_reason = (entity.get("error_description") or "")[:300]
        order.save(update_fields=["status", "failure_reason", "updated_at"])
        return "marked failed"
    # A `payment.failed` for an order already paid is a different payment
    # attempt on the same order. Do not undo a successful one.
    return "ignored: order already paid"


def _order_for(entity: dict):
    """Find the order an event belongs to.

    Razorpay's order id first, since that is the link we created. The `notes`
    fallback covers an order created directly in the Razorpay dashboard, which
    is how a staff member taking a payment over the phone would do it.
    """
    rp_order_id = entity.get("order_id") or ""
    if rp_order_id:
        found = Order.objects.filter(razorpay_order_id=rp_order_id).first()
        if found:
            return found
    note_order = (entity.get("notes") or {}).get("order")
    if note_order:
        return Order.objects.filter(id=note_order).first()
    return None


# ── the panel ───────────────────────────────────────────────────────────────


class PanelOrderList(ListAPIView):
    """GET v1/panel/payments/ — the ledger. `?status=paid`, `?q=` on receipt."""

    authentication_classes = [CustomAuthentication]
    permission_classes = [IsStaff]
    serializer_class = OrderPanelSerializer

    def get_queryset(self):
        orders = Order.objects.select_related("plan", "user", "refunded_by")
        status = self.request.query_params.get("status")
        if status in dict(Order.STATUS_CHOICES):
            orders = orders.filter(status=status)
        query = (self.request.query_params.get("q") or "").strip()
        if query:
            orders = orders.filter(receipt_no__icontains=query) | orders.filter(
                user__phone__icontains=query
            )
        return orders


class PanelRefundView(APIView):
    """POST v1/panel/payments/<id>/refund — give it back.

    Staff only, and the reason is recorded against the staff member who did it.
    A refund with no name on it is the thing nobody can explain at the end of
    the quarter.
    """

    authentication_classes = [CustomAuthentication]
    permission_classes = [IsStaff]

    def post(self, request, pk):
        order = Order.objects.filter(pk=pk).first()
        if order is None:
            return fail("No such payment.", status_code=404)
        if not order.is_refundable:
            return fail("That payment cannot be refunded.", status_code=400)

        serializer = RefundSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        amount = serializer.validated_data.get("amount_paise") or (
            order.amount_paise - order.refunded_paise
        )
        if amount > order.amount_paise - order.refunded_paise:
            return fail("That is more than is left to refund.", status_code=400)

        result = razorpay_api.refund(
            order.razorpay_payment_id, amount_paise=amount,
            notes={"by": str(request.user.id), "order": str(order.id)},
        )
        if not result["status"]:
            return fail("Razorpay refused that refund.", status_code=502)

        order.refunded_paise += amount
        order.refunded_at = timezone.now()
        order.refunded_by = request.user
        order.refund_reason = serializer.validated_data.get("reason", "")[:300]
        if order.refunded_paise >= order.amount_paise:
            order.status = Order.STATUS_REFUNDED
        order.save(update_fields=[
            "refunded_paise", "refunded_at", "refunded_by", "refund_reason", "status", "updated_at",
        ])
        return ok("Refunded.", OrderPanelSerializer(order).data)
