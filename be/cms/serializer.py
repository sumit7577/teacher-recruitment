"""Site-content serializers.

`EnquirySerializer` is the only serializer in the project an anonymous stranger
can post to, so it is the only one that validates defensively: the honeypot, the
length caps and the phone normalisation are all there because this endpoint will
be found by form spam within a week of going live.
"""

from rest_framework import serializers

from cms.models import Enquiry, Faq, Page, ProcessStep, Service, SiteSetting, SuccessStory, TeamMember, Testimonial
from user.serializer import PhoneField


class SiteSettingSerializer(serializers.ModelSerializer):
    """The whole brand, in one response the website fetches once.

    Images are resolved to URLs here rather than returned as paths: the Next app
    renders them straight into `<img src>` and a relative path would resolve
    against the website's own origin, where the file does not exist.
    """

    logo = serializers.SerializerMethodField()
    logo_dark = serializers.SerializerMethodField()
    favicon = serializers.SerializerMethodField()
    og_image = serializers.SerializerMethodField()

    class Meta:
        model = SiteSetting
        fields = (
            "brand_name", "tagline", "logo", "logo_dark", "favicon",
            "accent_colour", "deep_colour",
            "phone", "whatsapp", "email", "address", "map_url", "office_hours",
            "established_year", "about_heading", "about_body", "stats", "social",
            "seo_title", "seo_description", "og_image", "google_verification",
            "updated_at",
        )

    def _url(self, field):
        return field.url if field else ""

    def get_logo(self, obj):
        return self._url(obj.logo)

    def get_logo_dark(self, obj):
        return self._url(obj.logo_dark)

    def get_favicon(self, obj):
        return self._url(obj.favicon)

    def get_og_image(self, obj):
        return self._url(obj.og_image)


class SiteSettingWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = SiteSetting
        exclude = ("id",)


class PageSerializer(serializers.ModelSerializer):
    class Meta:
        model = Page
        fields = (
            "id", "slug", "title", "heading", "subheading", "blocks",
            "seo_title", "seo_description", "is_published", "updated_at",
        )
        read_only_fields = ("id", "updated_at")


class ServiceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Service
        fields = ("id", "title", "description", "icon", "order", "is_published")
        read_only_fields = ("id",)


class ProcessStepSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProcessStep
        fields = ("id", "title", "description", "timing", "audience", "order", "is_published")
        read_only_fields = ("id",)


class TeamMemberSerializer(serializers.ModelSerializer):
    photo_url = serializers.SerializerMethodField()

    class Meta:
        model = TeamMember
        fields = (
            "id", "name", "role", "bio", "photo", "photo_url",
            "phone", "email", "order", "is_published",
        )
        read_only_fields = ("id", "photo_url")
        extra_kwargs = {"photo": {"write_only": True, "required": False}}

    def get_photo_url(self, obj):
        return obj.photo.url if obj.photo else ""


class TestimonialSerializer(serializers.ModelSerializer):
    photo_url = serializers.SerializerMethodField()

    class Meta:
        model = Testimonial
        fields = (
            "id", "quote", "author", "author_role", "institution",
            "photo", "photo_url", "side", "order", "is_published",
        )
        read_only_fields = ("id", "photo_url")
        extra_kwargs = {"photo": {"write_only": True, "required": False}}

    def get_photo_url(self, obj):
        return obj.photo.url if obj.photo else ""


class EnquirySerializer(serializers.ModelSerializer):
    """The contact form — "One form for both sides".

    `website` is a honeypot: a hidden input no human fills in. Checking it costs
    nothing and stops the majority of automated submissions without putting a
    CAPTCHA in front of a teacher on a slow phone.
    """

    phone = PhoneField()
    website = serializers.CharField(required=False, allow_blank=True, write_only=True)

    class Meta:
        model = Enquiry
        fields = (
            "side", "name", "phone", "email", "city",
            "post", "subject", "qualification", "experience_band", "cv",
            "institution_name", "institution_type", "vacancies_count",
            "message", "source_path", "website",
        )

    def validate_website(self, value):
        if value:
            # Answered cheerfully and dropped — telling a bot it was caught only
            # teaches whoever wrote it to stop filling the field in.
            raise serializers.ValidationError("Thanks — we have your message.")
        return value

    def validate(self, attrs):
        if attrs.get("side") == "institution" and not attrs.get("institution_name"):
            raise serializers.ValidationError(
                {"institution_name": "Tell us the name of your school or college."}
            )
        return attrs

    def create(self, validated_data):
        validated_data.pop("website", None)
        return super().create(validated_data)


class EnquiryReadSerializer(serializers.ModelSerializer):
    side_label = serializers.CharField(source="get_side_display", read_only=True)
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    post_label = serializers.CharField(source="get_post_display", read_only=True, default="")
    handled_by_name = serializers.CharField(source="handled_by.name", read_only=True, default="")
    cv = serializers.SerializerMethodField()

    class Meta:
        model = Enquiry
        fields = (
            "id", "side", "side_label", "name", "phone", "email", "city",
            "post", "post_label", "subject", "qualification", "experience_band", "cv",
            "institution_name", "institution_type", "vacancies_count",
            "message", "source_path", "status", "status_label",
            "handled_by_name", "handled_at", "internal_note", "created_at",
        )

    def get_cv(self, obj):
        return obj.cv.url if obj.cv else ""


class FaqSerializer(serializers.ModelSerializer):
    audience_label = serializers.CharField(source="get_audience_display", read_only=True)

    class Meta:
        model = Faq
        fields = ("id", "question", "answer", "audience", "audience_label", "order", "is_published")


class SuccessStorySerializer(serializers.ModelSerializer):
    post_label = serializers.CharField(source="get_teacher_post_display", read_only=True)
    photo = serializers.SerializerMethodField()

    class Meta:
        model = SuccessStory
        fields = (
            "id", "headline", "body", "teacher_name", "teacher_post", "post_label",
            "institution_name", "city", "days_to_place", "photo", "order", "is_published",
        )

    def get_photo(self, obj):
        return obj.photo.url if obj.photo else ""
