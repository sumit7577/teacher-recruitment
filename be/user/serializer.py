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


class OtpRequestSerializer(serializers.Serializer):
    phone = PhoneField()
    role = serializers.ChoiceField(choices=ROLE_CHOICES, default="teacher")


class OtpVerifySerializer(serializers.Serializer):
    phone = PhoneField()
    otp = serializers.CharField(max_length=6)
    role = serializers.ChoiceField(choices=ROLE_CHOICES, default="teacher")
    device = serializers.CharField(max_length=120, required=False, allow_blank=True)


class PasswordLoginSerializer(serializers.Serializer):
    phone = PhoneField()
    password = serializers.CharField(max_length=128, trim_whitespace=False)
    role = serializers.ChoiceField(choices=ROLE_CHOICES, default="teacher")
    device = serializers.CharField(max_length=120, required=False, allow_blank=True)


class PasswordSetSerializer(serializers.Serializer):
    """Setting a password for the first time, or changing one.

    `current_password` is required only when the account already has one.
    Requiring it unconditionally would lock out every teacher who has only ever
    used one-time codes, which is most of them.
    """

    current_password = serializers.CharField(required=False, allow_blank=True, trim_whitespace=False)
    new_password = serializers.CharField(min_length=8, trim_whitespace=False)

    def validate_new_password(self, value):
        from django.contrib.auth.password_validation import validate_password
        from django.core.exceptions import ValidationError as DjangoValidationError

        try:
            validate_password(value)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(list(exc.messages))
        return value


class GoogleLoginSerializer(serializers.Serializer):
    id_token = serializers.CharField()
    role = serializers.ChoiceField(choices=ROLE_CHOICES, default="teacher")
    device = serializers.CharField(max_length=120, required=False, allow_blank=True)
