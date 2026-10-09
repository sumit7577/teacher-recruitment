"""Transactional SMS — the sign-in OTP, and nothing else.

Same provider as allcoaching (Fast2SMS over DLT). Two things carried over from
there because both were learned the hard way:

* **No database writes in here.** The caller writes the OTP row BEFORE calling
  this. allcoaching used to delete the old row here and let the caller write the
  new one after the ~1s HTTP call returned — so for that second the phone had no
  valid OTP at all, and a correct code typed in the window came back "Invalid
  OTP" while the row visible in admin a moment later matched exactly what the
  user had typed.
* **Test phones never reach the gateway.** Play Store review needs an account it
  can sign into, and demoing the panel should not burn SMS credits.

Returns True/False. A failed send is not an exception: the caller decides
whether to tell the user "we could not send a code" or to fall back.
"""

import logging

import requests
from django.conf import settings

log = logging.getLogger(__name__)


def is_test_phone(phone: str) -> bool:
    return str(phone or "") in set(getattr(settings, "OTP_TEST_PHONES", []) or [])


def send_otp(phone: str, otp: str) -> bool:
    if is_test_phone(phone):
        log.info("otp: test phone %s, skipping gateway", phone)
        return True

    api_url = getattr(settings, "SMS_API_URL", None)
    api_key = getattr(settings, "SMS_API_KEY", None)
    if not api_url or not api_key:
        # Loud in the log either way. Whether that counts as "sent" is a
        # deployment decision, not this module's: see OTP_CONSOLE_FALLBACK.
        log.warning("otp: SMS not configured — code for %s is %s", phone, otp)
        return bool(getattr(settings, "OTP_CONSOLE_FALLBACK", False))

    template = getattr(settings, "SMS_TEMPLATE_ID", "")
    sender = getattr(settings, "SMS_SENDER_ID", "")
    params = {
        "authorization": api_key,
        "route": "dlt" if template else "otp",
        "numbers": phone,
    }
    if template:
        params["message"] = template
        params["sender_id"] = sender
        params["variables_values"] = otp
    else:
        # Fast2SMS' own OTP route, for before the client's DLT template is
        # approved. Their sender, their wording, no template id needed.
        params["variables_values"] = otp

    try:
        response = requests.get(api_url, params=params, timeout=10)
        response.raise_for_status()
        return True
    except requests.RequestException as exc:
        log.error("otp: send failed for %s: %s", phone, exc)
        return False
