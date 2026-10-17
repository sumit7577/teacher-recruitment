"""Sign-in and identity, for all three audiences.

"One door, two sides of the same hire." Every endpoint here takes a `role`, and
the role decides what the token opens and which questions get asked next. Two
ways in — a password, or Google — and both land in the same `_sign_in`, so the
response the client parses never depends on how they arrived.

There is no one-time code over **SMS**. It needed a DLT-registered sender the
client does not have, and an account nobody can sign into because a gateway is
unconfigured is worse than one with a password to remember.

There is one over **email**, at the foot of this module: it needs no
registration, costs effectively nothing, and carries the two flows that were
previously a telephone call — proving an address, and resetting a forgotten
password. The office can still reset a password from the panel, which remains
the only route for a teacher who has no email address at all.
"""

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from rest_framework.generics import RetrieveUpdateAPIView
from rest_framework.permissions import AllowAny
from rest_framework.views import APIView

from app import mailer
from app.responses import fail, ok
from user import google_auth
from user.auth import CustomAuthentication, IsSignedIn
from user.models import AuthToken, EmailCode, User
from user.serializer import (
    EmailCodeRequestSerializer,
    EmailVerifySerializer,
    GoogleLoginSerializer,
    PasswordLoginSerializer,
    PasswordResetConfirmSerializer,
    PasswordSetSerializer,
    SignUpSerializer,
    UserReadSerializer,
    UserSerializer,
)


def _profile_summary(user, role: str) -> dict:
    """What the client needs to decide where to land them.

    `needs_profile` is the whole reason this exists: a phone number proves who
    they are but says nothing about what they teach, and the signup wizard has
    to open for a teacher with no profile and must NOT open for one who has it.
    """
    if role == "teacher":
        profile = getattr(user, "teacher_profile", None)
        if profile is None:
            return {"needs_profile": True}
        return {
            "needs_profile": False,
            "teacher_id": profile.id,
            "completeness": profile.completeness,
            "missing_documents": profile.missing_documents,
        }
    if role == "school":
        profile = getattr(user, "school_profile", None)
        if profile is None:
            return {"needs_profile": True}
        return {
            "needs_profile": False,
            "school_id": profile.id,
            "status": profile.status,
            "outstanding": profile.outstanding,
        }
    if role == "student":
        profile = getattr(user, "student_profile", None)
        if profile is None:
            return {"needs_profile": True}
        # `needs_consent` is surfaced here and not left to be discovered,
        # because it is the one thing that makes an otherwise complete profile
        # invisible to every teacher. The client opens the consent screen on it.
        return {
            "needs_profile": False,
            "student_id": profile.id,
            "needs_consent": profile.needs_consent,
            "is_minor": profile.is_minor,
        }
    return {"needs_profile": False}


def _sign_in(user, role: str, device: str = "") -> dict:
    """Mint a token and build the one sign-in payload every path returns."""
    if role == "staff" and not user.is_staff_member:
        raise ValidationError({"role": "This number does not have panel access."})
    _, raw = AuthToken.issue(user, role=role, device=device or "")
    User.objects.filter(pk=user.pk).update(last_login_at=timezone.now())
    return {
        "key": raw,
        "role": role,
        "user": UserReadSerializer(user).data,
        **_profile_summary(user, role),
    }


class SignUpView(APIView):
    """POST v1/auth/signup — a number and a password, in exchange for a token.

    Creates the `User` and nothing else. It does NOT create the role profile:
    what they teach, where, and with what qualification is the signup wizard's
    job, and `needs_profile` in the response is what opens it.

    Unlike sign-in, this one does say when a number is already taken. On a
    signup form that is unavoidable — whatever the wording, trying to register
    reveals it — so a vague answer would cost a real person their account and
    tell an attacker the same thing anyway.
    """

    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = SignUpSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        phone, role = data["phone"], data["role"]

        # Panel accounts are made by `manage.py make_staff`, never by signing up.
        if role == "staff":
            return fail("Panel accounts are created by the office.", status_code=403)

        with transaction.atomic():
            if User.objects.filter(phone=phone).exists():
                raise ValidationError(
                    {"phone": "That number already has an account. Sign in instead."}
                )
            user = User.objects.create(phone=phone, name=data.get("name", ""))
            user.set_password(data["password"])
            user.save(update_fields=["password", "name"])
            payload = _sign_in(user, role, data.get("device", ""))
        payload["is_new"] = True
        return ok("Account created.", payload)


