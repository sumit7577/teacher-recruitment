"""Applying, and working the pipeline.

Who may move an application to what is the one piece of policy in this file, and
it lives in `_allowed_moves` rather than being scattered across three views. A
school may shortlist and reject its own applicants; it may NOT mark someone
`joined`, because that is the placement the firm invoices for. A teacher may only
withdraw. Staff may do anything.
"""

from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.generics import ListAPIView
from rest_framework.views import APIView

from app.responses import fail, ok
from application.models import (
    CLOSED_STAGES,
    STAGE_APPLIED,
    STAGE_CHOICES,
    STAGE_DEMO_SCHEDULED,
    STAGE_JOINED,
    STAGE_OFFERED,
    STAGE_ORDER,
    STAGE_REJECTED,
    STAGE_SHORTLISTED,
    STAGE_WITHDRAWN,
    Application,
    DemoClass,
    Offer,
)
from application.serializer import (
    ApplicationCardSerializer,
    ApplicationDetailSerializer,
    ApplicationPanelSerializer,
    ApplicationSerializer,
    DemoClassReadSerializer,
    DemoClassSerializer,
    OfferReadSerializer,
    OfferSerializer,
    TeacherApplicationSerializer,
)
from user.auth import CustomAuthentication, IsSchool, IsStaff, IsTeacher
from vacancy.models import Vacancy

# What each side is allowed to set a stage to.
#
# A school cannot write `joined`: that is the placement the firm is paid for, and
# a school that could mark it itself could also quietly not mark it. A teacher
# gets one move, `withdrawn`, which is the only one that is theirs to make.
SCHOOL_MOVES = (
    "screening", STAGE_SHORTLISTED, STAGE_DEMO_SCHEDULED, "demo_done",
    "interview", STAGE_OFFERED, STAGE_REJECTED,
)
TEACHER_MOVES = (STAGE_WITHDRAWN,)


def _teacher_applications(teacher):
    return (
        Application.objects.filter(teacher=teacher)
        .select_related("vacancy", "vacancy__school", "offer")
        .prefetch_related("demo_classes")
    )


def _school_applications(school):
    return (
        Application.objects.filter(vacancy__school=school)
        .select_related("teacher__user", "vacancy", "offer")
        .prefetch_related("teacher__documents", "demo_classes", "events__by")
    )


def _panel_applications():
    return (
        Application.objects.select_related(
            "teacher__user", "vacancy", "vacancy__school", "consultant", "offer"
        )
        .prefetch_related("teacher__documents", "demo_classes", "events__by")
    )


def _filter_pipeline(queryset, params):
    stage = (params.get("stage") or "").strip()
    if stage == "open":
        queryset = queryset.exclude(stage__in=CLOSED_STAGES)
    elif stage:
        queryset = queryset.filter(stage=stage)
    vacancy = (params.get("vacancy") or "").strip()
    if vacancy:
        queryset = queryset.filter(vacancy_id=vacancy)
    query = (params.get("q") or "").strip()
    if query:
        queryset = queryset.filter(
            Q(teacher__user__name__icontains=query)
            | Q(vacancy__title__icontains=query)
            | Q(teacher__subjects__icontains=query)
        )
    return queryset.order_by("-applied_at")


# ── teacher ─────────────────────────────────────────────────────────────────


class TeacherApplicationList(ListAPIView):
    """GET v1/teacher/applications/ — "My applications: where each one has
    reached"."""

    authentication_classes = [CustomAuthentication]
    permission_classes = [IsTeacher]
    serializer_class = TeacherApplicationSerializer

    def get_queryset(self):
        return _filter_pipeline(_teacher_applications(self.request.teacher), self.request.query_params)


