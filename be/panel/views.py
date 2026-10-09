"""The dashboard the office opens first.

"Live vacancies, new applications, the hiring pipeline for the session, and every
demo class booked this week."

One endpoint, because that screen is four cards and a calendar and four requests
would be four spinners. Every number is a COUNT over an indexed column — nothing
here loads rows to count them, which is the difference between a dashboard that
opens instantly at 50 vacancies and one that still does at 5,000.
"""

from django.db.models import Count, Q
from django.utils import timezone
from rest_framework.views import APIView

from app.responses import ok
from user.auth import CustomAuthentication, IsStaff


class DashboardView(APIView):
    authentication_classes = [CustomAuthentication]
    permission_classes = [IsStaff]

    def get(self, request):
        from app import taxonomy
        from application.models import (
            CLOSED_STAGES,
            STAGE_APPLIED,
            STAGE_CHOICES,
            STAGE_JOINED,
            STAGE_ORDER,
            Application,
            DemoClass,
        )
        from application.serializer import ApplicationPanelSerializer, DemoClassReadSerializer
        from cms.models import Enquiry
        from school.models import School
        from teacher.models import TeacherProfile
        from vacancy.models import OPEN_STATUSES, STATUS_PENDING, Vacancy
        from vacancy.serializer import VacancyPanelSerializer

        now = timezone.now()
        today = now.date()
        week_end = now + timezone.timedelta(days=7)
        month_start = today.replace(day=1)

        vacancies = Vacancy.objects.all()
        applications = Application.objects.all()
        live = vacancies.filter(status__in=OPEN_STATUSES, published_at__isnull=False)

        # The pipeline, as one grouped query rather than eight counts. The order
        # comes from STAGE_ORDER so the board reads left to right the way the
        # process actually runs — a dict ordered by whatever Postgres returned
        # would reshuffle between requests.
        tallies = dict(
            applications.values_list("stage").annotate(n=Count("id")).values_list("stage", "n")
        )
        labels = dict(STAGE_CHOICES)
        pipeline = [
            {"stage": stage, "label": labels[stage], "count": tallies.get(stage, 0)}
            for stage in STAGE_ORDER
        ]

        demos = (
            DemoClass.objects.filter(
                scheduled_at__gte=now,
                scheduled_at__lte=week_end,
                status=DemoClass.STATUS_SCHEDULED,
            )
            .select_related("application__teacher__user", "application__vacancy")
            .order_by("scheduled_at")
        )

        recent = (
            applications.filter(stage=STAGE_APPLIED)
            .select_related("teacher__user", "vacancy", "vacancy__school", "consultant")
            .prefetch_related("teacher__documents", "demo_classes", "events__by")
            .order_by("-applied_at")[:8]
        )

        return ok("", {
            "counts": {
                "live_vacancies": live.count(),
                "awaiting_review": vacancies.filter(status=STATUS_PENDING).count(),
                "new_applications": applications.filter(stage=STAGE_APPLIED).count(),
                "in_pipeline": applications.exclude(stage__in=CLOSED_STAGES).count(),
                "demo_classes_this_week": demos.count(),
                "placed_this_month": applications.filter(
                    stage=STAGE_JOINED, stage_changed_at__date__gte=month_start
                ).count(),
                "teachers": TeacherProfile.objects.count(),
                "teachers_unverified": TeacherProfile.objects.filter(
                    verification=taxonomy.VERIFICATION_PENDING
                ).count(),
                "schools": School.objects.count(),
                "schools_unverified": School.objects.filter(
                    status=taxonomy.VERIFICATION_PENDING
                ).count(),
                "new_enquiries": Enquiry.objects.filter(status="new").count(),
                "documents_pending": _documents_pending(),
            },
            "pipeline": pipeline,
            "demo_classes": DemoClassReadSerializer(demos[:10], many=True).data,
            "new_applications": ApplicationPanelSerializer(recent, many=True).data,
            # The posts carrying the most unworked applications. This is the
            # actual answer to "what should the office do today" — a vacancy with
            # eleven people waiting on it beats one with none.
            "needs_attention": VacancyPanelSerializer(
                live.select_related("school", "consultant")
                .annotate(
                    applications_count=Count("applications", distinct=True),
                    new_applications=Count(
                        "applications", filter=Q(applications__stage=STAGE_APPLIED), distinct=True
                    ),
                )
                .filter(new_applications__gt=0)
                .order_by("-new_applications")[:6],
                many=True,
            ).data,
        })


def _documents_pending() -> int:
    from app import taxonomy
    from teacher.models import TeacherDocument

    return TeacherDocument.objects.filter(status=taxonomy.VERIFICATION_PENDING).count()


class StaffListView(APIView):
    """GET v1/panel/dashboard/staff/ — who the "assign a consultant" dropdowns
    may offer. Deliberately not a user search: the only people this returns are
    the firm's own staff."""

    authentication_classes = [CustomAuthentication]
    permission_classes = [IsStaff]

    def get(self, request):
        from user.models import User

        staff = User.objects.filter(is_staff_member=True, is_active=True).order_by("name")
        return ok("", [
            {"id": member.id, "name": member.name or member.phone, "phone": member.phone}
            for member in staff
        ])


class PasswordResetView(APIView):
    """POST v1/panel/dashboard/password-reset/ — the office hands out a new password.

    With no SMS gateway there is no self-service "forgot password", so this is
    the whole recovery path: a teacher rings, the office confirms who they are
    the same way it already does for their certificates, and reads out a
    temporary password.

    The password is generated here rather than typed by staff, because a human
    choosing one under time pressure picks the school's name. It is shown once,
    in the response, and never stored in readable form — `set_password` hashes
    it, so asking again produces a new one rather than revealing the old.

    Staff accounts are excluded on purpose. Panel access is granted by
    `manage.py make_staff` on the server, and an endpoint that could reset a
    colleague's password is an endpoint that can take over the panel.
    """

    authentication_classes = [CustomAuthentication]
    permission_classes = [IsStaff]

    def post(self, request):
        import secrets

        from user.models import User
        from user.service import is_valid_phone, normalise_phone

        from app.responses import fail

        phone = normalise_phone(request.data.get("phone"))
        if not is_valid_phone(phone):
            return fail("Enter a 10-digit mobile number.", status_code=400)

        user = User.objects.filter(phone=phone).first()
        if user is None:
            return fail("No account on that number.", code="not_found", status_code=404)
        if user.is_staff_member:
            return fail(
                "Panel accounts are reset on the server, not from here.",
                code="staff_account", status_code=403,
            )

        # Unambiguous over the phone: no l/1, no O/0, and spoken in two halves.
        alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
        temporary = "".join(secrets.choice(alphabet) for _ in range(4)) + "-" + \
                    "".join(secrets.choice(alphabet) for _ in range(4))
        user.set_password(temporary)
        user.save(update_fields=["password"])
        # Every existing session dies with the password. A reset usually means
        # the account is in the wrong hands, and leaving the old tokens alive
        # would make the reset cosmetic.
        user.tokens.all().delete()

        return ok("Password reset. Read this out — it is not shown again.", {
            "phone": user.phone,
            "name": user.name,
            "temporary_password": temporary,
        })
