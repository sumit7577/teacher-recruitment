"""Vacancy endpoints for all four audiences.

Every list view starts from a queryset that is already narrowed to what its
audience may see, and none of them takes that narrowing from a query parameter.
`PublicVacancyList` starts at `Vacancy.objects.public()`; `SchoolVacancyList`
starts at `request.school.vacancies`. There is no code path where a school id
arrives in the request and is trusted (CLAUDE.md §4.1) — that is the shape that
leaks one school's hiring to another.
"""

from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.generics import ListAPIView, ListCreateAPIView, RetrieveAPIView, RetrieveUpdateDestroyAPIView
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from app import taxonomy
from app.responses import fail, ok
from user.auth import CustomAuthentication, IsSchool, IsStaff, IsTeacher
from vacancy.filters import apply_filters
from vacancy.models import OPEN_STATUSES, STATUS_CLOSED, STATUS_FILLED, Vacancy
from vacancy.serializer import (
    VacancyCardSerializer,
    VacancyPanelSerializer,
    VacancyReadSerializer,
    VacancySerializer,
)


def _with_counts(queryset):
    return queryset.select_related("school").annotate(applications_count=Count("applications"))


# ── public website ──────────────────────────────────────────────────────────


class PublicVacancyList(ListAPIView):
    """GET v1/public/vacancies/ — the board.

    `select_related("school")` is not an optimisation here, it is the difference
    between 1 query and 51: the card prints the school's logo, and without it
    every row fetches its own school.
    """

    authentication_classes = []
    permission_classes = [AllowAny]
    serializer_class = VacancyCardSerializer

    def get_queryset(self):
        return apply_filters(Vacancy.objects.public().select_related("school"), self.request.query_params)


class PublicVacancyDetail(RetrieveAPIView):
    """GET v1/public/vacancies/<id>/ — the detail panel.

    Counts a view with an UPDATE rather than by saving the instance: `save()`
    would write every column, so two people opening the same vacancy at once
    would have one of them overwrite the other's edit of something unrelated.
    """

    authentication_classes = []
    permission_classes = [AllowAny]
    serializer_class = VacancyReadSerializer

    def get_queryset(self):
        return _with_counts(Vacancy.objects.public())

    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        Vacancy.objects.filter(pk=instance.pk).update(view_count=instance.view_count + 1)
        return Response(self.get_serializer(instance).data)


class PublicVacancyFacets(APIView):
    """GET v1/public/vacancies/filters/ — what to put in the filter sidebar.

    Derived from the live posts rather than from the taxonomy, so the sidebar
    never offers a city with nothing in it. The count next to each is the point:
    "Lucknow (14)" tells a teacher where the work is.
    """

    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        live = Vacancy.objects.public()

        def tally(field):
            rows = live.values(field).annotate(count=Count("id")).order_by("-count")
            return [{"value": r[field], "count": r["count"]} for r in rows if r[field]]

        labels = {
            "post": dict(taxonomy.POST_CHOICES),
            "institution_type": dict(taxonomy.INSTITUTION_CHOICES),
            "board": dict(taxonomy.BOARD_CHOICES),
            "experience_band": dict(taxonomy.EXPERIENCE_CHOICES),
        }
        payload = {"total": live.count()}
        for field in ("city", "post", "institution_type", "board", "subject", "experience_band"):
            rows = tally(field)
            if field in labels:
                for row in rows:
                    row["label"] = labels[field].get(row["value"], row["value"])
            payload[field] = rows
        payload["taxonomy"] = {
            "posts": [{"value": v, "label": l} for v, l in taxonomy.POST_CHOICES],
            "qualifications": [{"value": v, "label": l} for v, l in taxonomy.QUALIFICATION_CHOICES],
            "institutions": [{"value": v, "label": l} for v, l in taxonomy.INSTITUTION_CHOICES],
            "boards": [{"value": v, "label": l} for v, l in taxonomy.BOARD_CHOICES],
            "experience": [{"value": v, "label": l} for v, l in taxonomy.EXPERIENCE_CHOICES],
        }
        return ok("", payload)


# ── teacher ─────────────────────────────────────────────────────────────────


class TeacherVacancyList(ListAPIView):
    """GET v1/teacher/vacancies/ — "Vacancies: only posts they qualify for".

    `?all=1` drops the match and shows the whole board. A teacher who wants to
    look beyond what we matched them to should be able to, and an app that only
    ever shows a filtered view is an app people assume is broken.
    """

    authentication_classes = [CustomAuthentication]
    permission_classes = [IsTeacher]
    serializer_class = VacancyCardSerializer

    def get_queryset(self):
        show_all = str(self.request.query_params.get("all", "")).lower() in ("1", "true", "yes")
        base = Vacancy.objects.public() if show_all else Vacancy.objects.matching(self.request.teacher)
        return apply_filters(base.select_related("school"), self.request.query_params)


