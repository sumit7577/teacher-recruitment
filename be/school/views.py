"""The institution's workspace, and the panel's view of every institution."""

from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.generics import ListAPIView
from rest_framework.views import APIView

from app import taxonomy
from app.responses import fail, ok
from school.models import School
from school.serializer import SchoolPanelSerializer, SchoolSelfSerializer, SchoolSerializer
from user.auth import CustomAuthentication, IsSchool, IsSchoolAudience, IsStaff


class SchoolProfileView(APIView):
    """GET / POST / PATCH v1/school/

    Same create-or-fetch shape as the teacher profile, and for the same reason:
    the registration form POSTs, everything after it PATCHes, and a generic
    retrieve view would 404 the school that is registering.
    """

    authentication_classes = [CustomAuthentication]

    def get_permissions(self):
        if self.request.method == "POST":
            return [IsSchoolAudience()]
        return [IsSchool()]

    def get(self, request):
        return ok("", SchoolSelfSerializer(request.school).data)

    def post(self, request):
        if getattr(request.user, "school_profile", None) is not None:
            return fail("You already have an institution profile.", code="exists", status_code=409)
        serializer = SchoolSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        school = serializer.save(user=request.user)
        if not request.user.name and school.contact_person:
            request.user.name = school.contact_person[:150]
            request.user.city = school.city
            request.user.save(update_fields=["name", "city"])
        return ok(
            "Registered. Our office will verify your institution — usually within a day.",
            SchoolSelfSerializer(school).data,
        )

    def patch(self, request):
        serializer = SchoolSerializer(request.school, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return ok("Saved.", SchoolSelfSerializer(request.school).data)


class SchoolDashboardView(APIView):
    """GET v1/school/dashboard/

    "Live posts, new applicants with one-click shortlist, demo classes this week,
    and the banner telling them their affiliation certificate is still
    outstanding." All four come from here in one request, because four requests
    is four spinners on the screen a school opens first.
    """

    authentication_classes = [CustomAuthentication]
    permission_classes = [IsSchool]

    def get(self, request):
        from application.models import CLOSED_STAGES, STAGE_APPLIED, Application, DemoClass
        from application.serializer import ApplicationCardSerializer, DemoClassReadSerializer
        from vacancy.models import OPEN_STATUSES
        from vacancy.serializer import VacancyPanelSerializer

        school = request.school
        vacancies = school.vacancies.all()
        live = vacancies.filter(status__in=OPEN_STATUSES, published_at__isnull=False)

        applications = (
            Application.objects
            .filter(vacancy__school=school)
            .select_related("teacher__user", "vacancy")
            .prefetch_related("teacher__documents")
        )
        week_ahead = timezone.now() + timezone.timedelta(days=7)
        demos = (
            DemoClass.objects.filter(
                application__vacancy__school=school,
                scheduled_at__gte=timezone.now(),
                scheduled_at__lte=week_ahead,
                status=DemoClass.STATUS_SCHEDULED,
            )
            .select_related("application__teacher__user", "application__vacancy")
            .order_by("scheduled_at")
        )

        return ok("", {
            "school": SchoolSelfSerializer(school).data,
            "counts": {
                "live_vacancies": live.count(),
                "total_vacancies": vacancies.count(),
                "new_applications": applications.filter(stage=STAGE_APPLIED).count(),
                "in_progress": applications.exclude(stage__in=CLOSED_STAGES).count(),
                "demo_classes_this_week": demos.count(),
            },
            "live_vacancies": VacancyPanelSerializer(
                live.annotate(applications_count=Count("applications"))[:6], many=True
            ).data,
            "new_applications": ApplicationCardSerializer(
                applications.filter(stage=STAGE_APPLIED)[:8], many=True
            ).data,
            "demo_classes": DemoClassReadSerializer(demos[:8], many=True).data,
        })


# ── the firm's panel ────────────────────────────────────────────────────────


def _panel_queryset():
    from vacancy.models import OPEN_STATUSES

    return School.objects.select_related("user", "consultant").annotate(
        vacancies_count=Count("vacancies", distinct=True),
        live_vacancies=Count(
            "vacancies",
            filter=Q(vacancies__status__in=OPEN_STATUSES, vacancies__published_at__isnull=False),
            distinct=True,
        ),
    )


class PanelSchoolList(ListAPIView):
    """GET v1/panel/schools/ — every institution, verified or waiting."""

    authentication_classes = [CustomAuthentication]
    permission_classes = [IsStaff]
    serializer_class = SchoolPanelSerializer

    def get_queryset(self):
        params = self.request.query_params
        queryset = _panel_queryset()
        status_filter = (params.get("status") or "").strip()
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        city = (params.get("city") or "").strip()
        if city:
            queryset = queryset.filter(city__iexact=city)
        institution_type = (params.get("institution_type") or "").strip()
        if institution_type:
            queryset = queryset.filter(institution_type=institution_type)
        query = (params.get("q") or "").strip()
        if query:
            queryset = queryset.filter(
                Q(name__icontains=query)
                | Q(city__icontains=query)
                | Q(contact_person__icontains=query)
                | Q(user__phone__icontains=query)
            )
        return queryset.order_by("-created_at")


class PanelSchoolDetail(APIView):
    """GET / PATCH v1/panel/schools/<id>/ — the record and the office's note."""

    authentication_classes = [CustomAuthentication]
    permission_classes = [IsStaff]

    STAFF_FIELDS = ("internal_note", "consultant")

    def get(self, request, pk):
        return ok("", SchoolPanelSerializer(get_object_or_404(_panel_queryset(), pk=pk)).data)

    def patch(self, request, pk):
        school = get_object_or_404(School, pk=pk)
        changed = []
        if "internal_note" in request.data:
            school.internal_note = str(request.data["internal_note"])
            changed.append("internal_note")
        if "consultant" in request.data:
            from user.models import User

            consultant_id = request.data["consultant"] or ""
            consultant = User.objects.filter(pk=consultant_id, is_staff_member=True).first() if consultant_id else None
            if consultant_id and consultant is None:
                return fail("That is not a member of staff.")
            school.consultant = consultant
            changed.append("consultant")
        if not changed:
            return fail("Nothing to change.")
        school.save(update_fields=changed + ["updated_at"])
        return ok("Saved.", SchoolPanelSerializer(get_object_or_404(_panel_queryset(), pk=pk)).data)


class PanelSchoolVerify(APIView):
    """POST v1/panel/schools/<id>/verify — the promise the firm sells to teachers.

    Verifying also publishes whatever the school posted while it waited. A school
    that registered, posted three vacancies and then sat behind a verification
    queue should not have to go back and publish each one by hand — and if we
    make them, the posts sit invisible and the school concludes the product does
    not work.
    """

    authentication_classes = [CustomAuthentication]
    permission_classes = [IsStaff]

    def post(self, request, pk):
        school = get_object_or_404(School, pk=pk)
        status = str(request.data.get("status") or "").strip()
        if status not in dict(taxonomy.VERIFICATION_CHOICES):
            return fail("Pass status as pending, verified or rejected.")
        reason = str(request.data.get("reason") or "")
        if status == taxonomy.VERIFICATION_REJECTED and not reason:
            return fail("Say why — the institution is shown this.")

        school.mark(status, by=request.user, reason=reason)

        published = 0
        if status == taxonomy.VERIFICATION_VERIFIED:
            from vacancy.models import STATUS_DRAFT, STATUS_PENDING

            for vacancy in school.vacancies.filter(status__in=(STATUS_PENDING, STATUS_DRAFT)):
                done, _ = vacancy.publish(by=request.user)
                published += 1 if done else 0

        from notifications.service import deliver

        if status == taxonomy.VERIFICATION_VERIFIED:
            deliver(
                [school.user], kind="account",
                title="Your institution is verified",
                body="Your vacancies are live and teachers can apply.",
                data={"screen": "school_dashboard"},
            )
        elif status == taxonomy.VERIFICATION_REJECTED:
            deliver(
                [school.user], kind="account",
                title="We need something more from you",
                body=reason,
                data={"screen": "school_profile"},
            )

        return ok(
            f"Saved.{f' {published} vacancies published.' if published else ''}",
            SchoolPanelSerializer(get_object_or_404(_panel_queryset(), pk=pk)).data,
        )
