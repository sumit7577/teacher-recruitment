"""The teacher's inbox, device registration, and the panel's push sender."""

from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.generics import ListAPIView, ListCreateAPIView
from rest_framework.views import APIView

from app.responses import fail, ok
from notifications.models import Device, Notification, PushCampaign
from notifications.serializer import (
    DeviceSerializer,
    NotificationSerializer,
    PushCampaignReadSerializer,
    PushCampaignSerializer,
)
from notifications.service import campaign_audience, send_campaign
from user.auth import CustomAuthentication, IsSignedIn, IsStaff


class NotificationList(ListAPIView):
    """GET v1/teacher/notifications/ — "Notifications: what brings them back"."""

    authentication_classes = [CustomAuthentication]
    permission_classes = [IsSignedIn]
    serializer_class = NotificationSerializer

    def get_queryset(self):
        return Notification.objects.filter(user=self.request.user)

    def list(self, request, *args, **kwargs):
        queryset = self.get_queryset()
        unread = queryset.filter(read_at__isnull=True).count()
        page = self.paginate_queryset(queryset)
        if page is not None:
            response = self.get_paginated_response(self.get_serializer(page, many=True).data)
            response.data["unread"] = unread
            return response
        return ok("", {"results": self.get_serializer(queryset, many=True).data, "unread": unread})


class NotificationSeen(APIView):
    """POST v1/teacher/notifications/seen — mark all read, or one.

    A watermark would be cheaper, but per-row `read_at` is what lets the app show
    one notification as unread after a teacher taps past it — and the cost here is
    one UPDATE on a table nobody reads in bulk.
    """

    authentication_classes = [CustomAuthentication]
    permission_classes = [IsSignedIn]

    def post(self, request):
        target = str(request.data.get("id") or "").strip()
        queryset = Notification.objects.filter(user=request.user, read_at__isnull=True)
        if target:
            queryset = queryset.filter(pk=target)
        count = queryset.update(read_at=timezone.now())
        return ok(f"{count} marked as read.", {"read": count})


class DeviceRegister(APIView):
    """POST v1/teacher/notifications/device — register this install for push.

    Reassigns the token rather than creating a second row. The same handset
    handed to someone else who signs in would otherwise leave two rows with one
    token, and the previous owner would keep receiving the new owner's
    notifications — which is a privacy incident, not a bug.
    """

    authentication_classes = [CustomAuthentication]
    permission_classes = [IsSignedIn]

    def post(self, request):
        serializer = DeviceSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        Device.objects.update_or_create(
            token=data["token"],
            defaults={
                "user": request.user,
                "platform": data.get("platform", "android"),
                "app_version": data.get("app_version", ""),
                "is_active": True,
                "last_seen_at": timezone.now(),
            },
        )
        return ok("Registered.")

    def delete(self, request):
        token = str(request.data.get("token") or request.query_params.get("token") or "")
        if not token:
            return fail("Pass the device token.")
        Device.objects.filter(token=token, user=request.user).update(is_active=False)
        return ok("Unregistered.")


class PanelCampaignList(ListCreateAPIView):
    """GET / POST v1/panel/notifications/ — the push sender, and its history.

    Creating a campaign does NOT send it. `?send=1` on the POST does, and so does
    the explicit send endpoint. Two steps because this button reaches every
    teacher the firm has, and an accidental double-click should cost a draft
    rather than four hundred notifications.
    """

    authentication_classes = [CustomAuthentication]
    permission_classes = [IsStaff]
    serializer_class = PushCampaignSerializer

    def get_queryset(self):
        return PushCampaign.objects.select_related("sent_by", "vacancy")

    def list(self, request, *args, **kwargs):
        queryset = self.get_queryset()
        page = self.paginate_queryset(queryset)
        if page is not None:
            return self.get_paginated_response(PushCampaignReadSerializer(page, many=True).data)
        return ok("", PushCampaignReadSerializer(queryset, many=True).data)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        campaign = serializer.save(sent_by=request.user)
        if str(request.query_params.get("send", "")).lower() in ("1", "true", "yes"):
            result = send_campaign(campaign, by=request.user)
            campaign.refresh_from_db()
            return ok(
                f"Sent to {result['users']} people.",
                PushCampaignReadSerializer(campaign).data,
            )
        return ok("Draft saved.", PushCampaignReadSerializer(campaign).data)


class PanelCampaignSend(APIView):
    """POST v1/panel/notifications/<id>/send

    `?preview=1` answers with the headcount and sends nothing — the number the
    person about to press Send actually wants to see first.
    """

    authentication_classes = [CustomAuthentication]
    permission_classes = [IsStaff]

    def post(self, request, pk):
        campaign = get_object_or_404(PushCampaign, pk=pk)
        if str(request.query_params.get("preview", "")).lower() in ("1", "true", "yes"):
            return ok("", {"recipients": len(campaign_audience(campaign))})
        if campaign.status == "sent":
            return fail("This one has already been sent.", code="already_sent", status_code=409)
        result = send_campaign(campaign, by=request.user)
        campaign.refresh_from_db()
        return ok(
            f"Sent to {result['users']} people.",
            PushCampaignReadSerializer(campaign).data,
        )
