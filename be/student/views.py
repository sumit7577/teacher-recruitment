"""The student/parent workspace, and what a teacher may see of it.

Mounted across three audiences (CLAUDE.md §3):

    v1/student/    the family's own workspace
    v1/teacher/    browsing requirements, which is a different serializer
    v1/panel/      the office

The consent rule is enforced in the queryset (`TuitionRequirement.live()`) and
at the one other door (`Interest.may_open`), never in a view body. A view that
writes its own version is the bug — there are four views here and it would only
take one of them forgetting.
"""

from django.db.models import Count, Q
from rest_framework.generics import ListAPIView, ListCreateAPIView, RetrieveUpdateDestroyAPIView
from rest_framework.views import APIView

from app.jsonfilter import json_list_has
from app.responses import fail, ok
from location.models import haversine_km
from student.models import StudentProfile, TuitionRequirement
from student.serializer import (
    ConsentSerializer,
    StudentPanelSerializer,
    StudentProfileSerializer,
    StudentSelfSerializer,
    TuitionRequirementCardSerializer,
    TuitionRequirementReadSerializer,
    TuitionRequirementSerializer,
)
from user.auth import CustomAuthentication, IsStaff, IsStudent, IsStudentAudience, IsTeacher


class StudentProfileView(APIView):
    """GET/POST/PATCH v1/student/profile/ — create or read your own.

    `APIView` rather than a generic, for the same reason the teacher and school
    equivalents are: the resource may not exist yet, and a generic retrieve
    would 404 someone on the single request that matters most to them.
    """

    authentication_classes = [CustomAuthentication]
    permission_classes = [IsStudentAudience]

    def get(self, request):
        profile = getattr(request.user, "student_profile", None)
        if profile is None:
            return fail("No profile yet.", code="needs_profile", status_code=404)
        return ok("", StudentSelfSerializer(profile).data)

    def post(self, request):
        if getattr(request.user, "student_profile", None) is not None:
            return fail("You already have a profile.", status_code=400)
        serializer = StudentProfileSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        profile = serializer.save(user=request.user)
        return ok("Profile created.", StudentSelfSerializer(profile).data)

    def patch(self, request):
        profile = getattr(request.user, "student_profile", None)
        if profile is None:
            return fail("No profile yet.", code="needs_profile", status_code=404)
        serializer = StudentProfileSerializer(profile, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return ok("Saved.", StudentSelfSerializer(profile).data)


class ConsentView(APIView):
    """POST v1/student/consent/ — a guardian agreeing, once.

    Separate from the profile PATCH deliberately. Consent is not a field: it is
    an act by a named adult at a recorded moment, and making it a column anyone
    could set in a profile update would mean a fourteen-year-old could tick it
    for themselves.
    """

    authentication_classes = [CustomAuthentication]
    permission_classes = [IsStudent]

    def post(self, request):
        serializer = ConsentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        profile = request.student
        if not profile.is_minor:
            return fail("This profile does not need a guardian's consent.", status_code=400)
        profile.give_consent(serializer.validated_data["guardian_name"])
        return ok("Consent recorded. The profile is now visible to teachers.",
                  StudentSelfSerializer(profile).data)


class MyRequirementList(ListCreateAPIView):
    """GET/POST v1/student/requirements/ — what this family has posted."""

    authentication_classes = [CustomAuthentication]
    permission_classes = [IsStudent]

    def get_serializer_class(self):
        return TuitionRequirementSerializer if self.request.method == "POST" \
            else TuitionRequirementReadSerializer

    def get_queryset(self):
        # Tenant isolation in the queryset, never in a parameter.
        return self.request.student.requirements.annotate(
            interests_count=Count("id", distinct=True),
        )

    def perform_create(self, serializer):
        serializer.save(student=self.request.student)


class MyRequirementDetail(RetrieveUpdateDestroyAPIView):
    authentication_classes = [CustomAuthentication]
    permission_classes = [IsStudent]

    def get_serializer_class(self):
        return TuitionRequirementReadSerializer if self.request.method == "GET" \
            else TuitionRequirementSerializer

    def get_queryset(self):
        return self.request.student.requirements.all()


class NearbyTeacherList(ListAPIView):
    """GET v1/student/teachers/ — teachers who take home tuition, near us.

    Uses the teacher *card* serializer, which carries no phone and no email.
    The firm's whole business is being the channel between the two sides, and
    a list that hands over a mobile number is the firm being cut out of its own
    introduction — the same reason the school-facing serializer withholds them.
    """

    authentication_classes = [CustomAuthentication]
    permission_classes = [IsStudent]

    def get_serializer_class(self):
        from teacher.serializer import TeacherCardSerializer
        return TeacherCardSerializer

    def get_queryset(self):
        from app import taxonomy
        from teacher.models import TeacherProfile

        teachers = TeacherProfile.objects.filter(
            is_hidden=False, is_open_to_work=True,
        ).select_related("user")
        # Only those who said they would do home tuition. Everyone else is
        # looking for a school post and does not want these enquiries.
        teachers = json_list_has(
            teachers, "teaching_preferences", taxonomy.TEACHING_PREFERENCE_TUITION,
        )

        params = self.request.query_params
        me = self.request.student

        if params.get("subject"):
            teachers = teachers.filter(subjects__icontains=params["subject"])
        if params.get("klass"):
            teachers = json_list_has(teachers, "classes_taught", params["klass"])
        if params.get("medium"):
            teachers = teachers.filter(medium=params["medium"])

        # "Nearby" — the bounding box, then a true distance sort. See
        # NearbyQuerySet.near for why the cheap filter comes first.
        lat = _float(params.get("lat")) if params.get("lat") else me.latitude
        lon = _float(params.get("lng")) if params.get("lng") else me.longitude
        if lat is not None and lon is not None:
            km = _float(params.get("km")) or 25
            teachers = teachers.near(lat, lon, km)
            rows = list(teachers)
            for row in rows:
                row.distance_km = haversine_km(lat, lon, row.latitude, row.longitude)
            return sorted(rows, key=lambda r: r.distance_km)

        if me.district_ref_id:
            teachers = teachers.filter(
                Q(district_ref_id=me.district_ref_id) | Q(open_to_all_india=True)
            )
        return teachers


def _float(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


# ── what a teacher sees ─────────────────────────────────────────────────────


class OpenRequirementList(ListAPIView):
    """GET v1/teacher/tuitions/ — open requirements a teacher could take.

    `TuitionRequirement.live()` is what applies the consent rule here. It is
    the queryset, not a check in this body, precisely so that the next list
    endpoint written over this table inherits it.
    """

    authentication_classes = [CustomAuthentication]
    permission_classes = [IsTeacher]
    serializer_class = TuitionRequirementCardSerializer

    def get_queryset(self):
        rows = TuitionRequirement.objects.live().select_related(
            "student", "student__district_ref", "district_ref",
        )
        params = self.request.query_params
        me = self.request.teacher

        if params.get("subject"):
            rows = rows.filter(subjects__icontains=params["subject"])
        if params.get("klass"):
            rows = rows.filter(klass=params["klass"])
        if params.get("medium"):
            rows = rows.filter(medium=params["medium"])
        if params.get("mode"):
            rows = rows.filter(mode=params["mode"])

        lat = _float(params.get("lat")) if params.get("lat") else me.latitude
        lon = _float(params.get("lng")) if params.get("lng") else me.longitude
        if lat is not None and lon is not None:
            km = _float(params.get("km")) or 25
            found = list(rows.near(lat, lon, km))
            for row in found:
                row.distance_km = haversine_km(lat, lon, row.latitude, row.longitude)
            return sorted(found, key=lambda r: r.distance_km)

        if me.district_ref_id:
            rows = rows.filter(district_ref_id=me.district_ref_id)
        return rows


# ── the office ──────────────────────────────────────────────────────────────


class PanelStudentList(ListAPIView):
    authentication_classes = [CustomAuthentication]
    permission_classes = [IsStaff]
    serializer_class = StudentPanelSerializer

    def get_queryset(self):
        rows = StudentProfile.objects.select_related("user", "district_ref")
        params = self.request.query_params
        if params.get("needs_consent") == "1":
            # The queue that actually matters to the office: children whose
            # profiles are stuck invisible waiting for a parent to agree.
            from student.models import _minor_cutoff
            rows = rows.filter(
                date_of_birth__gt=_minor_cutoff(), guardian_consent_at__isnull=True,
            )
        query = (params.get("q") or "").strip()
        if query:
            rows = rows.filter(
                Q(student_name__icontains=query) | Q(user__phone__icontains=query)
            )
        return rows


class PanelStudentDetail(RetrieveUpdateDestroyAPIView):
    authentication_classes = [CustomAuthentication]
    permission_classes = [IsStaff]
    serializer_class = StudentPanelSerializer
    queryset = StudentProfile.objects.select_related("user")


class PanelRequirementList(ListAPIView):
    authentication_classes = [CustomAuthentication]
    permission_classes = [IsStaff]
    serializer_class = TuitionRequirementReadSerializer

    def get_queryset(self):
        rows = TuitionRequirement.objects.select_related("student")
        status = self.request.query_params.get("status")
        if status in dict(TuitionRequirement.STATUS_CHOICES):
            rows = rows.filter(status=status)
        return rows
