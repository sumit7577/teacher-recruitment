"""Sign-in and identity, for all three audiences.

"One door, two sides of the same hire." Every endpoint here takes a `role`, and
the role decides what the token opens and which questions get asked next. Two
ways in — a password, or Google — and both land in the same `_sign_in`, so the
response the client parses never depends on how they arrived.

There is deliberately no one-time code. It needed a DLT-registered SMS sender
the client does not have, and an account nobody can sign into because an SMS
gateway is unconfigured is worse than one with a password to remember. A
forgotten password is reset by the office from the panel, which is the same desk
that already verifies every teacher's certificates.
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
from user.models import AuthToken, User
from user.serializer import (
    GoogleLoginSerializer,
    PasswordLoginSerializer,
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
