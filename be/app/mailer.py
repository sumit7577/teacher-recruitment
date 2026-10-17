"""Outbound email — the one place that talks to the mail server.

A sibling of `app/fcm.py`, and it follows the same rule: **a failure to deliver
must never take down the thing that triggered it.** A teacher's application is
saved whether or not the confirmation mail goes out, so every function here
returns a bool and logs; none of them raise into a view.

The one exception is an emailed one-time code, where delivery *is* the feature.
That caller checks the return value and tells the user plainly when the mail
could not be sent, rather than leaving them to wait for something that is not
coming.

## Why there is HTML here at all

Because a six-digit code set in 11px proportional type, wrapped by a mail
client, misread as `0`/`O` and typed back in wrong is a support call. The plain
text part carries the same code for anything that cannot render HTML, and both
are generated from the same string so they cannot drift.
"""

import logging

from django.conf import settings
from django.core.mail import EmailMultiAlternatives

logger = logging.getLogger(__name__)


def _brand() -> str:
    """The firm's name, from the CMS if it has been set.

    Wrapped in a try because mail is sent from paths that run before the row
    exists (a fresh database, a management command) and a missing brand name is
    not a reason to fail to send a password reset.
    """
    try:
        from cms.models import SiteSetting

        return SiteSetting.load().brand_name or "Jeewan Sir"
    except Exception:  # noqa: BLE001 — never let branding break delivery
        return "Jeewan Sir"


def send(to: str, subject: str, text: str, html: str | None = None) -> bool:
    """Send one message. True if the mail server accepted it.

    "Accepted" is not "delivered" — a mail server takes the message and may
    still bounce it later. Nothing here can know that, and a caller that treats
    True as proof of delivery is wrong. It is enough to distinguish "we could
    not even hand it over" from "it is on its way", which is the distinction the
    user interface needs.
    """
    to = (to or "").strip()
    if not to:
        return False

    try:
        message = EmailMultiAlternatives(
            subject=subject,
            body=text,
            from_email=getattr(settings, "DEFAULT_FROM_EMAIL", "no-reply@localhost"),
            to=[to],
        )
        if html:
            message.attach_alternative(html, "text/html")
        sent = message.send(fail_silently=False)
        return bool(sent)
    except Exception as exc:  # noqa: BLE001 — SMTP raises a wide family
        logger.exception("email to %s failed: %s", to, exc)
        return False


# ── the one-time code ───────────────────────────────────────────────────────

_CODE_INTENT = {
    "verify_email": (
        "Confirm your email address",
        "Use this code to confirm your email address.",
    ),
    "reset_password": (
        "Reset your password",
        "Use this code to set a new password.",
    ),
}


def send_code(to: str, code: str, purpose: str, name: str = "") -> bool:
    """Email a one-time code.

    Called *after* the row is written. See `EmailCode.issue` for why that order
    is not negotiable.
    """
    brand = _brand()
    subject_tail, line = _CODE_INTENT.get(purpose, _CODE_INTENT["verify_email"])
    # Plain ASCII, deliberately: an em-dash here makes Django RFC2047-encode
    # the whole subject ("=?utf-8?q?907758_=E2=80=94_Reset...?="). Clients
    # decode that correctly, but a lock-screen preview is the place the code is
    # most often read from, and a hyphen keeps it legible everywhere.
    subject = f"{code} - {subject_tail}"
    greeting = f"Hello {name}," if name else "Hello,"
    minutes = 10

    text = (
        f"{greeting}\n\n"
        f"{line}\n\n"
        f"    {code}\n\n"
        f"It stops working in {minutes} minutes.\n\n"
        f"If you did not ask for this, you can ignore this email — nothing has\n"
        f"changed on your account, and nobody can use this code without it.\n\n"
        f"— {brand}"
    )

    # Inline styles only: every mail client strips <style> blocks, and half of
    # them strip <head> with it. Letter-spacing is what stops the code being
    # read as one number instead of six digits.
    html = f"""\
<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;
            font-size:15px;line-height:1.55;color:#121820;max-width:480px">
  <p style="margin:0 0 16px">{greeting}</p>
  <p style="margin:0 0 20px">{line}</p>
  <div style="font-size:30px;font-weight:700;letter-spacing:7px;
              padding:16px 20px;background:#FDEDE4;border-radius:10px;
              text-align:center;color:#121820">{code}</div>
  <p style="margin:18px 0 0;color:#444c58">It stops working in {minutes} minutes.</p>
  <p style="margin:14px 0 0;color:#78818e;font-size:13px">
    If you did not ask for this you can ignore this email. Nothing on your
    account has changed, and this code is useless to anyone who does not have it.
  </p>
  <p style="margin:22px 0 0;color:#78818e;font-size:13px">&mdash; {brand}</p>
</div>"""

    return send(to, subject, text, html)
