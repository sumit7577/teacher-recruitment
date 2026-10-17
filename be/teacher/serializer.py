"""Teacher serializers.

Three read shapes, and the differences are about privacy rather than payload
size. A teacher sees their own phone and every document's status. A school sees
the professional record and the verification ticks, and **never the phone or
email** — the firm's whole business is being the channel, and a serializer that
leaks contact details is the firm being cut out of its own placement. Staff see
everything including `internal_note`.
"""

from rest_framework import serializers

from app import taxonomy
from teacher.models import TeacherDocument, TeacherExperience, TeacherProfile


class TeacherDocumentReadSerializer(serializers.ModelSerializer):
    kind_label = serializers.CharField(source="get_kind_display", read_only=True)
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    verified_by_name = serializers.CharField(source="verified_by.name", read_only=True, default="")
    file = serializers.SerializerMethodField()

    class Meta:
        model = TeacherDocument
        fields = (
            "id", "kind", "kind_label", "title", "file", "status", "status_label",
            "note", "verified_by_name", "verified_at", "uploaded_at",
        )

    def get_file(self, obj):
        return obj.file.url if obj.file else ""


class TeacherDocumentSerializer(serializers.ModelSerializer):
    class Meta:
        model = TeacherDocument
        fields = ("kind", "title", "file")

    def validate_kind(self, value):
        known = {code for code, _ in taxonomy.DOCUMENT_CHOICES}
        if value not in known:
            raise serializers.ValidationError("Not a document type we accept.")
        return value


class TeacherExperienceSerializer(serializers.ModelSerializer):
    class Meta:
        model = TeacherExperience
        exclude = ("teacher",)
        read_only_fields = ("id",)


class TeacherExperienceReadSerializer(serializers.ModelSerializer):
    post_label = serializers.CharField(source="get_post_display", read_only=True)
    board_label = serializers.CharField(source="get_board_display", read_only=True)

    class Meta:
        model = TeacherExperience
        fields = (
            "id", "institution", "post", "post_label", "subject", "city",
            "board", "board_label", "started_on", "ended_on", "is_current", "salary_lpa",
        )


class TeacherProfileSerializer(serializers.ModelSerializer):
    """The write side — what a teacher may set about themselves.

    `verification`, `police_verified` and `internal_note` are excluded, not
    read-only-listed: a field a teacher can send and we silently drop is a field
    somebody will one day make writable by accident. "Verified" is what a school
    is paying for and it is never a claim a signup form can make.
    """

    class Meta:
        model = TeacherProfile
        exclude = ("user", "verification", "police_verified", "internal_note")
        read_only_fields = ("id", "experience_band", "created_at", "updated_at")

    def validate_subjects(self, value):
        if not isinstance(value, list):
            raise serializers.ValidationError("Expected a list of subjects.")
        if len(value) > 6:
            raise serializers.ValidationError(
                "Six subjects at most — a profile that claims everything matches nothing."
            )
        return value

    def validate_qualifications(self, value):
        if not isinstance(value, list):
            raise serializers.ValidationError("Expected a list.")
        known = {code for code, _ in taxonomy.QUALIFICATION_CHOICES}
        unknown = [v for v in value if v not in known]
        if unknown:
            raise serializers.ValidationError(f"Not a qualification we know: {', '.join(unknown)}.")
        return value


