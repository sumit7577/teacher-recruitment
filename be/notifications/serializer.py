from rest_framework import serializers

from notifications.models import Device, Notification, PushCampaign


class NotificationSerializer(serializers.ModelSerializer):
    kind_label = serializers.CharField(source="get_kind_display", read_only=True)
    is_read = serializers.SerializerMethodField()

    class Meta:
        model = Notification
        fields = ("id", "kind", "kind_label", "title", "body", "data", "is_read", "read_at", "created_at")

    def get_is_read(self, obj):
        return obj.read_at is not None


class DeviceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Device
        fields = ("token", "platform", "app_version")


class PushCampaignSerializer(serializers.ModelSerializer):
    class Meta:
        model = PushCampaign
        fields = ("title", "body", "audience", "filters", "vacancy", "deep_link")


class PushCampaignReadSerializer(serializers.ModelSerializer):
    audience_label = serializers.CharField(source="get_audience_display", read_only=True)
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    sent_by_name = serializers.CharField(source="sent_by.name", read_only=True, default="")
    vacancy_title = serializers.CharField(source="vacancy.title", read_only=True, default="")

    class Meta:
        model = PushCampaign
        fields = (
            "id", "title", "body", "audience", "audience_label", "filters",
            "vacancy", "vacancy_title", "status", "status_label",
            "recipients", "delivered", "failed", "error",
            "sent_by_name", "created_at", "sent_at",
        )
