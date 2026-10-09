"""Phone normalisation, and the project's exception handler."""

from rest_framework.exceptions import ValidationError
from rest_framework.views import exception_handler

PHONE_LENGTH = 10


def normalise_phone(phone) -> str:
    """Bare 10 digits for an Indian mobile.

    Teachers type "+91 98456 37278", "098456 37278" and "9845637278" for the
    same number, and a login that treats those as three different accounts is a
    login that will. Non-Indian numbers are not supported.
    """
    digits = "".join(c for c in str(phone or "") if c.isdigit())
    if len(digits) > PHONE_LENGTH:
        digits = digits[-PHONE_LENGTH:]
    return digits


def is_valid_phone(phone: str) -> bool:
    return len(phone) == PHONE_LENGTH and phone[0] in "6789"


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
