"""OTP issuing/verifying, and the project's exception handler."""

import random

from django.conf import settings
from django.db import transaction
from rest_framework.exceptions import ValidationError
from rest_framework.views import exception_handler

from app.sms import is_test_phone, send_otp as send_sms
from user.models import Otp

PHONE_LENGTH = 10


def normalise_phone(phone) -> str:
    """Bare 10 digits for an Indian mobile.

    Teachers type "+91 98456 37278", "098456 37278" and "9845637278" for the
    same number, and a login that treats those as three different accounts is a
    login that will. Non-Indian numbers are not supported — the SMS route is
    DLT-registered for India and silently drops anything else.
    """
    digits = "".join(c for c in str(phone or "") if c.isdigit())
    if len(digits) > PHONE_LENGTH:
        digits = digits[-PHONE_LENGTH:]
    return digits


def is_valid_phone(phone: str) -> bool:
    return len(phone) == PHONE_LENGTH and phone[0] in "6789"


def issue_otp(phone: str, kind: str) -> tuple:
    """Write the code, THEN send it. Returns (otp_row, sent).

    The order is the whole point. allcoaching used to delete the old row, make
    the ~1s SMS call, and have the caller write the new row afterwards — so for
    that second the phone had no valid code, and a correct one typed in the
    window came back "Invalid OTP" while the row visible in admin a moment later
    matched what the user had typed exactly.
    """
    code = getattr(settings, "OTP_TEST_CODE", "000000") if is_test_phone(phone) else f"{random.randint(0, 999999):06d}"
    with transaction.atomic():
        Otp.objects.filter(phone=phone, kind=kind).delete()
        row = Otp.objects.create(phone=phone, otp=code, kind=kind)
    return row, send_sms(phone, code)


def verify_otp(phone: str, code: str, kind: str) -> None:
    """Raises ValidationError with a message the user can act on, or returns.

    Consumes the row on success — a code that works twice is a code that works
    for whoever read the SMS over a shoulder.
    """
    row = Otp.objects.filter(phone=phone, kind=kind).first()
    if row is None:
        raise ValidationError({"otp": "Ask for a new code — this one has already been used."})
    if row.is_expired:
        row.delete()
        raise ValidationError({"otp": "That code has expired. Ask for a new one."})
    if row.attempts >= Otp.MAX_ATTEMPTS:
        row.delete()
        raise ValidationError({"otp": "Too many wrong attempts. Ask for a new code."})
    if str(row.otp) != str(code or "").strip():
        Otp.objects.filter(pk=row.pk).update(attempts=row.attempts + 1)
        remaining = Otp.MAX_ATTEMPTS - row.attempts - 1
        suffix = f" {remaining} attempts left." if remaining > 0 else ""
        raise ValidationError({"otp": f"That code is not right.{suffix}"})
    row.delete()


def custom_exception_handler(exc, context):
    """Flatten DRF's errors into the one shape the frontend handles.

    ValidationError  → {"error": "Validation failed", "errors": {field: msg}, "status": "false"}
    everything else  → {"message": "...", "status": "false", "code": "..."}

    `code` is kept because the status alone stops identifying an error the moment
    two different things return the same one — the frontend keys its modals off
    `code`, never off the status.
    """
    response = exception_handler(exc, context)
    if response is None:
        return None

    if isinstance(exc, ValidationError):
        errors = {}

        def flatten(node, prefix=""):
            if isinstance(node, dict):
                for field, messages in node.items():
                    flatten(messages, f"{prefix}{field}.")
            elif isinstance(node, list):
                for message in node:
                    errors[prefix.rstrip(".")] = str(message)
            else:
                errors[prefix.rstrip(".")] = str(node)

        flatten(response.data)
        response.data = {"error": "Validation failed", "errors": errors, "status": "false"}
        return response

    message = response.data.get("detail", "Something went wrong.") if isinstance(response.data, dict) else "Something went wrong."
    data = {"message": str(message), "status": "false"}
    code = getattr(exc, "default_code", None)
    try:
        codes = exc.get_codes()
        if isinstance(codes, str):
            code = codes
    except Exception:
        pass
    if code:
        data["code"] = str(code)
    response.data = data
    return response