class PasswordLoginView(APIView):
    """POST v1/auth/password — the way in.

    One message for "no such number", "no password set" and "wrong password", so
    the endpoint cannot be used to ask which numbers hold accounts. Signing up
    is the one place that distinction is unavoidable; here it is not.
    """

    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = PasswordLoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        generic = "That number and password do not match."
        user = User.objects.filter(phone=data["phone"]).first()
        if user is None or not user.check_password(data["password"]):
            return fail(generic, code="invalid_credentials", status_code=401)
        if not user.is_active:
            return fail("This account has been deactivated. Call the office.", status_code=403)
        return ok("Signed in.", _sign_in(user, data["role"], data.get("device", "")))


class PasswordSetView(APIView):
    """POST v1/auth/password/set — set or change your own password."""

    authentication_classes = [CustomAuthentication]
    permission_classes = [IsSignedIn]

    def post(self, request):
        serializer = PasswordSetSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = request.user
        if user.has_password:
            current = serializer.validated_data.get("current_password") or ""
            if not user.check_password(current):
                return fail("Your current password is not right.", status_code=400)
        user.set_password(serializer.validated_data["new_password"])
        user.save(update_fields=["password"])
        return ok("Password saved.")


class GoogleLoginView(APIView):
    """POST v1/auth/google — sign in with Google.

    Linked by `sub`, and only to an account whose phone has already been proved
    by a code. A Google sign-in for a brand-new person therefore answers
    `needs_phone`, not a token: without a number this platform cannot do the one
    thing it exists for, which is ring a teacher about a vacancy.
    """

    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = GoogleLoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        claims = google_auth.verify(data["id_token"])
        sub, email = claims["sub"], (claims.get("email") or "").lower()

        user = User.objects.filter(google_sub=sub).first()
        if user is None:
            return ok(
                "Almost there — we need your mobile number.",
                {
                    "needs_phone": True,
                    "google_sub": sub,
                    "email": email,
                    "name": claims.get("name", ""),
                },
            )
        return ok("Signed in.", _sign_in(user, data["role"], data.get("device", "")))


class GoogleLinkView(APIView):
    """POST v1/auth/google/link — attach a Google account to this one.

    Signed in, so the phone is already proved; this is the second half of the
    `needs_phone` answer above and the "link Google" button in settings.
    """

    authentication_classes = [CustomAuthentication]
    permission_classes = [IsSignedIn]

    def post(self, request):
        claims = google_auth.verify(request.data.get("id_token") or "")
        sub = claims["sub"]
        taken = User.objects.filter(google_sub=sub).exclude(pk=request.user.pk).exists()
        if taken:
            return fail("That Google account is already linked to another login.", status_code=409)
        request.user.google_sub = sub
        if not request.user.email and claims.get("email"):
            request.user.email = claims["email"].lower()
        request.user.save(update_fields=["google_sub", "email"])
        return ok("Google account linked.")


