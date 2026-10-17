"""Sending interest, answering it, and the conversation that follows.

Mounted once, at `v1/connect/`, for **every signed-in audience**. That is a
departure from the audience-per-route rule in CLAUDE.md §3 and it is
deliberate: this feature is symmetric. A teacher hearts a vacancy, a school
hearts a teacher, a parent hearts a teacher, a teacher hearts a tuition
requirement — the same four endpoints with the two sides swapped. Splitting it
into `v1/teacher/interests/`, `v1/school/interests/` and
`v1/student/interests/` would be three copies of the accept logic and three
places for the consent check to be forgotten in two of them.

What replaces the audience filter is the ownership check: every queryset here
starts from `request.user`, and `Interest.may_open` is the single gate on
whether two people may be connected at all.
"""

from django.db.models import Count, Q
from django.utils import timezone
from rest_framework.generics import ListAPIView
from rest_framework.views import APIView

from app.responses import fail, ok
from connect.models import Block, Interest, Message, Report, Thread
from connect.serializer import (
    BlockCreateSerializer,
    InterestCreateSerializer,
    InterestReadSerializer,
    MessageCreateSerializer,
    MessageReadSerializer,
    ReportCreateSerializer,
    ReportPanelSerializer,
    ThreadReadSerializer,
)
from notifications.service import deliver
from user.auth import CustomAuthentication, IsSignedIn, IsStaff
from user.models import User


class InterestListView(ListAPIView):
    """GET v1/connect/interests/ — `?box=received` (default) or `sent`."""

    authentication_classes = [CustomAuthentication]
    permission_classes = [IsSignedIn]
    serializer_class = InterestReadSerializer

    def get_queryset(self):
        me = self.request.user
        box = self.request.query_params.get("box", "received")
        rows = Interest.objects.select_related("sender", "recipient", "thread")
        # Ownership, not audience, is what scopes this list.
        rows = rows.filter(sender=me) if box == "sent" else rows.filter(recipient=me)
        status = self.request.query_params.get("status")
        if status in dict(Interest.STATUS_CHOICES):
            rows = rows.filter(status=status)
        return rows


class InterestCreateView(APIView):
    """POST v1/connect/interests/ — tap the heart."""

    authentication_classes = [CustomAuthentication]
    permission_classes = [IsSignedIn]

    def post(self, request):
        serializer = InterestCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        recipient = User.objects.filter(id=data["to_user"]).first()
        if recipient is None:
            return fail("No such person.", status_code=404)

        # The one gate. Blocks, consent, hidden profiles, self-interest.
        allowed, why = Interest.may_open(request.user, recipient)
        if not allowed:
            return fail(why, status_code=403)

        existing = Interest.objects.filter(
            sender=request.user, recipient=recipient,
            context=data["context"], context_id=data.get("context_id", ""),
        ).first()
        if existing is not None:
            # Idempotent rather than a 400: the heart is a toggle on a card
            # that may be double-tapped, and an error there reads as a bug.
            return ok("Already sent.", InterestReadSerializer(
                existing, context={"request": request}).data)

        interest = Interest.objects.create(
            sender=request.user, recipient=recipient,
            context=data["context"], context_id=data.get("context_id", ""),
            message=data.get("message", ""),
        )
        deliver(
            [recipient], kind="interest",
            title=f"{request.user.name or 'Someone'} is interested",
            body=interest.message or "Open the app to accept or decline.",
            data={"interest": str(interest.id)},
        )
        return ok("Interest sent.", InterestReadSerializer(
            interest, context={"request": request}).data)


class InterestRespondView(APIView):
    """POST v1/connect/interests/<id>/<accept|reject|withdraw>/

    Only the **recipient** may accept or reject; only the **sender** may
    withdraw. Both checks are here rather than in a permission class because
    the answer depends on which of the two columns the caller sits in, which a
    permission class cannot see without loading the row anyway.
    """

    authentication_classes = [CustomAuthentication]
    permission_classes = [IsSignedIn]

    def post(self, request, pk, action):
        interest = Interest.objects.filter(pk=pk).select_related(
            "sender", "recipient").first()
        if interest is None:
            return fail("No such interest.", status_code=404)

        me = request.user.pk
        if action == "withdraw":
            if interest.sender_id != me:
                return fail("That is not yours to withdraw.", status_code=403)
            interest.status = Interest.STATUS_WITHDRAWN
            interest.responded_at = timezone.now()
            interest.save(update_fields=["status", "responded_at"])
            return ok("Withdrawn.")

        if interest.recipient_id != me:
            return fail("That is not yours to answer.", status_code=403)
        if interest.status != Interest.STATUS_PENDING:
            return fail("That has already been answered.", status_code=400)

        if action == "accept":
            # Re-check: a block may have gone up, or consent may have lapsed,
            # between the heart being tapped and this moment.
            allowed, why = Interest.may_open(interest.recipient, interest.sender)
            if not allowed:
                return fail(why, status_code=403)
            thread = interest.accept()
            deliver(
                [interest.sender], kind="interest",
                title=f"{request.user.name or 'They'} accepted",
                body="You can message each other now.",
                data={"thread": str(thread.id)},
            )
            return ok("Accepted. You can message each other now.",
                      InterestReadSerializer(interest, context={"request": request}).data)

        interest.reject()
        return ok("Declined.")


class SeenInterestsView(APIView):
    """POST v1/connect/interests/seen/ — clear the badge."""

    authentication_classes = [CustomAuthentication]
    permission_classes = [IsSignedIn]

    def post(self, request):
        updated = Interest.objects.filter(
            recipient=request.user, seen_at__isnull=True,
        ).update(seen_at=timezone.now())
        return ok("Seen.", {"updated": updated})