class TeacherApply(APIView):
    """POST v1/teacher/applications/<vacancy>/ — "Apply in one tap; everything
    goes with it".

    Refuses when the profile has no CV. Not pedantry: an application with no CV
    wastes the school's time and the teacher's, and the message names the thing
    to fix rather than just failing.
    """

    authentication_classes = [CustomAuthentication]
    permission_classes = [IsTeacher]

    def post(self, request, pk):
        vacancy = get_object_or_404(Vacancy.objects.public(), pk=pk)
        teacher = request.teacher

        if not teacher.cv and not teacher.documents.filter(kind="cv").exists():
            return fail(
                "Add your CV first — schools will not see an application without one.",
                code="cv_missing",
            )
        existing = Application.objects.filter(vacancy=vacancy, teacher=teacher).first()
        if existing is not None:
            return fail(
                "You have already applied for this one.",
                code="already_applied", status_code=409,
            )

        serializer = ApplicationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        application = serializer.save(vacancy=vacancy, teacher=teacher)
        application.events.create(to_stage=STAGE_APPLIED, by=request.user)

        # Tell whoever owns the post. A school that has to refresh to find out it
        # has applicants is a school that stops logging in.
        from notifications.service import deliver

        recipients = []
        if vacancy.school_id:
            recipients.append(vacancy.school.user)
        if vacancy.consultant_id:
            recipients.append(vacancy.consultant)
        deliver(
            recipients, kind="application",
            title=f"New applicant for {vacancy.title}",
            body=f"{teacher.user.name or 'A teacher'} applied — {teacher.get_post_display()}, {teacher.city}",
            data={"screen": "application", "id": application.id},
        )
        return ok("Applied.", TeacherApplicationSerializer(application).data)


class TeacherApplicationDetail(APIView):
    """GET / POST v1/teacher/applications/detail/<id>/ — one application, and
    withdrawing it."""

    authentication_classes = [CustomAuthentication]
    permission_classes = [IsTeacher]

    def get(self, request, pk):
        application = get_object_or_404(_teacher_applications(request.teacher), pk=pk)
        return ok("", TeacherApplicationSerializer(application).data)

    def post(self, request, pk):
        application = get_object_or_404(_teacher_applications(request.teacher), pk=pk)
        if application.stage in CLOSED_STAGES:
            return fail("This application is already closed.")
        application.move(
            STAGE_WITHDRAWN, by=request.user,
            note=str(request.data.get("reason") or "Withdrawn by the teacher"),
        )
        return ok("Withdrawn.", TeacherApplicationSerializer(application).data)


# ── school ──────────────────────────────────────────────────────────────────


class SchoolApplicantList(ListAPIView):
    """GET v1/school/applicants/ — applicants for this school's own posts.

    The queryset starts at `vacancy__school=request.school`. There is no
    parameter that can widen it, which is the only reason one school cannot read
    another's pipeline.
    """

    authentication_classes = [CustomAuthentication]
    permission_classes = [IsSchool]
    serializer_class = ApplicationCardSerializer

    def get_queryset(self):
        return _filter_pipeline(_school_applications(self.request.school), self.request.query_params)


class SchoolApplicantDetail(APIView):
    authentication_classes = [CustomAuthentication]
    permission_classes = [IsSchool]

    def get(self, request, pk):
        application = get_object_or_404(_school_applications(request.school), pk=pk)
        return ok("", ApplicationDetailSerializer(application).data)


class SchoolApplicantStage(APIView):
    """POST v1/school/applicants/<id>/stage — move an applicant along."""

    authentication_classes = [CustomAuthentication]
    permission_classes = [IsSchool]

    def post(self, request, pk):
        application = get_object_or_404(_school_applications(request.school), pk=pk)
        return _move(application, request, allowed=SCHOOL_MOVES)


class SchoolDemoClass(APIView):
    """POST v1/school/applicants/<id>/demo — book the demo class.

    "The school books the demo class — the teacher sees the date in the app
    immediately." Immediately is the promise, so the push goes out in the same
    request rather than from a nightly job.
    """

    authentication_classes = [CustomAuthentication]
    permission_classes = [IsSchool]

    def post(self, request, pk):
        application = get_object_or_404(_school_applications(request.school), pk=pk)
        return _schedule_demo(application, request)


