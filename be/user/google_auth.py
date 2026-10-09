"""Google sign-in — "or Google" in the proposal's sign-in box.

An account is linked by Google's stable subject id (`sub`), **never by email**.
Email is not proof of anything here: our own `User.email` holds whatever somebody
typed into a form, and linking on it would let an account be taken over by
signing up to Google with that address. `sub` is written only after a verified
ID token.
"""

from django.conf import settings
from rest_framework.exceptions import ValidationError


def verify(id_token: str) -> dict:
    """Returns the verified claims, or raises ValidationError.

    Audience is checked against our own client ids — an ID token is a bearer
    token for whoever it was minted for, so a token issued to a different app is
    not a sign-in here even though Google signed it.
    """
    client_ids = [c for c in (getattr(settings, "GOOGLE_OAUTH_CLIENT_IDS", []) or []) if c]
    if not client_ids:
        raise ValidationError({"id_token": "Google sign-in is not configured."})

    try:
        from google.auth.transport import requests as google_requests
        from google.oauth2 import id_token as google_id_token
    except ImportError:  # pragma: no cover
        raise ValidationError({"id_token": "Google sign-in is not available on this server."})

    last_error = None
    for client_id in client_ids:
        try:
            claims = google_id_token.verify_oauth2_token(
                id_token, google_requests.Request(), client_id
            )
        except Exception as exc:
            last_error = exc
            continue
        if claims.get("iss") not in ("accounts.google.com", "https://accounts.google.com"):
            last_error = ValueError("unexpected issuer")
            continue
        if not claims.get("sub"):
            last_error = ValueError("no subject in token")
            continue
        return claims

    raise ValidationError({"id_token": f"That Google sign-in could not be verified ({last_error})."})