class TeacherSelfSerializer(serializers.ModelSerializer):
    """What a teacher sees of their own profile — including the dashboard's
    "ninety percent done" and exactly which document is missing."""

    name = serializers.CharField(source="user.name", read_only=True)
    phone = serializers.CharField(source="user.phone", read_only=True)
    email = serializers.CharField(source="user.email", read_only=True, default="")
    image = serializers.SerializerMethodField()
    post_label = serializers.CharField(source="get_post_display", read_only=True)
    designation_label = serializers.CharField(source="get_designation_display", read_only=True)
    medium_label = serializers.CharField(source="get_medium_display", read_only=True)
    experience_label = serializers.CharField(source="get_experience_band_display", read_only=True)
    completeness = serializers.IntegerField(read_only=True)
    missing_documents = serializers.ListField(read_only=True)
    documents = TeacherDocumentReadSerializer(many=True, read_only=True)
    experience = TeacherExperienceReadSerializer(many=True, read_only=True)
    cv = serializers.SerializerMethodField()

    class Meta:
        model = TeacherProfile
        fields = (
            "id", "name", "phone", "email", "image",
            "post", "post_label", "subjects", "qualifications", "highest_qualification",
            "experience_band", "experience_label", "experience_years",
            "city", "state", "preferred_cities", "willing_to_relocate",
            "expected_salary_lpa", "available_from", "notice_period_days",
            "headline", "about", "languages", "cv",
            "verification", "police_verified", "is_open_to_work",
            # Designation is the title; `post` above is the band the board
            # filters on. Both, because both are asked.
            "designation", "designation_label", "teaching_preferences",
            "medium", "medium_label", "exams", "classes_taught",
            "address", "pincode", "state_ref", "district_ref", "block_ref",
            "latitude", "longitude", "open_to_all_india",
            "open_to_residential", "accommodation_preference", "food_preference",
            "is_hidden",
            "completeness", "missing_documents", "documents", "experience",
            "created_at",
        )

    def get_image(self, obj):
        return obj.user.image.url if obj.user.image else ""

    def get_cv(self, obj):
        return obj.cv.url if obj.cv else ""


class TeacherCardSerializer(serializers.ModelSerializer):
    """What a SCHOOL sees on an applicant card.

    No phone, no email, no CV URL. A school that wants to speak to a teacher does
    it through the firm — that is the product. The CV is served by a gated
    download endpoint that records who fetched it, not by a URL in a list.
    """

    name = serializers.CharField(source="user.name", read_only=True)
    image = serializers.SerializerMethodField()
    post_label = serializers.CharField(source="get_post_display", read_only=True)
    experience_label = serializers.CharField(source="get_experience_band_display", read_only=True)
    designation_label = serializers.CharField(source="get_designation_display", read_only=True)
    medium_label = serializers.CharField(source="get_medium_display", read_only=True)
    documents_verified = serializers.SerializerMethodField()

    class Meta:
        model = TeacherProfile
        fields = (
            "id", "name", "image", "post", "post_label", "subjects",
            "qualifications", "highest_qualification", "experience_band",
            "experience_label", "experience_years", "city", "headline", "about",
            "verification", "police_verified", "documents_verified",

            # The professional answers a principal needs to shortlist. Added
            # with the fuller profile; without them a teacher could fill in a
            # designation and a medium and no school would ever see either.
            "designation", "designation_label", "medium", "medium_label",
            "exams", "classes_taught", "teaching_preferences",
            "open_to_all_india", "open_to_residential",
            "accommodation_preference", "food_preference",
            # District, so a school can filter by area. Deliberately NOT
            # `address`, `pincode`, `latitude` or `longitude`: a principal
            # decides on an applicant from their qualifications and their
            # district, and none of that decision needs a home address.
            "district_ref", "state_ref",
        )

    def get_image(self, obj):
        return obj.user.image.url if obj.user.image else ""

    def get_documents_verified(self, obj):
        """The ticks on the card — kind → verified. Built from a prefetch when
        the caller set one up, so a list of twenty applicants stays two
        queries."""
        return {
            document.kind: document.status == taxonomy.VERIFICATION_VERIFIED
            for document in obj.documents.all()
        }


class TeacherPanelSerializer(TeacherSelfSerializer):
    """Staff. Everything, plus the office's own notes and how many times this
    teacher has been put forward."""

    applications_count = serializers.IntegerField(read_only=True)
    placed_count = serializers.IntegerField(read_only=True)

    class Meta(TeacherSelfSerializer.Meta):
        fields = TeacherSelfSerializer.Meta.fields + (
            "internal_note", "applications_count", "placed_count",
        )
