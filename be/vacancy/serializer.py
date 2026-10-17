"""Vacancy serializers — four of them, one per audience.

Not one serializer with conditional fields. The differences are not cosmetic:
the public card must never carry `internal_note` or the consultant's name, and a
school must never see another school's post at all. Four explicit field lists is
four things to read; one serializer with four `if`s is one thing nobody can
audit.
"""

from rest_framework import serializers

from app import taxonomy
from vacancy.models import Vacancy


class VacancyCardSerializer(serializers.ModelSerializer):
    """The board. Everything the card prints and nothing else — this is the
    serializer behind a list of fifty, so every extra field is fifty queries
    waiting to happen."""

    institution = serializers.CharField(source="institution_name", read_only=True)
    initials = serializers.CharField(source="institution_initials", read_only=True)
    post_label = serializers.CharField(source="get_post_display", read_only=True)
    institution_label = serializers.CharField(source="get_institution_type_display", read_only=True)
    board_label = serializers.CharField(source="get_board_display", read_only=True)
    experience_label = serializers.CharField(source="get_experience_band_display", read_only=True)
    salary = serializers.CharField(source="salary_label", read_only=True)
    is_new = serializers.BooleanField(read_only=True)
    designation_label = serializers.CharField(source="get_designation_display", read_only=True)
    medium_label = serializers.CharField(source="get_medium_display", read_only=True)
    logo = serializers.SerializerMethodField()

    class Meta:
        model = Vacancy
        fields = (
            "id", "title", "post", "post_label", "subject",
            "institution", "initials", "logo", "institution_type", "institution_label",
            "board", "board_label", "city", "locality", "grades", "openings",
            "qualification", "experience_band", "experience_label",
            "salary", "salary_min_lpa", "salary_max_lpa", "salary_note",
            "is_new", "is_featured", "is_urgent", "published_at",
            # Added with the fuller vacancy. `medium` and `is_residential`
            # are on the CARD rather than the detail panel because they are
            # disqualifying: a Hindi-medium teacher scrolling an English-medium
            # board, or someone who cannot relocate reading a residential post,
            # should know before they open it.
            "designation", "designation_label", "medium", "medium_label",
            "is_residential",
        )

    def get_logo(self, obj):
        school = obj.school if obj.school_id else None
        return school.logo.url if (school and school.logo) else ""


class VacancyReadSerializer(VacancyCardSerializer):
    """The detail panel. The card plus the three lists a teacher actually reads
    before applying — duties, requirements, and how the demo class will run."""

    applications_count = serializers.IntegerField(read_only=True)
    accommodation_label = serializers.CharField(source="get_accommodation_display", read_only=True)
    food_label = serializers.CharField(source="get_food_display", read_only=True)

    class Meta(VacancyCardSerializer.Meta):
        fields = VacancyCardSerializer.Meta.fields + (
            "description", "duties", "requirements", "demo_class",
            "qualification_codes", "state", "experience_min", "experience_max",
            "status", "closes_on", "created_at", "applications_count",
            # The residential terms in full, and what is actually taught.
            "accommodation", "accommodation_label", "food", "food_label",
            "facilities", "residential_note", "exams", "classes_taught",
            "district_ref", "block_ref",
        )


class VacancySerializer(serializers.ModelSerializer):
    """The write side, shared by the school's form and the panel's.

    `status` and `published_at` are read-only here on purpose: going live is the
    `publish` action, which checks that the institution has been verified. A
    PATCH that could set `status = "live"` would walk straight past that check,
    and it is the one thing the firm is selling to schools.
    """

    class Meta:
        model = Vacancy
        exclude = ("posted_by", "consultant", "internal_note", "view_count", "filled_at")
        read_only_fields = (
            "id", "status", "published_at", "source", "school",
            "school_initials", "created_at", "updated_at",
        )

    def validate(self, attrs):
        low = attrs.get("salary_min_lpa", getattr(self.instance, "salary_min_lpa", None))
        high = attrs.get("salary_max_lpa", getattr(self.instance, "salary_max_lpa", None))
        if low and high and low > high:
            raise serializers.ValidationError(
                {"salary_max_lpa": "The top of the range cannot be below the bottom of it."}
            )
        for field in ("duties", "requirements", "qualification_codes"):
            value = attrs.get(field)
            if value is not None and not isinstance(value, list):
                raise serializers.ValidationError({field: "Expected a list."})
        codes = attrs.get("qualification_codes")
        if codes:
            known = {code for code, _ in taxonomy.QUALIFICATION_CHOICES}
            unknown = [c for c in codes if c not in known]
            if unknown:
                raise serializers.ValidationError(
                    {"qualification_codes": f"Not a qualification we know: {', '.join(unknown)}."}
                )
        return attrs


class VacancyPanelSerializer(VacancyReadSerializer):
    """What the office sees — the post plus how it is doing and who owns it."""

    consultant_name = serializers.CharField(source="consultant.name", read_only=True, default="")
    school_status = serializers.CharField(source="school.status", read_only=True, default="")
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    new_applications = serializers.IntegerField(read_only=True)

    class Meta(VacancyReadSerializer.Meta):
        fields = VacancyReadSerializer.Meta.fields + (
            "source", "school", "school_name", "school_status", "status_label",
            "consultant", "consultant_name", "internal_note", "view_count",
            "new_applications", "salary_hidden", "filled_at",
        )