class TeacherVacancyDetail(RetrieveAPIView):
    """GET v1/teacher/vacancies/<id>/ — the detail, plus whether they already
    applied. Without `has_applied` the app shows an Apply button that fails on
    the unique constraint, which reads as a bug rather than as "you did this"."""

    authentication_classes = [CustomAuthentication]
    permission_classes = [IsTeacher]
    serializer_class = VacancyReadSerializer

    def get_queryset(self):
        return _with_counts(Vacancy.objects.public())

    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        existing = instance.applications.filter(teacher=request.teacher).first()
        data = self.get_serializer(instance).data
        data["has_applied"] = existing is not None
        data["application"] = {"id": existing.id, "stage": existing.stage} if existing else None
        return ok("", data)


# ── school ──────────────────────────────────────────────────────────────────


class SchoolVacancyList(ListCreateAPIView):
    """GET / POST v1/school/vacancies/ — a school's own posts, and posting one.

    An unverified school CAN create here, deliberately — blocking it made the
    verification queue a dead end. The post is saved as a draft and
    `Vacancy.can_publish()` is what holds it off the board until the office has
    seen the institution's affiliation certificate. See `user.auth.IsSchool`.
    """

    authentication_classes = [CustomAuthentication]
    permission_classes = [IsSchool]
    serializer_class = VacancySerializer

    def get_queryset(self):
        return _with_counts(self.request.school.vacancies.all())

    def list(self, request, *args, **kwargs):
        queryset = apply_filters(self.get_queryset(), request.query_params)
        status_filter = (request.query_params.get("status") or "").strip()
        if status_filter == "open":
            queryset = queryset.filter(status__in=OPEN_STATUSES)
        elif status_filter:
            queryset = queryset.filter(status=status_filter)
        page = self.paginate_queryset(queryset)
        if page is not None:
            return self.get_paginated_response(VacancyPanelSerializer(page, many=True).data)
        return Response(VacancyPanelSerializer(queryset, many=True).data)

    def create(self, request, *args, **kwargs):
        """Answers in the project envelope, like every other endpoint.

        DRF's own create returns a bare 201 with the write serializer's fields,
        which is a second response shape for the frontend to handle and omits
        everything the school's list is drawn from.
        """
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        return ok("Vacancy saved as a draft. Publish it when you are ready.",
                  VacancyPanelSerializer(serializer.instance).data)

    def perform_create(self, serializer):
        """The school comes from the token, never from the payload (§4.4)."""
        from vacancy.models import SOURCE_SCHOOL

        school = self.request.school
        serializer.save(
            school=school,
            source=SOURCE_SCHOOL,
            posted_by=self.request.user,
            school_name=school.name,
            city=serializer.validated_data.get("city") or school.city,
            institution_type=serializer.validated_data.get("institution_type") or school.institution_type,
        )


class SchoolVacancyDetail(RetrieveUpdateDestroyAPIView):
    authentication_classes = [CustomAuthentication]
    permission_classes = [IsSchool]
    serializer_class = VacancySerializer

    def get_queryset(self):
        return _with_counts(self.request.school.vacancies.all())

    def retrieve(self, request, *args, **kwargs):
        return ok("", VacancyPanelSerializer(self.get_object()).data)

    def perform_destroy(self, instance):
        """Closed, not deleted. Applications hang off a vacancy, and deleting it
        would take a teacher's history with it — including a placement the firm
        has been paid for."""
        instance.status = STATUS_CLOSED
        instance.save(update_fields=["status", "updated_at"])


class SchoolVacancyAction(APIView):
    """POST v1/school/vacancies/<id>/<action> — publish, close, fill."""

    authentication_classes = [CustomAuthentication]
    permission_classes = [IsSchool]

    def post(self, request, pk, action):
        vacancy = get_object_or_404(self.request.school.vacancies, pk=pk)
        return _act(vacancy, action, request.user)


# ── the firm's panel ────────────────────────────────────────────────────────


