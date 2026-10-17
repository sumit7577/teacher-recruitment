"""Auth and identity serializers.

Two-serializer pattern throughout (CLAUDE.md §4.3): `<Model>Serializer` writes,
`<Model>ReadSerializer` reads. The read side lists its fields explicitly, which
is the only reason `password` and `google_sub` have never leaked into a response
— `fields = "__all__"` on a read serializer would have sent both.
"""

from rest_framework import serializers

from user.models import User
from user.service import is_valid_phone, normalise_phone

ROLE_CHOICES = ("teacher", "school", "staff")


class PhoneField(serializers.CharField):
    """A phone, normalised and validated in one place.

    Every entry point takes a phone, and every one of them has to agree on what
    "the same number" means, or a teacher who signed up as "+919845637278" cannot
    sign in as "9845637278".
    """

    def to_internal_value(self, data):
        phone = normalise_phone(super().to_internal_value(data))
        if not is_valid_phone(phone):
            raise serializers.ValidationError("Enter a 10-digit Indian mobile number.")
        return phone


class UserReadSerializer(serializers.ModelSerializer):
    roles = serializers.ListField(read_only=True)
    has_password = serializers.BooleanField(read_only=True)
    image = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = (
            "id", "name", "email", "phone", "city", "state", "image",
            # Null until a code sent to `email` came back correct. The client
            # shows "not confirmed" on it, and it is what decides whether a
            # self-service password reset is possible at all.
            "email_verified_at",
            "roles", "has_password", "is_staff_member", "date_joined",
        )

    def get_image(self, obj):
        return obj.image.url if obj.image else ""


class UserSerializer(serializers.ModelSerializer):
    """The write side — a signed-in user editing their own details.

    `phone` is absent on purpose. Changing the number you sign in with has to be
    proved by a code sent to the new number, which is a separate flow
    (`POST v1/auth/phone/`), not a field on a profile PATCH.
    """

    class Meta:
        model = User
        fields = ("name", "email", "city", "state", "image")


def _validated_password(value):
    """Django's own password rules, surfaced as a DRF field error.

    Run here rather than in the view so signup and password-change get the same
    answer — "this password is too common" has to mean the same thing in both.
    """
    from django.contrib.auth.password_validation import validate_password
    from django.core.exceptions import ValidationError as DjangoValidationError

    try:
        validate_password(value)
    except DjangoValidationError as exc:
        raise serializers.ValidationError(list(exc.messages))
    return value


class SignUpSerializer(serializers.Serializer):
    """Creating an account: a number, a password, and which door you came in by.

    `name` is optional because the signup wizard asks for it on the next step
    along with everything else about the profile; taking it here when it is
    offered just saves asking twice.
    """

    phone = PhoneField()
    password = serializers.CharField(min_length=8, max_length=128, trim_whitespace=False)
    name = serializers.CharField(max_length=120, required=False, allow_blank=True)
    role = serializers.ChoiceField(choices=ROLE_CHOICES, default="teacher")
    device = serializers.CharField(max_length=120, required=False, allow_blank=True)

    def validate_password(self, value):
        return _validated_password(value)


class PasswordLoginSerializer(serializers.Serializer):
    phone = PhoneField()
    password = serializers.CharField(max_length=128, trim_whitespace=False)
    role = serializers.ChoiceField(choices=ROLE_CHOICES, default="teacher")
    device = serializers.CharField(max_length=120, required=False, allow_blank=True)


class PasswordSetSerializer(serializers.Serializer):
    """Changing your own password.

    `current_password` is required only when the account already has one. It
    stays optional because the office can hand out a temporary password for an
    account that has none — see `panel`'s reset — and that account has to be
    able to set its own on first use.
    """

    current_password = serializers.CharField(required=False, allow_blank=True, trim_whitespace=False)
    new_password = serializers.CharField(min_length=8, trim_whitespace=False)

    def validate_new_password(self, value):
        return _validated_password(value)


class GoogleLoginSerializer(serializers.Serializer):
    id_token = serializers.CharField()
    role = serializers.ChoiceField(choices=ROLE_CHOICES, default="teacher")
    device = serializers.CharField(max_length=120, required=False, allow_blank=True)


# ── email one-time codes ────────────────────────────────────────────────────


class EmailField(serializers.EmailField):
    """An address, lowercased, so one mailbox is one value.

    `Teacher@Gmail.com` and `teacher@gmail.com` are the same inbox but two
    different strings, and `EmailCode` looks codes up by exact match. Without
    this, a code requested from the signup form and typed back from a mail
    client that rewrote the capitalisation would not be found.
    """

    def to_internal_value(self, data):
        return super().to_internal_value(data).strip().lower()


class EmailCodeRequestSerializer(serializers.Serializer):
    """Ask for a code to be sent to an address."""

    email = EmailField()


class EmailVerifySerializer(serializers.Serializer):
    email = EmailField()
    code = serializers.CharField(min_length=4, max_length=10, trim_whitespace=True)


class PasswordResetConfirmSerializer(serializers.Serializer):
    """The code, and the password it buys."""

    email = EmailField()
    code = serializers.CharField(min_length=4, max_length=10, trim_whitespace=True)
    # trim_whitespace=False everywhere a password is read: a trailing space is
    # part of the password the user chose, and silently eating it here but not
    # at sign-in locks them out of an account they just created.
    new_password = serializers.CharField(min_length=8, trim_whitespace=False)

    def validate_new_password(self, value):
        return _validated_password(value)