class MeView(RetrieveUpdateAPIView):
    """GET / PATCH v1/auth/me — your own details.

    The read serializer is explicit about its fields, which is why `password` and
    `google_sub` have never appeared in a response here.
    """

    authentication_classes = [CustomAuthentication]
    permission_classes = [IsSignedIn]
    serializer_class = UserSerializer

    def get_object(self):
        return self.request.user

    def retrieve(self, request, *args, **kwargs):
        role = getattr(request.auth, "role", "") or ""
        return ok(
            "",
            {**UserReadSerializer(request.user).data, "role": role, **_profile_summary(request.user, role)},
        )

    def update(self, request, *args, **kwargs):
        serializer = self.get_serializer(request.user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return ok("Saved.", UserReadSerializer(request.user).data)


class LogoutView(APIView):
    """POST v1/auth/logout — kill this token, and only this one.

    `all=true` kills every session on the account, which is what someone whose
    phone was stolen needs.
    """

    authentication_classes = [CustomAuthentication]
    permission_classes = [IsSignedIn]

    def post(self, request):
        if str(request.data.get("all", "")).lower() in ("1", "true", "yes"):
            AuthToken.objects.filter(user=request.user).delete()
            return ok("Signed out everywhere.")
        token = getattr(request, "auth", None)
        if token is not None:
            AuthToken.objects.filter(pk=token.pk).delete()
        return ok("Signed out.")


# ── email one-time codes ────────────────────────────────────────────────────
#
# The brief asked for a one-time code at signup. It asked for it over SMS, which
# needs a DLT-registered sender the client does not have and cannot get in a
# week. Email needs no registration, costs effectively nothing, and leaves the
# user a record they can search for. The mechanism below carries both of the
# flows that were previously a telephone call to the office.


class EmailCodeRequestView(APIView):
    """POST v1/auth/email/code — send a code to an address you are claiming.

    Signed in, because this proves *your* address. The anonymous twin is
    `PasswordForgotView` below, which is a different problem with different
    rules about what may be revealed.

    The address is checked against other accounts first. Two users sharing a
    verified address would make `PasswordForgotView` ambiguous — it resolves an
    account *from* the address — so the collision is refused here, where there
    is a person present to be told why.
    """

    authentication_classes = [CustomAuthentication]
    permission_classes = [IsSignedIn]

    def post(self, request):
        serializer = EmailCodeRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"]

        taken = User.objects.filter(email__iexact=email).exclude(pk=request.user.pk).exists()
        if taken:
            return fail("That address is already on another account.", status_code=400)

        if EmailCode.too_soon(email, EmailCode.PURPOSE_VERIFY_EMAIL):
            return fail("A code was just sent. Wait a minute before asking again.", status_code=429)

        # Row first, mail second. See EmailCode.issue — a send that takes a
        # second while the row is still unwritten tells a fast typist their
        # correct code is wrong.
        _, raw = EmailCode.issue(email, EmailCode.PURPOSE_VERIFY_EMAIL, user=request.user)
        delivered = mailer.send_code(email, raw, EmailCode.PURPOSE_VERIFY_EMAIL, request.user.name)
        if not delivered:
            return fail("We could not send that email. Check the address and try again.", status_code=502)

        return ok(f"Code sent to {email}.", {"expires_in_minutes": EmailCode.TTL_MINUTES})


class EmailVerifyView(APIView):
    """POST v1/auth/email/verify — hand back the code, keep the address.

    On success the address is written to the account *and* stamped verified, in
    that order and in one transaction. Verifying an address that is then not
    saved would mark a user as having proved something they do not own.
    """

    authentication_classes = [CustomAuthentication]
    permission_classes = [IsSignedIn]

    def post(self, request):
        serializer = EmailVerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"]

        row, reason = EmailCode.verify(email, EmailCode.PURPOSE_VERIFY_EMAIL, serializer.validated_data["code"])
        if row is None:
            return fail(reason, status_code=400)
        # The code is bound to the account that asked for it. Without this, a
        # code mailed to one user could be replayed by another who saw it.
        if row.user_id and row.user_id != request.user.pk:
            return fail("That code was not issued for this account.", status_code=400)

        with transaction.atomic():
            if User.objects.filter(email__iexact=email).exclude(pk=request.user.pk).exists():
                return fail("That address is already on another account.", status_code=400)
            user = request.user
            user.email = email
            user.email_verified_at = timezone.now()
            user.save(update_fields=["email", "email_verified_at"])

        return ok("Email confirmed.", {"email": email})


class PasswordForgotView(APIView):
    """POST v1/auth/password/forgot — start a reset, anonymously.

    **This endpoint always succeeds.** Whether the address is on an account,
    whether that account has verified it, whether the mail went out — the reply
    is the same sentence every time. Any difference between those cases turns
    this into a way to ask which addresses hold accounts, one request at a time,
    and these accounts belong to people looking for work.

    The rate limit is the one thing that does answer differently, and it answers
    the same way for an address with no account as for one with.
    """

    authentication_classes = []
    permission_classes = [AllowAny]

    # Said regardless of outcome. Phrased so it is not a lie in the case where
    # no account exists: nothing is claimed to have been sent.
    GENERIC = "If that address is on an account, a code is on its way to it."

    def post(self, request):
        serializer = EmailCodeRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"]

        if EmailCode.too_soon(email, EmailCode.PURPOSE_RESET_PASSWORD):
            return ok(self.GENERIC)

        # Only a *verified* address. An unverified one may be a typo for
        # somebody else's mailbox, and mailing a password reset there hands
        # that stranger the account.
        user = User.objects.filter(
            email__iexact=email, email_verified_at__isnull=False, is_active=True,
        ).first()
        if user is not None:
            _, raw = EmailCode.issue(email, EmailCode.PURPOSE_RESET_PASSWORD, user=user)
            mailer.send_code(email, raw, EmailCode.PURPOSE_RESET_PASSWORD, user.name)

        return ok(self.GENERIC)


class PasswordResetView(APIView):
    """POST v1/auth/password/reset — the code, and a new password.

    Every existing session is destroyed on success. Someone resetting a password
    may be doing it because another person has their account, and leaving that
    person's token working makes the reset theatre.
    """

    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        email = data["email"]

        row, reason = EmailCode.verify(email, EmailCode.PURPOSE_RESET_PASSWORD, data["code"])
        if row is None:
            return fail(reason, status_code=400)
        if row.user is None:
            return fail("Ask for a new code.", status_code=400)

        user = row.user
        with transaction.atomic():
            user.set_password(data["new_password"])
            user.save(update_fields=["password"])
            user.tokens.all().delete()

        return ok("Password changed. Sign in with the new one.")