class PanelVacancyList(ListCreateAPIView):
    """GET / POST v1/panel/vacancies/ — every post, including drafts.

    `new_applications` is annotated rather than counted per row because the
    panel's list is the first screen staff open each morning and it shows thirty
    posts; a property would make it thirty-one queries.
    """

    authentication_classes = [CustomAuthentication]
    permission_classes = [IsStaff]
    serializer_class = VacancySerializer

    def get_queryset(self):
        from application.models import STAGE_APPLIED

        return (
            Vacancy.objects.select_related("school", "consultant")
            .annotate(
                applications_count=Count("applications", distinct=True),
                new_applications=Count(
                    "applications", filter=Q(applications__stage=STAGE_APPLIED), distinct=True
                ),
            )
        )

    def list(self, request, *args, **kwargs):
        queryset = apply_filters(self.get_queryset(), request.query_params)
        status_filter = (request.query_params.get("status") or "").strip()
        if status_filter == "open":
            queryset = queryset.filter(status__in=OPEN_STATUSES)
        elif status_filter:
            queryset = queryset.filter(status=status_filter)
        if (request.query_params.get("mine") or "") == "1":
            queryset = queryset.filter(consultant=request.user)
        page = self.paginate_queryset(queryset)
        if page is not None:
            return self.get_paginated_response(VacancyPanelSerializer(page, many=True).data)
        return Response(VacancyPanelSerializer(queryset, many=True).data)

    def perform_create(self, serializer):
        from vacancy.models import SOURCE_FIRM

        serializer.save(source=SOURCE_FIRM, posted_by=self.request.user)


class PanelVacancyDetail(RetrieveUpdateDestroyAPIView):
    authentication_classes = [CustomAuthentication]
    permission_classes = [IsStaff]
    serializer_class = VacancySerializer
    queryset = Vacancy.objects.all()

    def get_queryset(self):
        return _with_counts(Vacancy.objects.all())

    def retrieve(self, request, *args, **kwargs):
        return ok("", VacancyPanelSerializer(self.get_object()).data)

    def perform_destroy(self, instance):
        instance.status = STATUS_CLOSED
        instance.save(update_fields=["status", "updated_at"])


class PanelVacancyAction(APIView):
    """POST v1/panel/vacancies/<id>/<action> — publish, close, fill, assign.

    `publish` notifies matching teachers, which is the proposal's "send a push
    notification to matching teachers in the same action". It is deliberately
    part of publishing rather than a second button: a vacancy that goes live
    without telling anybody is the failure mode of every job board.
    """

    authentication_classes = [CustomAuthentication]
    permission_classes = [IsStaff]

    def post(self, request, pk, action):
        vacancy = get_object_or_404(Vacancy, pk=pk)
        if action == "assign":
            from user.models import User

            consultant_id = request.data.get("consultant") or ""
            consultant = User.objects.filter(pk=consultant_id, is_staff_member=True).first() if consultant_id else None
            if consultant_id and consultant is None:
                return fail("That is not a member of staff.")
            vacancy.consultant = consultant
            vacancy.save(update_fields=["consultant", "updated_at"])
            return ok("Assigned." if consultant else "Unassigned.")
        if action == "note":
            vacancy.internal_note = str(request.data.get("note") or "")
            vacancy.save(update_fields=["internal_note", "updated_at"])
            return ok("Note saved.")
        return _act(vacancy, action, request.user, notify=True)


def _act(vacancy, action: str, by, notify: bool = False):
    """The three state changes both the school and the panel can make.

    One function because the rules must not differ by who is asking: a school
    publishing its own post goes through exactly the same verification check as
    the office publishing it for them.
    """
    if action == "publish":
        published, reason = vacancy.publish(by=by)
        if not published:
            return fail(reason, code="cannot_publish")
        if notify:
            from notifications.service import notify_matching_teachers

            reached = notify_matching_teachers(vacancy, by=by)
            return ok(f"Published. {reached} teachers notified.", {"notified": reached})
        return ok("Published.")

    if action == "close":
        vacancy.status = STATUS_CLOSED
        vacancy.save(update_fields=["status", "updated_at"])
        return ok("Closed.")

    if action == "fill":
        vacancy.status = STATUS_FILLED
        vacancy.filled_at = timezone.now()
        vacancy.save(update_fields=["status", "filled_at", "updated_at"])
        return ok("Marked as filled.")

    if action == "unpublish":
        # Keeps `status`, drops visibility — the "take it off the board to fix a
        # typo" case, which must not lose the stage the post had reached.
        vacancy.published_at = None
        vacancy.save(update_fields=["published_at", "updated_at"])
        return ok("Taken off the board.")

    return fail(f"Unknown action: {action}", status_code=404)