class SchoolOffer(APIView):
    """POST v1/school/applicants/<id>/offer — "Make an offer at the end of it"."""

    authentication_classes = [CustomAuthentication]
    permission_classes = [IsSchool]

    def post(self, request, pk):
        application = get_object_or_404(_school_applications(request.school), pk=pk)
        return _make_offer(application, request)


# ── the firm's panel ────────────────────────────────────────────────────────


class PanelApplicationList(ListAPIView):
    """GET v1/panel/applications/ — every application, across every post."""

    authentication_classes = [CustomAuthentication]
    permission_classes = [IsStaff]
    serializer_class = ApplicationPanelSerializer

    def get_queryset(self):
        queryset = _filter_pipeline(_panel_applications(), self.request.query_params)
        if (self.request.query_params.get("mine") or "") == "1":
            queryset = queryset.filter(consultant=self.request.user)
        school = (self.request.query_params.get("school") or "").strip()
        if school:
            queryset = queryset.filter(vacancy__school_id=school)
        return queryset


class PanelApplicationDetail(APIView):
    authentication_classes = [CustomAuthentication]
    permission_classes = [IsStaff]

    def get(self, request, pk):
        return ok("", ApplicationPanelSerializer(get_object_or_404(_panel_applications(), pk=pk)).data)

    def patch(self, request, pk):
        application = get_object_or_404(Application, pk=pk)
        changed = []
        if "internal_note" in request.data:
            application.internal_note = str(request.data["internal_note"])
            changed.append("internal_note")
        if "consultant" in request.data:
            from user.models import User

            consultant_id = request.data["consultant"] or ""
            consultant = User.objects.filter(pk=consultant_id, is_staff_member=True).first() if consultant_id else None
            if consultant_id and consultant is None:
                return fail("That is not a member of staff.")
            application.consultant = consultant
            changed.append("consultant")
        if not changed:
            return fail("Nothing to change.")
        application.save(update_fields=changed + ["updated_at"])
        return ok("Saved.", ApplicationPanelSerializer(get_object_or_404(_panel_applications(), pk=pk)).data)


class PanelApplicationStage(APIView):
    """POST v1/panel/applications/<id>/stage — staff may set any stage."""

    authentication_classes = [CustomAuthentication]
    permission_classes = [IsStaff]

    def post(self, request, pk):
        application = get_object_or_404(_panel_applications(), pk=pk)
        return _move(application, request, allowed=tuple(stage for stage, _ in STAGE_CHOICES))


class PanelDemoClass(APIView):
    authentication_classes = [CustomAuthentication]
    permission_classes = [IsStaff]

    def post(self, request, pk):
        application = get_object_or_404(_panel_applications(), pk=pk)
        return _schedule_demo(application, request)


