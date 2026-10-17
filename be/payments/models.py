"""Money — what is for sale, who bought it, and what Razorpay said about it.

Three models and a deliberate separation between them:

    `Plan`          what is for sale, editable from the admin
    `Order`         one attempt to buy one plan, by one account
    `WebhookEvent`  what Razorpay told us, recorded once

## Why `Plan` is a table and not a constant

Nobody has settled what this platform charges for. The three live candidates are
a one-time registration fee from teachers, a subscription from institutions that
want to post vacancies, and a placement fee when a hire completes. They are not
three different payment systems — they are three rows. Putting the price in code
means a deploy to change it and a developer in the room for a commercial
decision, which is the wrong shape for a question the client has not answered.

## Why the amount is on the `Order` too

A plan's price changes. An order records what was actually charged at the time
it was charged, because a receipt that reprices itself when somebody edits a plan
is not a receipt. `Order.amount_paise` is written once and never follows `Plan`.

## Paise, not rupees

Integers throughout. Razorpay's API is in paise and a float rupee is a rounding
error waiting for a reconciliation meeting. `amount_rupees` renders it for
display; nothing computes with that value.
"""

from django.db import models
from django.utils import timezone

from app.public_id import PublicId
from user.models import User


class Plan(models.Model):
    """Something that can be bought.

    `code` is the stable handle the frontend and any future app refer to —
    rename the display `name` freely, never the code.
    """

    AUDIENCE_TEACHER = "teacher"
    AUDIENCE_SCHOOL = "school"
    AUDIENCE_CHOICES = (
        (AUDIENCE_TEACHER, "Teachers"),
        (AUDIENCE_SCHOOL, "Institutions"),
    )

    INTERVAL_ONCE = "once"
    INTERVAL_CHOICES = (
        (INTERVAL_ONCE, "One-time"),
        ("monthly", "Every month"),
        ("yearly", "Every year"),
    )

    id = PublicId(prefix="pln")
    code = models.SlugField(max_length=40, unique=True)
    name = models.CharField(max_length=140)
    description = models.TextField(blank=True, default="")
    audience = models.CharField(max_length=10, choices=AUDIENCE_CHOICES, db_index=True)
    interval = models.CharField(max_length=10, choices=INTERVAL_CHOICES, default=INTERVAL_ONCE)

    amount_paise = models.PositiveIntegerField(help_text="In paise. ₹499 is 49900.")

    # What buying it actually does. Left as a plain integer rather than wired to
    # a permissions system, because what it should unlock is the open commercial
    # question — this records the intent so the day it is answered the data is
    # already there. 0 = buying it grants nothing automatic.
    grants_days = models.PositiveSmallIntegerField(
        default=0, help_text="Days of access this buys. 0 for a one-off fee that unlocks nothing automatically.",
    )
    grants_vacancies = models.PositiveSmallIntegerField(
        default=0, help_text="Vacancy postings this buys, for an institution plan.",
    )

    is_active = models.BooleanField(default=True, db_index=True)
    order = models.PositiveSmallIntegerField(default=0, db_index=True)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    @property
    def amount_rupees(self) -> str:
        """For display only. Never compute with this."""
        return f"{self.amount_paise / 100:,.2f}".rstrip("0").rstrip(".")

    def __str__(self) -> str:
        return f"{self.name} (₹{self.amount_rupees})"

    class Meta:
        managed = True
        db_table = "plan"
        ordering = ("order", "amount_paise")


