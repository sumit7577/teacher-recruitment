"""Student and parent serializers.

Three read shapes, and the difference between them is a child's safety rather
than payload size.

    `StudentSelfSerializer`    the family's own view — full address, DOB, phone
    `StudentCardSerializer`    what a TEACHER sees — no address, no DOB, no phone
    `StudentPanelSerializer`   staff — everything, including the consent record

`StudentCardSerializer` is the one to read twice. A tuition requirement is
posted by a child, and the thing a teacher is shown must not be enough to turn
up at the house. They get an area and a class, never a street and a date of
birth. Contact details arrive only after an interest is accepted, and then
through chat rather than as a field.
"""

from rest_framework import serializers

from app import taxonomy
from student.models import StudentProfile, TuitionRequirement


class StudentProfileSerializer(serializers.ModelSerializer):
    """The write side. `guardian_consent_at` is absent on purpose — consent is
    given through its own endpoint, which records who gave it, and must never
    be settable as a field on a profile PATCH."""

    class Meta:
        model = StudentProfile
        fields = (
            "account_holder", "student_name", "date_of_birth", "klass",
            "school_name", "board", "medium",
            "guardian_name", "guardian_relation", "guardian_phone", "guardian_email",
            "address", "village", "city", "pincode",
            "state_ref", "district_ref", "block_ref", "latitude", "longitude",
            "is_hidden",
        )


class StudentSelfSerializer(serializers.ModelSerializer):
    klass_label = serializers.CharField(source="get_klass_display", read_only=True)
    age = serializers.IntegerField(read_only=True)
    is_minor = serializers.BooleanField(read_only=True)
    needs_consent = serializers.BooleanField(read_only=True)
    is_contactable = serializers.BooleanField(read_only=True)
    phone = serializers.CharField(source="user.phone", read_only=True)

    class Meta:
        model = StudentProfile
        fields = (
            "id", "account_holder", "student_name", "date_of_birth", "age",
            "klass", "klass_label", "school_name", "board", "medium", "phone",
            "guardian_name", "guardian_relation", "guardian_phone", "guardian_email",
            "guardian_consent_at", "guardian_consent_by",
            "is_minor", "needs_consent", "is_contactable",
            "address", "village", "city", "pincode",
            "state_ref", "district_ref", "block_ref", "latitude", "longitude",
            "is_hidden", "created_at",
        )


class StudentCardSerializer(serializers.ModelSerializer):
    """What a teacher sees.

    Explicitly WITHOUT: `address`, `village`, `pincode`, `date_of_birth`,
    `latitude`, `longitude`, the guardian's phone and email, and the student's
    own phone. A teacher browsing requirements is a stranger to this family
    until an interest has been accepted.

    `area` is a district-level label and nothing finer. "Patna" is enough to
    decide whether a tuition job is worth taking; a street is not needed to
    make that decision and is plenty to find a child with.
    """

    klass_label = serializers.CharField(source="get_klass_display", read_only=True)
    area = serializers.SerializerMethodField()
    first_name = serializers.SerializerMethodField()

    class Meta:
        model = StudentProfile
        fields = ("id", "first_name", "klass", "klass_label", "board", "medium", "area")

    def get_area(self, obj):
        if obj.district_ref_id:
            return str(obj.district_ref)
        return obj.city or ""

    def get_first_name(self, obj):
        """A first name only. A full name plus a class plus an area is enough
        to identify one child in a small town."""
        return (obj.student_name or "").strip().split(" ")[0]


class StudentPanelSerializer(StudentSelfSerializer):
    user_name = serializers.CharField(source="user.name", read_only=True)

    class Meta(StudentSelfSerializer.Meta):
        fields = StudentSelfSerializer.Meta.fields + ("user_name", "internal_note", "updated_at")


class ConsentSerializer(serializers.Serializer):
    """A guardian typing their own name to agree.

    A typed name rather than a checkbox because the record has to say *who*
    agreed, and a boolean cannot. `agreed` must be literally true — a missing
    field is not consent.
    """

    guardian_name = serializers.CharField(max_length=140)
    agreed = serializers.BooleanField()

    def validate_agreed(self, value):
        if not value:
            raise serializers.ValidationError("Consent is needed before the profile can be seen.")
        return value


# ── tuition requirements ────────────────────────────────────────────────────


class TuitionRequirementSerializer(serializers.ModelSerializer):
    """The write side. `student` is absent — it comes from the token, never the
    body (CLAUDE.md §4.4)."""

    class Meta:
        model = TuitionRequirement
        fields = (
            "klass", "subjects", "medium", "board", "exams", "mode",
            "days_per_week", "preferred_time", "budget_min", "budget_max",
            "teacher_gender", "city", "district_ref", "block_ref",
            "latitude", "longitude", "description", "status",
        )

    def validate(self, attrs):
        low, high = attrs.get("budget_min"), attrs.get("budget_max")
        if low and high and low > high:
            raise serializers.ValidationError(
                {"budget_max": "The upper figure cannot be below the lower one."}
            )
        return attrs

    def validate_subjects(self, value):
        if not value:
            raise serializers.ValidationError("Name at least one subject.")
        return value


class TuitionRequirementReadSerializer(serializers.ModelSerializer):
    """The family's own view of what they posted."""

    klass_label = serializers.CharField(source="get_klass_display", read_only=True)
    mode_label = serializers.CharField(source="get_mode_display", read_only=True)
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    budget_label = serializers.CharField(read_only=True)
    interests_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = TuitionRequirement
        fields = (
            "id", "klass", "klass_label", "subjects", "medium", "board", "exams",
            "mode", "mode_label", "days_per_week", "preferred_time",
            "budget_min", "budget_max", "budget_label", "teacher_gender",
            "city", "district_ref", "block_ref", "description",
            "status", "status_label", "view_count", "interests_count", "created_at",
        )


class TuitionRequirementCardSerializer(serializers.ModelSerializer):
    """What a teacher browsing requirements sees.

    No coordinates and no block — `city` and the district are as fine as this
    gets before an interest is accepted. The nested student is the card shape,
    not the self shape, for the same reason.
    """

    klass_label = serializers.CharField(source="get_klass_display", read_only=True)
    mode_label = serializers.CharField(source="get_mode_display", read_only=True)
    budget_label = serializers.CharField(read_only=True)
    student = StudentCardSerializer(read_only=True)
    distance_km = serializers.SerializerMethodField()

    class Meta:
        model = TuitionRequirement
        fields = (
            "id", "student", "klass", "klass_label", "subjects", "medium", "board",
            "exams", "mode", "mode_label", "days_per_week", "preferred_time",
            "budget_label", "teacher_gender", "city", "description",
            "distance_km", "created_at",
        )

    def get_distance_km(self, obj):
        """Set by the view when the teacher asked for "near me". Rounded to a
        whole kilometre — a decimal here is a coordinate by another route."""
        value = getattr(obj, "distance_km", None)
        return round(value) if value is not None else None
