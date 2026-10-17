"""Institution serializers.

The public card carries the name, the type, the board and the logo — what a
teacher needs to recognise the school on a vacancy. It does NOT carry the
contact person or the office number: a teacher who could ring the school direct
has no reason to go through the firm, and the firm's fee is the introduction.
"""

from rest_framework import serializers

from school.models import School


class SchoolPublicSerializer(serializers.ModelSerializer):
    type_label = serializers.CharField(source="get_institution_type_display", read_only=True)
    board_label = serializers.CharField(source="get_board_display", read_only=True)
    logo = serializers.SerializerMethodField()

    class Meta:
        model = School
        fields = (
            "id", "name", "initials", "logo", "institution_type", "type_label",
            "board", "board_label", "city", "locality", "about",
            "established_year", "student_count",
        )

    def get_logo(self, obj):
        return obj.logo.url if obj.logo else ""


class SchoolSerializer(serializers.ModelSerializer):
    """The write side. `status`, `verified_by` and `verified_at` are excluded —
    being verified is the thing the firm does, not something a registration form
    can assert."""

    class Meta:
        model = School
        exclude = (
            "user", "status", "verified_by", "verified_at", "rejection_reason",
            "consultant", "internal_note",
        )
        read_only_fields = ("id", "created_at", "updated_at")


class SchoolSelfSerializer(SchoolPublicSerializer):
    """What a school sees of itself — including the banner telling it what is
    still outstanding."""

    contact_name = serializers.CharField(source="user.name", read_only=True)
    login_phone = serializers.CharField(source="user.phone", read_only=True)
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    outstanding = serializers.ListField(read_only=True)
    is_verified = serializers.BooleanField(read_only=True)
    affiliation_certificate = serializers.SerializerMethodField()

    class Meta(SchoolPublicSerializer.Meta):
        fields = SchoolPublicSerializer.Meta.fields + (
            "contact_person", "designation", "contact_name", "login_phone",
            "office_phone", "office_email", "website", "address", "pincode", "state",
            "staff_count", "status", "status_label", "is_verified", "outstanding",
            "affiliation_certificate", "rejection_reason", "created_at",
        
            # Added with the fuller address, the two named contacts, the
            # coaching fields and the residential block.
            "address_at", "address_po", "address_ps", "landmark", "country",
            "whatsapp", "gps_image_latitude", "gps_image_longitude", "intro_video_url",
            "principal_name", "principal_phone", "principal_email",
            "hr_name", "hr_phone", "hr_email",
            "manager_name", "manager_phone", "manager_email",
            "classes_from", "classes_to", "boards", "medium", "exams",
            "offers_residential", "accommodation", "food", "facilities",
            "residential_note",
            "state_ref", "district_ref", "block_ref", "latitude", "longitude",
            "is_hidden",
        )

    def get_affiliation_certificate(self, obj):
        return obj.affiliation_certificate.url if obj.affiliation_certificate else ""


class SchoolPanelSerializer(SchoolSelfSerializer):
    consultant_name = serializers.CharField(source="consultant.name", read_only=True, default="")
    vacancies_count = serializers.IntegerField(read_only=True)
    live_vacancies = serializers.IntegerField(read_only=True)

    class Meta(SchoolSelfSerializer.Meta):
        fields = SchoolSelfSerializer.Meta.fields + (
            "consultant", "consultant_name", "internal_note",
            "vacancies_count", "live_vacancies",
        )
