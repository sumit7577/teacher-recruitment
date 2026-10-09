"""Sign-in and identity, for all three audiences.

"One door, two sides of the same hire." Every endpoint here takes a `role`, and
the role decides what the token opens and which questions get asked next. Three
ways in — a one-time code, a password, or Google — and all three land in the same
`_sign_in`, so the response the client parses never depends on how they arrived.
"""

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from rest_framework.generics import RetrieveUpdateAPIView
from rest_framework.permissions import AllowAny
from rest_framework.views import APIView

from app.responses import fail, ok
from user import google_auth
from user.auth import CustomAuthentication, IsSignedIn
from user.models import AuthToken, Otp, User
from user.serializer import (
    GoogleLoginSerializer,
    OtpRequestSerializer,
    OtpVerifySerializer,
    PasswordLoginSerializer,
    PasswordSetSerializer,
    UserReadSerializer,
    UserSerializer,
)
from user.service import issue_otp, verify_otp

# Asking for a code again before this has passed re-sends the SAME code rather
# than minting a new one. Minting a new one invalidates the SMS that is probably
# already on its way, which reads to the user as "the code does not work".
OTP_RESEND_SECONDS = 60


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


class OtpRequestView(APIView):
    """POST v1/auth/otp/ — send a one-time code.

    Answers the same way whether or not the number holds an account. A different
    answer for a number we know makes this endpoint a way to ask "is this
    teacher registered with you", which is not ours to tell.
    """

    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = OtpRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        phone = serializer.validated_data["phone"]
        role = serializer.validated_data["role"]

        # Staff accounts are created by the office, never by asking for a code.
        if role == "staff" and not User.objects.filter(phone=phone, is_staff_member=True).exists():
            return fail("This number does not have panel access.", status_code=403)

        existing = Otp.objects.filter(phone=phone, kind=role).first()
        if existing and (timezone.now() - existing.created).total_seconds() < OTP_RESEND_SECONDS:
            return ok("We have already sent a code. It can take a minute to arrive.")

        _, sent = issue_otp(phone, kind=role)
        if not sent:
            return fail(
                "We could not send the code just now. Try again in a moment, "
                "or call the office.",
                code="sms_failed", status_code=502,
            )
        return ok(f"Code sent to {phone}.")


class OtpVerifyView(APIView):
    """POST v1/auth/otp/verify — the code, in exchange for a token.

    Creates the `User` if the number is new, because at this point the number is
    proved and that is all a User row is. It does NOT create the role profile:
    what they teach, where, and with what qualification is the signup wizard's
    job, and `needs_profile` in the response is what opens it.
    """

    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = OtpVerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        phone, role = data["phone"], data["role"]

        verify_otp(phone, data["otp"], kind=role)

        with transaction.atomic():
            user, created = User.objects.get_or_create(phone=phone)
            if role == "staff" and not user.is_staff_member:
                raise ValidationError({"role": "This number does not have panel access."})
            payload = _sign_in(user, role, data.get("device", ""))
        payload["is_new"] = created
        return ok("Signed in.", payload)


class PasswordLoginView(APIView):
    """POST v1/auth/password — for whoever would rather remember one.

    One message for "no such number", "no password set" and "wrong password", so
    the endpoint cannot be used to ask which numbers hold accounts.
    """

    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = PasswordLoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        generic = "That number and password do not match. Try a one-time code instead."
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
