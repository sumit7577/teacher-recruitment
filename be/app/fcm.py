"""Firebase Cloud Messaging — the push that brings a teacher back.

Two kinds of send, and the proposal promises both: "a notification the moment a
vacancy in their subject opens, and the demo-class date the moment it is fixed."

The Firebase app is initialised lazily and once. At import time the credentials
file may not exist yet (a fresh clone, a CI build running `collectstatic`), and
an exception there takes the whole process down instead of one feature.
"""

import logging
import os

from django.conf import settings

log = logging.getLogger(__name__)

_app = None
_tried = False


def _firebase():
    global _app, _tried
    if _app is not None or _tried:
        return _app
    _tried = True
    path = getattr(settings, "FCM_CREDENTIALS_FILE", "")
    if not path or not os.path.exists(path):
        log.warning("fcm: credentials file missing at %s — push disabled", path)
        return None
    try:
        import firebase_admin
        from firebase_admin import credentials

        _app = firebase_admin.initialize_app(credentials.Certificate(path))
    except Exception as exc:
        log.error("fcm: init failed: %s", exc)
        _app = None
    return _app


def send(tokens, title: str, body: str, data: dict | None = None) -> dict:
    """Multicast to up to 500 tokens — FCM's own per-call limit, which is why
    this chunks rather than trusting the caller to.

    Returns {"sent": n, "failed": n, "invalid": [tokens]}. Invalid tokens are
    handed back rather than deleted here: this module does not own the device
    table, and a function that silently deletes rows is one nobody can reuse.
    """
    result = {"sent": 0, "failed": 0, "invalid": []}
    tokens = [t for t in dict.fromkeys(tokens or []) if t]
    if not tokens:
        return result
    if _firebase() is None:
        result["failed"] = len(tokens)
        return result

    from firebase_admin import messaging

    notification = messaging.Notification(title=title, body=body)
    payload = {str(k): str(v) for k, v in (data or {}).items()}

    for start in range(0, len(tokens), 500):
        chunk = tokens[start:start + 500]
        message = messaging.MulticastMessage(tokens=chunk, notification=notification, data=payload)
        try:
            response = messaging.send_each_for_multicast(message)
        except Exception as exc:
            log.error("fcm: multicast failed: %s", exc)
            result["failed"] += len(chunk)
            continue
        result["sent"] += response.success_count
        result["failed"] += response.failure_count
        for token, outcome in zip(chunk, response.responses):
            if outcome.success:
                continue
            error = getattr(outcome, "exception", None)
            code = getattr(error, "code", "") or ""
            # The app was uninstalled or the token was reissued. Anything else
            # (a network blip, a quota) must NOT cost the device its token.
            if "registration-token-not-registered" in str(code) or "invalid-argument" in str(code):
                result["invalid"].append(token)
    return result