class Order(models.Model):
    """One attempt to buy one plan.

    A row is created the moment checkout opens, before any money moves, and it
    is never deleted. A failed or abandoned payment is a row in `created` or
    `failed` — that is the record of someone trying to pay and not managing it,
    which is the single most useful thing in this table when a user telephones.
    """

    STATUS_CREATED = "created"
    STATUS_PAID = "paid"
    STATUS_FAILED = "failed"
    STATUS_REFUNDED = "refunded"
    STATUS_CHOICES = (
        (STATUS_CREATED, "Awaiting payment"),
        (STATUS_PAID, "Paid"),
        (STATUS_FAILED, "Failed"),
        (STATUS_REFUNDED, "Refunded"),
    )

    id = PublicId(prefix="ord")
    user = models.ForeignKey(User, on_delete=models.PROTECT, related_name="orders")
    # PROTECT, not CASCADE: deleting a plan must not delete the record of money
    # that was taken for it.
    plan = models.ForeignKey(Plan, on_delete=models.PROTECT, related_name="orders")

    # Frozen at creation. Never follows the plan's current price.
    amount_paise = models.PositiveIntegerField()
    currency = models.CharField(max_length=3, default="INR")

    razorpay_order_id = models.CharField(max_length=64, blank=True, default="", db_index=True)
    # Unique when present: one Razorpay payment settles exactly one order, and
    # the constraint is what makes a replayed webhook harmless at the database
    # level rather than only in the code that handles it.
    razorpay_payment_id = models.CharField(
        max_length=64, blank=True, null=True, unique=True, db_index=True,
    )
    method = models.CharField(max_length=20, blank=True, default="")

    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default=STATUS_CREATED, db_index=True)
    # Razorpay's own words when a payment fails. Shown to staff, not to the
    # payer — "card declined by issuing bank" is for the person on the phone.
    failure_reason = models.CharField(max_length=300, blank=True, default="")

    # Sequential, human-quotable, assigned only when money actually arrives.
    # Numbering failed attempts would put gaps in the receipt book.
    receipt_no = models.CharField(max_length=24, blank=True, default="", db_index=True)

    refunded_paise = models.PositiveIntegerField(default=0)
    refunded_at = models.DateTimeField(null=True, blank=True)
    refunded_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name="refunds_made",
    )
    refund_reason = models.CharField(max_length=300, blank=True, default="")

    notes = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(default=timezone.now, db_index=True)
    paid_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    @property
    def amount_rupees(self) -> str:
        return f"{self.amount_paise / 100:,.2f}".rstrip("0").rstrip(".")

    @property
    def is_refundable(self) -> bool:
        return self.status == self.STATUS_PAID and self.refunded_paise < self.amount_paise

    def mark_paid(self, payment_id: str, method: str = "") -> bool:
        """Settle this order. Returns False if it was already settled.

        **Idempotent on purpose.** Razorpay retries a webhook until it gets a
        200, and the browser's own callback may arrive first — so this runs more
        than once for a single payment, routinely, not exceptionally. The guard
        is what stops a second call issuing a second receipt number.
        """
        if self.status == self.STATUS_PAID:
            return False
        self.status = self.STATUS_PAID
        self.razorpay_payment_id = payment_id or self.razorpay_payment_id
        self.method = method or self.method
        self.paid_at = timezone.now()
        if not self.receipt_no:
            self.receipt_no = next_receipt_no()
        self.save(update_fields=[
            "status", "razorpay_payment_id", "method", "paid_at", "receipt_no", "updated_at",
        ])
        return True

    def __str__(self) -> str:
        return f"{self.receipt_no or self.id} · ₹{self.amount_rupees} · {self.status}"

    class Meta:
        managed = True
        db_table = "payment_order"
        ordering = ("-created_at",)
        indexes = [models.Index(fields=["user", "status"])]


def next_receipt_no() -> str:
    """`JS/2026-27/00001` — financial year, then a counter inside it.

    Indian financial years run April to March, so the year part is derived from
    the month and not from `year`. The counter restarts each April, which is
    what an accountant expects to see.

    Derived by counting rather than kept in a sequence table: this runs once per
    successful payment, a handful of times a day, and a count over an indexed
    column is cheaper than a second table to keep in step. If this platform ever
    takes payments fast enough for two to collide, the fix is a database
    sequence — and `mark_paid` is the only caller, so it is one change.
    """
    now = timezone.now()
    start_year = now.year if now.month >= 4 else now.year - 1
    label = f"{start_year}-{str(start_year + 1)[-2:]}"
    count = Order.objects.filter(receipt_no__startswith=f"JS/{label}/").count()
    return f"JS/{label}/{count + 1:05d}"


class WebhookEvent(models.Model):
    """What Razorpay sent us, recorded once and only once.

    `event_id` is unique, and that constraint is the idempotency. Razorpay
    retries an event until it receives a 200, so the same `payment.captured`
    arrives repeatedly whenever a handler is slow — and a handler that credits
    an account must run for the first delivery and not the fourth.

    Unknown event kinds are stored and ignored. Returning anything other than
    200 to an event we have no handler for just makes Razorpay retry it all day.
    """

    id = PublicId(prefix="whk")
    event_id = models.CharField(max_length=80, unique=True, db_index=True)
    kind = models.CharField(max_length=60, db_index=True)
    payload = models.JSONField(default=dict, blank=True)
    handled = models.BooleanField(default=False)
    note = models.CharField(max_length=300, blank=True, default="")
    received_at = models.DateTimeField(default=timezone.now, db_index=True)

    def __str__(self) -> str:
        return f"{self.kind} · {self.event_id}"

    class Meta:
        managed = True
        db_table = "payment_webhook_event"
        ordering = ("-received_at",)
