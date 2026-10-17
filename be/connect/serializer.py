"""Interest, chat, block and report serializers.

The read shapes carry a `counterparty` rather than a raw user id, because
every one of these is about two people and the client always needs to render
the *other* one. Working that out in the browser means shipping both users and
letting the client pick, which is one more place to leak the wrong one.
"""

from rest_framework import serializers

from connect.models import Block, Interest, Message, Report, Thread


def counterparty(user, me_id) -> dict:
    """The public face of the other person in a conversation.

    Name and role only. **No phone and no email**, even after an interest is
    accepted — the firm's business is being the channel, and a serializer that
    hands over a mobile number is the firm being cut out of its own
    introduction. People who want to exchange numbers can do it in the chat,
    where it is at least a decision rather than a field.
    """
    if user is None:
        return {"id": "", "name": "Someone", "roles": []}
    return {
        "id": str(user.id),
        "name": user.name or "Unnamed",
        "roles": user.roles,
        "image": user.image.url if user.image else "",
        "is_me": user.pk == me_id,
    }


class InterestCreateSerializer(serializers.Serializer):
    """Tapping the heart. The recipient is named by id; whether that is
    allowed is decided by `Interest.may_open`, never here."""

    to_user = serializers.CharField(max_length=40)
    context = serializers.ChoiceField(choices=[c for c, _ in Interest.CONTEXT_CHOICES],
                                      default="profile")
    context_id = serializers.CharField(max_length=40, required=False, allow_blank=True)
    message = serializers.CharField(max_length=300, required=False, allow_blank=True)


class InterestReadSerializer(serializers.ModelSerializer):
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    context_label = serializers.CharField(source="get_context_display", read_only=True)
    person = serializers.SerializerMethodField()
    direction = serializers.SerializerMethodField()
    thread_id = serializers.SerializerMethodField()

    class Meta:
        model = Interest
        fields = (
            "id", "person", "direction", "context", "context_label", "context_id",
            "message", "status", "status_label", "seen_at", "responded_at",
            "thread_id", "created_at",
        )

    def _me(self):
        request = self.context.get("request")
        return getattr(getattr(request, "user", None), "pk", None)

    def get_person(self, obj):
        me = self._me()
        other = obj.recipient if obj.sender_id == me else obj.sender
        return counterparty(other, me)

    def get_direction(self, obj):
        return "sent" if obj.sender_id == self._me() else "received"

    def get_thread_id(self, obj):
        """Present only once accepted — the client uses it to open the chat,
        and its absence is how "no conversation yet" is expressed."""
        thread = getattr(obj, "thread", None)
        return str(thread.id) if thread else None


class ThreadReadSerializer(serializers.ModelSerializer):
    person = serializers.SerializerMethodField()
    last_message = serializers.SerializerMethodField()
    unread = serializers.SerializerMethodField()

    class Meta:
        model = Thread
        fields = ("id", "person", "last_message", "unread", "last_message_at", "created_at")

    def _me(self):
        request = self.context.get("request")
        return getattr(getattr(request, "user", None), "pk", None)

    def get_person(self, obj):
        me = self._me()
        interest = obj.interest
        other = interest.recipient if interest.sender_id == me else interest.sender
        return counterparty(other, me)

    def get_last_message(self, obj):
        # Annotated by the view where it matters; falls back to a query so a
        # single-thread read is still correct.
        row = getattr(obj, "_last_message", None) or obj.messages.order_by("-created_at").first()
        return {"body": row.body[:140], "at": row.created_at, "mine": row.sender_id == self._me()} \
            if row else None

    def get_unread(self, obj):
        return getattr(obj, "unread_count", 0)


class MessageReadSerializer(serializers.ModelSerializer):
    mine = serializers.SerializerMethodField()

    class Meta:
        model = Message
        fields = ("id", "body", "mine", "read_at", "created_at")

    def get_mine(self, obj):
        request = self.context.get("request")
        return obj.sender_id == getattr(getattr(request, "user", None), "pk", None)


class MessageCreateSerializer(serializers.Serializer):
    body = serializers.CharField(max_length=4000, trim_whitespace=True)

    def validate_body(self, value):
        if not value.strip():
            raise serializers.ValidationError("Write something first.")
        return value


class BlockCreateSerializer(serializers.Serializer):
    target = serializers.CharField(max_length=40)
    reason = serializers.CharField(max_length=300, required=False, allow_blank=True)


class ReportCreateSerializer(serializers.Serializer):
    target = serializers.CharField(max_length=40)
    reason = serializers.ChoiceField(choices=[c for c, _ in Report.REASON_CHOICES])
    detail = serializers.CharField(max_length=2000, required=False, allow_blank=True)


class ReportPanelSerializer(serializers.ModelSerializer):
    reason_label = serializers.CharField(source="get_reason_display", read_only=True)
    by_name = serializers.CharField(source="by.name", read_only=True)
    by_phone = serializers.CharField(source="by.phone", read_only=True)
    target_name = serializers.CharField(source="target.name", read_only=True)
    target_phone = serializers.CharField(source="target.phone", read_only=True)
    handled_by_name = serializers.CharField(source="handled_by.name", read_only=True, default="")

    class Meta:
        model = Report
        fields = (
            "id", "by_name", "by_phone", "target_name", "target_phone",
            "reason", "reason_label", "detail", "status",
            "handled_by_name", "handled_at", "internal_note", "created_at",
        )
