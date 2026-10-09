"""Pipeline serializers.

The asymmetry here is deliberate and is the product. A teacher sees their own
stage, the demo-class date and why they were not selected. A school sees the
candidate, their verified documents and the demo-class feedback — but not the
teacher's phone number. Staff see all of it plus the event log.
"""

from rest_framework import serializers

from application.models import Application, ApplicationEvent, DemoClass, Offer
from teacher.serializer import TeacherCardSerializer
from vacancy.serializer import VacancyCardSerializer


class DemoClassReadSerializer(serializers.ModelSerializer):
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    mode_label = serializers.CharField(source="get_mode_display", read_only=True)
    teacher_name = serializers.CharField(source="application.teacher.user.name", read_only=True, default="")
    vacancy_title = serializers.CharField(source="application.vacancy.title", read_only=True, default="")

    class Meta:
        model = DemoClass
        fields = (
            "id", "application", "scheduled_at", "duration_minutes", "topic", "grade",
            "mode", "mode_label", "venue", "meeting_link", "panel",
            "status", "status_label", "feedback", "rating", "recommended",
            "teacher_name", "vacancy_title", "created_at",
        )


class DemoClassSerializer(serializers.ModelSerializer):
    """Write side. `topic` and `grade` are required on purpose.

    The proposal sells the demo class as a stage "with topic and grade fixed in
    advance", and a demo class scheduled without them is the exact complaint
    teachers have about every other agency. Making them required here is the only
    place that promise can actually be kept.
    """

    class Meta:
        model = DemoClass
        exclude = ("application", "scheduled_by")
        read_only_fields = ("id", "created_at", "updated_at")

    def validate(self, attrs):
        for field in ("topic", "grade"):
            value = attrs.get(field, getattr(self.instance, field, ""))
            if not value:
                raise serializers.ValidationError({
                    field: "Fix this in advance — the teacher is told it when the date is set."
                })
        mode = attrs.get("mode", getattr(self.instance, "mode", "in_person"))
        if mode == "online" and not attrs.get("meeting_link", getattr(self.instance, "meeting_link", "")):
            raise serializers.ValidationError({"meeting_link": "An online demo needs a link."})
        return attrs


class OfferReadSerializer(serializers.ModelSerializer):
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    letter = serializers.SerializerMethodField()

    class Meta:
        model = Offer
        fields = (
            "id", "salary_lpa", "joining_date", "terms", "letter",
            "status", "status_label", "sent_at", "responded_at",
        )

    def get_letter(self, obj):
        return obj.letter.url if obj.letter else ""


class OfferSerializer(serializers.ModelSerializer):
    class Meta:
        model = Offer
        exclude = ("application", "sent_by", "responded_at")
        read_only_fields = ("id", "sent_at")


class ApplicationEventSerializer(serializers.ModelSerializer):
    by_name = serializers.CharField(source="by.name", read_only=True, default="")
    from_label = serializers.CharField(source="get_from_stage_display", read_only=True, default="")
    to_label = serializers.CharField(source="get_to_stage_display", read_only=True)

    class Meta:
        model = ApplicationEvent
        fields = ("id", "from_stage", "from_label", "to_stage", "to_label", "by_name", "note", "at")


class ApplicationSerializer(serializers.ModelSerializer):
    """Applying. The only field a teacher supplies is the cover note — the
    vacancy comes from the URL and the teacher from the token (§4.4)."""

    class Meta:
        model = Application
        fields = ("cover_note",)


class TeacherApplicationSerializer(serializers.ModelSerializer):
    """What a teacher sees: "Every application and the stage it has reached —
    set by the school, not guessed at"."""

    vacancy = VacancyCardSerializer(read_only=True)
    stage_label = serializers.CharField(source="get_stage_display", read_only=True)
    progress = serializers.IntegerField(read_only=True)
    demo_class = serializers.SerializerMethodField()
    offer = OfferReadSerializer(read_only=True)

    class Meta:
        model = Application
        fields = (
            "id", "vacancy", "stage", "stage_label", "progress",
            "cover_note", "outcome_note", "demo_class", "offer",
            "applied_at", "stage_changed_at",
        )

    def get_demo_class(self, obj):
        """The current one. `demo_classes` is ordered newest-first, so the first
        row is the live date — a reschedule does not hide behind the old one."""
        row = obj.demo_classes.all().first()
        return DemoClassReadSerializer(row).data if row else None


class ApplicationCardSerializer(serializers.ModelSerializer):
    """What a school sees in a list of applicants."""

    teacher = TeacherCardSerializer(read_only=True)
    stage_label = serializers.CharField(source="get_stage_display", read_only=True)
    progress = serializers.IntegerField(read_only=True)
    documents_pending = serializers.ListField(read_only=True)
    vacancy_title = serializers.CharField(source="vacancy.title", read_only=True)
    vacancy_id = serializers.CharField(source="vacancy.id", read_only=True)

    class Meta:
        model = Application
        fields = (
            "id", "teacher", "vacancy_id", "vacancy_title",
            "stage", "stage_label", "progress", "documents_pending",
            "cover_note", "applied_at", "stage_changed_at",
        )


class ApplicationDetailSerializer(ApplicationCardSerializer):
    """The applicant panel — the card plus the demo class, the offer, and the
    history of how it got here."""

    demo_classes = DemoClassReadSerializer(many=True, read_only=True)
    offer = OfferReadSerializer(read_only=True)
    events = ApplicationEventSerializer(many=True, read_only=True)

    class Meta(ApplicationCardSerializer.Meta):
        fields = ApplicationCardSerializer.Meta.fields + ("demo_classes", "offer", "events")


class ApplicationPanelSerializer(ApplicationDetailSerializer):
    consultant_name = serializers.CharField(source="consultant.name", read_only=True, default="")
    school_name = serializers.CharField(source="vacancy.institution_name", read_only=True)
    teacher_phone = serializers.CharField(source="teacher.user.phone", read_only=True)

    class Meta(ApplicationDetailSerializer.Meta):
        fields = ApplicationDetailSerializer.Meta.fields + (
            "consultant", "consultant_name", "internal_note", "outcome_note",
            "school_name", "teacher_phone",
        )