class PanelDemoClassUpdate(APIView):
    """PATCH v1/panel/applications/demo/<id>/ — the outcome of a demo class."""

    authentication_classes = [CustomAuthentication]
    permission_classes = [IsStaff]

    def patch(self, request, pk):
        demo = get_object_or_404(DemoClass, pk=pk)
        serializer = DemoClassSerializer(demo, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return ok("Saved.", DemoClassReadSerializer(demo).data)


class PanelOffer(APIView):
    authentication_classes = [CustomAuthentication]
    permission_classes = [IsStaff]

    def post(self, request, pk):
        application = get_object_or_404(_panel_applications(), pk=pk)
        return _make_offer(application, request)


class PanelDemoCalendar(ListAPIView):
    """GET v1/panel/applications/demo/ — "every demo class booked this week".

    Defaults to the next seven days, which is what the dashboard asks for; `from`
    and `to` widen it for the month view.
    """

    authentication_classes = [CustomAuthentication]
    permission_classes = [IsStaff]
    serializer_class = DemoClassReadSerializer
    pagination_class = None

    def get_queryset(self):
        params = self.request.query_params
        start = params.get("from") or timezone.now().date().isoformat()
        end = params.get("to") or (timezone.now().date() + timezone.timedelta(days=7)).isoformat()
        return (
            DemoClass.objects.filter(scheduled_at__date__gte=start, scheduled_at__date__lte=end)
            .select_related("application__teacher__user", "application__vacancy")
            .order_by("scheduled_at")
        )


# ── the three shared actions ────────────────────────────────────────────────


def _move(application, request, allowed):
    stage = str(request.data.get("stage") or "").strip()
    known = {code for code, _ in STAGE_CHOICES}
    if stage not in known:
        return fail("Not a stage we know.")
    if stage not in allowed:
        return fail(
            "That is not a move you can make. Ask the office." if stage == STAGE_JOINED
            else "That is not a move you can make.",
            code="stage_not_allowed", status_code=403,
        )
    if application.stage == stage:
        return fail(f"This application is already at {application.get_stage_display()}.")

    note = str(request.data.get("note") or "")
    if stage == STAGE_REJECTED and not note:
        return fail("Say why — the teacher is shown this, and a rejection with no reason is a phone call.")

    application.move(stage, by=request.user, note=note)

    from notifications.service import deliver

    friendly = {
        STAGE_SHORTLISTED: ("You have been shortlisted", "The school is interested — we will be in touch about the demo class."),
        STAGE_REJECTED: ("An update on your application", note or "You were not selected this time."),
        STAGE_OFFERED: ("You have an offer", "Open the app to see the details."),
        STAGE_JOINED: ("Congratulations", "Your placement is confirmed."),
    }
    if stage in friendly:
        title, body = friendly[stage]
        deliver(
            [application.teacher.user], kind="application", title=title, body=body,
            data={"screen": "application", "id": application.id},
        )
    return ok("Saved.", ApplicationDetailSerializer(application).data)


def _schedule_demo(application, request):
    serializer = DemoClassSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    scheduled_at = serializer.validated_data.get("scheduled_at")
    if scheduled_at and scheduled_at < timezone.now():
        return fail("That date has already passed.")

    # A reschedule marks the old row rather than editing it: a teacher who was
    # moved once should have that visible, not quietly overwritten.
    application.demo_classes.filter(status=DemoClass.STATUS_SCHEDULED).update(status="rescheduled")
    demo = serializer.save(application=application, scheduled_by=request.user)
    if application.stage not in CLOSED_STAGES:
        application.move(STAGE_DEMO_SCHEDULED, by=request.user)

    from notifications.service import deliver

    deliver(
        [application.teacher.user], kind="demo_class",
        title="Your demo class is booked",
        body=(
            f"{demo.scheduled_at:%d %b, %I:%M %p} — {demo.topic}"
            f"{f' ({demo.grade})' if demo.grade else ''} at {application.vacancy.institution_name}"
        ),
        data={"screen": "application", "id": application.id},
    )
    return ok("Demo class booked. The teacher has been told.", DemoClassReadSerializer(demo).data)


def _make_offer(application, request):
    serializer = OfferSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    existing = getattr(application, "offer", None)
    if existing is not None:
        for field, value in serializer.validated_data.items():
            setattr(existing, field, value)
        existing.status = "sent"
        existing.save()
        offer = existing
    else:
        offer = serializer.save(application=application, sent_by=request.user)
    if application.stage != STAGE_OFFERED:
        application.move(STAGE_OFFERED, by=request.user)

    from notifications.service import deliver

    deliver(
        [application.teacher.user], kind="offer",
        title="You have an offer",
        body=f"{application.vacancy.institution_name} — open the app to see the details.",
        data={"screen": "application", "id": application.id},
    )
    return ok("Offer sent.", OfferReadSerializer(offer).data)
