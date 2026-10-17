"""Razorpay, over plain HTTP.

No SDK. `requests` is already a dependency (Google sign-in needs it), the four
endpoints this platform touches are four URLs, and a payment integration is the
last place to want a layer between the code and what actually went over the
wire. allcoaching does the same thing for the same reason.

Every function returns one of two shapes and never raises:

    {"status": True,  "data": {...}}
    {"status": False, "error": {...}, "http": 400}

A payment view that has to decide between "charge them" and "don't" should be
reading a flag, not catching exceptions from three different libraries.

## The two signatures, which are not the same thing

Razorpay signs two different things with two different secrets, and confusing
them is the classic way to ship a payment system that accepts forged payments:

  * **Checkout signature** — `order_id|payment_id` HMAC'd with the **API
    secret**. It comes back through the user's *browser* after they pay. It
    proves the browser isn't lying about which payment belongs to which order.
    It does NOT prove the money arrived.

  * **Webhook signature** — the raw request body HMAC'd with the **webhook
    secret**, a different value set in the dashboard. It comes from Razorpay's
    servers directly. This is what proves the money arrived.

We verify both, and only the webhook is allowed to mark an order paid. See
`payments/views.py` for why the browser is never trusted with that.
"""

import hashlib
import hmac
import json
import logging

import requests
from django.conf import settings

logger = logging.getLogger(__name__)

_API = "https://api.razorpay.com/v1"


def _key() -> str:
    return getattr(settings, "RAZORPAY_KEY_ID", "") or ""


def _secret() -> str:
    return getattr(settings, "RAZORPAY_KEY_SECRET", "") or ""


def configured() -> bool:
    """Whether payments can run at all. Checked by the views so an unconfigured
    deployment answers "payments are not switched on" instead of a 500 from
    inside an HTTP call with empty credentials."""
    return bool(_key() and _secret())


def _request(method: str, path: str, payload: dict | None = None) -> dict:
    url = f"{_API}{path}"
    try:
        response = requests.request(
            method,
            url,
            auth=(_key(), _secret()),
            headers={"Content-Type": "application/json"},
            data=json.dumps(payload) if payload is not None else None,
            # Razorpay is normally fast. A long timeout here means a user
            # staring at a spinner on the checkout button; better to fail and
            # let them press it again, since nothing has been charged yet.
            timeout=20,
        )
        if response.ok:
            return {"status": True, "data": response.json()}
        try:
            error = response.json().get("error", response.json())
        except ValueError:
            error = {"description": response.text or "Razorpay returned an error."}
        logger.warning("razorpay %s %s → %s · %s", method, path, response.status_code, error)
        return {"status": False, "error": error, "http": response.status_code}
    except requests.RequestException as exc:
        logger.exception("razorpay %s %s failed", method, path)
        return {"status": False, "error": {"description": str(exc)}, "http": 0}


# ── orders and payments ─────────────────────────────────────────────────────


def create_order(amount_paise: int, receipt: str, notes: dict | None = None) -> dict:
    """`POST /orders` — reserve an amount before the browser opens checkout.

    The amount is fixed here, on the server, and Razorpay will not let the
    browser pay a different one. That is the entire reason an order exists: a
    client that posts its own amount is a client that can post ₹1.
    """
    return _request(
        "POST",
        "/orders",
        {
            "amount": int(amount_paise),
            "currency": "INR",
            "receipt": receipt[:40],
            # Razorpay echoes notes back on the payment and in the webhook,
            # which is how a webhook arriving with no session can still find
            # the row it belongs to.
            "notes": notes or {},
        },
    )


def fetch_payment(payment_id: str) -> dict:
    """`GET /payments/<id>` — the authoritative state of one payment."""
    return _request("GET", f"/payments/{payment_id}")


def refund(payment_id: str, amount_paise: int | None = None, notes: dict | None = None) -> dict:
    """`POST /payments/<id>/refund` — full refund, or partial with an amount."""
    payload: dict = {"notes": notes or {}}
    if amount_paise is not None:
        payload["amount"] = int(amount_paise)
    return _request("POST", f"/payments/{payment_id}/refund", payload)


# ── signatures ──────────────────────────────────────────────────────────────


def verify_checkout_signature(order_id: str, payment_id: str, signature: str) -> bool:
    """What the browser hands back after Razorpay's modal closes.

    `HMAC_SHA256(order_id + "|" + payment_id, api_secret)`. Proves the browser
    did not invent the pairing. Does **not** prove the payment succeeded — only
    the webhook does that, and `payments/views.py` acts accordingly.
    """
    secret = _secret()
    if not (secret and order_id and payment_id and signature):
        return False
    expected = hmac.new(
        secret.encode("utf-8"),
        f"{order_id}|{payment_id}".encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected, signature)


def verify_webhook_signature(body: bytes, signature: str) -> bool:
    """`HMAC_SHA256(raw_body, webhook_secret)` from `X-Razorpay-Signature`.

    The **raw** body, byte for byte as received. Re-serialising the parsed JSON
    produces a different string (key order, whitespace) and therefore a
    different digest, and the webhook silently rejects every real event while
    looking perfectly correct in review.

    `compare_digest`, not `==`, so a wrong signature cannot be refined one byte
    at a time by measuring how long the comparison took.
    """
    secret = getattr(settings, "RAZORPAY_WEBHOOK_SECRET", "") or ""
    if not (secret and signature):
        return False
    expected = hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)