# ── chat ────────────────────────────────────────────────────────────────────


class ThreadListView(ListAPIView):
    """GET v1/connect/threads/ — the inbox."""

    authentication_classes = [CustomAuthentication]
    permission_classes = [IsSignedIn]
    serializer_class = ThreadReadSerializer

    def get_queryset(self):
        me = self.request.user
        return Thread.objects.filter(
            Q(interest__sender=me) | Q(interest__recipient=me)
        ).select_related("interest__sender", "interest__recipient").annotate(
            # Unread means "sent by the other person and not yet read".
            unread_count=Count("messages", filter=Q(messages__read_at__isnull=True)
                               & ~Q(messages__sender=me)),
        # Ordering restated after annotate(): the GROUP BY a Count introduces
        # drops Meta.ordering, and an unordered queryset under pagination can
        # repeat one row on page two while losing another. DRF's
        # UnorderedObjectListWarning is not cosmetic.
        ).order_by("-last_message_at", "-created_at")


class MessageListView(APIView):
    """GET/POST v1/connect/threads/<id>/messages/

    `APIView` rather than a generic because reading a thread has a side effect
    — marking the other side's messages read — and a `ListCreateAPIView` has
    nowhere honest to put that.
    """

    authentication_classes = [CustomAuthentication]
    permission_classes = [IsSignedIn]

    def _thread(self, request, pk):
        thread = Thread.objects.filter(pk=pk).select_related(
            "interest__sender", "interest__recipient").first()
        if thread is None or not thread.includes(request.user.pk):
            # 404 rather than 403 for a thread that exists but is not yours:
            # a 403 confirms the id is real, which is itself an answer.
            return None
        return thread

    def get(self, request, pk):
        thread = self._thread(request, pk)
        if thread is None:
            return fail("No such conversation.", status_code=404)
        rows = thread.messages.select_related("sender")
        Message.objects.filter(thread=thread, read_at__isnull=True).exclude(
            sender=request.user).update(read_at=timezone.now())
        return ok("", {
            "person": ThreadReadSerializer(thread, context={"request": request}).data["person"],
            "messages": MessageReadSerializer(
                rows, many=True, context={"request": request}).data,
        })

    def post(self, request, pk):
        thread = self._thread(request, pk)
        if thread is None:
            return fail("No such conversation.", status_code=404)

        other_id = thread.other_party(request.user.pk)
        # A block put up after the thread opened has to close it. Checking only
        # at interest time would leave every existing conversation open to
        # somebody the other person has since blocked.
        if Block.between(request.user.pk, other_id):
            return fail("You cannot message this person.", status_code=403)

        serializer = MessageCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        message = Message.objects.create(
            thread=thread, sender=request.user, body=serializer.validated_data["body"],
        )
        other = User.objects.filter(pk=other_id).first()
        if other is not None:
            deliver(
                [other], kind="message",
                title=request.user.name or "New message",
                body=message.body[:120],
                data={"thread": str(thread.id)},
            )
        return ok("Sent.", MessageReadSerializer(
            message, context={"request": request}).data)


# ── block and report ────────────────────────────────────────────────────────


class BlockView(APIView):
    """POST v1/connect/block/ — and DELETE to undo."""

    authentication_classes = [CustomAuthentication]
    permission_classes = [IsSignedIn]

    def post(self, request):
        serializer = BlockCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        target = User.objects.filter(id=serializer.validated_data["target"]).first()
        if target is None:
            return fail("No such person.", status_code=404)
        if target.pk == request.user.pk:
            return fail("You cannot block yourself.", status_code=400)
        Block.objects.get_or_create(
            by=request.user, target=target,
            defaults={"reason": serializer.validated_data.get("reason", "")},
        )
        return ok("Blocked. They can no longer contact you.")

    def delete(self, request):
        target_id = request.data.get("target") or request.query_params.get("target")
        Block.objects.filter(by=request.user, target_id=target_id).delete()
        return ok("Unblocked.")


class ReportView(APIView):
    """POST v1/connect/report/ — goes to the office, hides nobody by itself."""

    authentication_classes = [CustomAuthentication]
    permission_classes = [IsSignedIn]

    def post(self, request):
        serializer = ReportCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        target = User.objects.filter(id=data["target"]).first()
        if target is None:
            return fail("No such person.", status_code=404)
        Report.objects.create(
            by=request.user, target=target,
            reason=data["reason"], detail=data.get("detail", ""),
        )
        return ok("Reported. Our office will look at this.")


class PanelReportList(ListAPIView):
    """GET v1/panel/reports/ — the moderation queue."""

    authentication_classes = [CustomAuthentication]
    permission_classes = [IsStaff]
    serializer_class = ReportPanelSerializer

    def get_queryset(self):
        rows = Report.objects.select_related("by", "target", "handled_by")
        status = self.request.query_params.get("status")
        if status in dict(Report.STATUS_CHOICES):
            rows = rows.filter(status=status)
        return rows


class PanelReportAction(APIView):
    """POST v1/panel/reports/<id>/ — record what was decided."""

    authentication_classes = [CustomAuthentication]
    permission_classes = [IsStaff]

    def post(self, request, pk):
        report = Report.objects.filter(pk=pk).first()
        if report is None:
            return fail("No such report.", status_code=404)
        status = request.data.get("status")
        if status not in dict(Report.STATUS_CHOICES):
            return fail("Unknown status.", status_code=400)
        report.status = status
        report.internal_note = (request.data.get("internal_note") or "")[:2000]
        report.handled_by = request.user
        report.handled_at = timezone.now()
        report.save(update_fields=["status", "internal_note", "handled_by", "handled_at"])
        return ok("Saved.", ReportPanelSerializer(report).data)
