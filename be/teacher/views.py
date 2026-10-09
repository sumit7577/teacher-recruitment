"""The teacher's own profile, and the panel's view of every teacher."""

from django.db.models import Count, Prefetch, Q
from django.shortcuts import get_object_or_404
from rest_framework.generics import ListAPIView, ListCreateAPIView, RetrieveUpdateDestroyAPIView
from rest_framework.response import Response
from rest_framework.views import APIView

from app import taxonomy
from app.responses import fail, ok
from teacher.models import TeacherDocument, TeacherExperience, TeacherProfile
from teacher.serializer import (
    TeacherDocumentReadSerializer,
    TeacherDocumentSerializer,
    TeacherExperienceReadSerializer,
    TeacherExperienceSerializer,
    TeacherPanelSerializer,
    TeacherProfileSerializer,
    TeacherSelfSerializer,
)
from user.auth import CustomAuthentication, IsStaff, IsTeacher, IsTeacherAudience


class TeacherProfileView(APIView):
    """GET / POST / PATCH v1/teacher/profile/

    An APIView rather than a generic, because the resource may not exist yet and
    the same URL has to both create it and fetch it — the signup wizard POSTs,
    everything afterwards PATCHes. A generic `RetrieveUpdateAPIView` would 404
    the new teacher on the one request that matters (CLAUDE.md §4.2 keeps
    APIView for exactly this).

    POST runs behind `IsTeacherAudience` (a teacher token, profile or not) and
    GET/PATCH behind `IsTeacher` (profile guaranteed), which is why the
    permissions are chosen per method.
    """

    authentication_classes = [CustomAuthentication]

    def get_permissions(self):
        if self.request.method == "POST":
            return [IsTeacherAudience()]
        return [IsTeacher()]

    def get(self, request):
        return ok("", TeacherSelfSerializer(self._load(request.teacher.pk)).data)

    def post(self, request):
        if getattr(request.user, "teacher_profile", None) is not None:
            return fail("You already have a teacher profile.", code="exists", status_code=409)
        serializer = TeacherProfileSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        profile = serializer.save(user=request.user)
        # Name and city are asked for on the same form but live on `User`, which
        # is the row the school workspace and the panel both read. Kept in step
        # here rather than asking the client to make two calls.
        updates = {}
        if request.data.get("name") and not request.user.name:
            updates["name"] = str(request.data["name"])[:150]
        if profile.city and not request.user.city:
            updates["city"] = profile.city
        if updates:
            for field, value in updates.items():
                setattr(request.user, field, value)
            request.user.save(update_fields=list(updates))
        return ok("Profile created.", TeacherSelfSerializer(self._load(profile.pk)).data)

    def patch(self, request):
        serializer = TeacherProfileSerializer(request.teacher, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return ok("Saved.", TeacherSelfSerializer(self._load(request.teacher.pk)).data)

    @staticmethod
    def _load(pk):
        return (
            TeacherProfile.objects.select_related("user")
            .prefetch_related("documents", "experience")
            .get(pk=pk)
        )


class TeacherDocumentList(ListCreateAPIView):
    """GET / POST v1/teacher/profile/documents/

    Re-uploading a kind REPLACES it. The unique constraint on (teacher, kind)
    would otherwise reject the second upload with a database error, and a teacher
    whose B.Ed scan came out dark has to be able to send a better one.
    """

    authentication_classes = [CustomAuthentication]
    permission_classes = [IsTeacher]
    serializer_class = TeacherDocumentSerializer

    def get_queryset(self):
        return self.request.teacher.documents.all()

    def list(self, request, *args, **kwargs):
        queryset = self.get_queryset()
        return ok("", {
            "documents": TeacherDocumentReadSerializer(queryset, many=True).data,
            "required": [
                {"kind": kind, "label": dict(taxonomy.DOCUMENT_CHOICES)[kind]}
                for kind in taxonomy.REQUIRED_DOCUMENTS
            ],
            "missing": request.teacher.missing_documents,
        })

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        kind = serializer.validated_data["kind"]
        if kind != "other":
            # Back to pending: a replaced document has not been checked, and
            # inheriting the old row's "verified" would be a forgery.
            self.request.teacher.documents.filter(kind=kind).delete()
        document = serializer.save(teacher=self.request.teacher)
        return ok("Uploaded.", TeacherDocumentReadSerializer(document).data)


class TeacherDocumentDetail(APIView):
    """DELETE v1/teacher/profile/documents/<id>/ — withdraw a document."""

    authentication_classes = [CustomAuthentication]
    permission_classes = [IsTeacher]

    def delete(self, request, pk):
        document = get_object_or_404(request.teacher.documents, pk=pk)
        document.delete()
        return ok("Removed.")


class TeacherExperienceList(ListCreateAPIView):
    authentication_classes = [CustomAuthentication]
    permission_classes = [IsTeacher]
    serializer_class = TeacherExperienceSerializer
    pagination_class = None

    def get_queryset(self):
        return self.request.teacher.experience.all()

    def list(self, request, *args, **kwargs):
        return ok("", TeacherExperienceReadSerializer(self.get_queryset(), many=True).data)

    def perform_create(self, serializer):
        serializer.save(teacher=self.request.teacher)


class TeacherExperienceDetail(RetrieveUpdateDestroyAPIView):
    authentication_classes = [CustomAuthentication]
    permission_classes = [IsTeacher]
    serializer_class = TeacherExperienceSerializer

    def get_queryset(self):
        return self.request.teacher.experience.all()

    def retrieve(self, request, *args, **kwargs):
        return ok("", TeacherExperienceReadSerializer(self.get_object()).data)


# ── the firm's panel ────────────────────────────────────────────────────────


def _panel_queryset():
    from application.models import STAGE_JOINED

    return (
        TeacherProfile.objects.select_related("user")
        .prefetch_related("documents", "experience")
        .annotate(
            applications_count=Count("applications", distinct=True),
            placed_count=Count(
                "applications", filter=Q(applications__stage=STAGE_JOINED), distinct=True
            ),
        )
    )


class PanelTeacherList(ListAPIView):
    """GET v1/panel/teachers/ — "A record per teacher with their qualification
    and history"."""

    authentication_classes = [CustomAuthentication]
    permission_classes = [IsStaff]
    serializer_class = TeacherPanelSerializer

    def get_queryset(self):
        params = self.request.query_params
        queryset = _panel_queryset()

        post = (params.get("post") or "").strip()
        if post:
            queryset = queryset.filter(post=post)
        city = (params.get("city") or "").strip()
        if city:
            queryset = queryset.filter(city__iexact=city)
        subject = (params.get("subject") or "").strip()
        if subject:
            queryset = queryset.filter(subjects__icontains=subject)
        verification = (params.get("verification") or "").strip()
        if verification:
            queryset = queryset.filter(verification=verification)
        if (params.get("open") or "") == "1":
            queryset = queryset.filter(is_open_to_work=True)

        query = (params.get("q") or "").strip()
        if query:
            queryset = queryset.filter(
                Q(user__name__icontains=query)
                | Q(user__phone__icontains=query)
                | Q(user__email__icontains=query)
                | Q(subjects__icontains=query)
                | Q(headline__icontains=query)
            )
        return queryset.order_by("-created_at")


class PanelTeacherDetail(APIView):
    """GET / PATCH v1/panel/teachers/<id>/ — the record, and the office's note.

    PATCH here reaches the three fields the teacher's own serializer excludes —
    `verification`, `police_verified`, `internal_note` — and nothing else. Staff
    editing a teacher's subjects for them is not a thing we want: it makes the
    profile something the teacher no longer owns, and the next support call is
    about a change they did not make.
    """

    authentication_classes = [CustomAuthentication]
    permission_classes = [IsStaff]

    STAFF_FIELDS = ("verification", "police_verified", "internal_note")

    def get(self, request, pk):
        teacher = get_object_or_404(_panel_queryset(), pk=pk)
        return ok("", TeacherPanelSerializer(teacher).data)

    def patch(self, request, pk):
        teacher = get_object_or_404(TeacherProfile, pk=pk)
        changed = []
        for field in self.STAFF_FIELDS:
            if field in request.data:
                value = request.data[field]
                if field == "verification":
                    if value not in dict(taxonomy.VERIFICATION_CHOICES):
                        return fail("Not a verification state we know.")
                elif field == "police_verified":
                    value = str(value).lower() in ("1", "true", "yes")
                else:
                    value = str(value)
                setattr(teacher, field, value)
                changed.append(field)
        if not changed:
            return fail("Nothing to change.")
        teacher.save(update_fields=changed + ["updated_at"])
        return ok("Saved.", TeacherPanelSerializer(get_object_or_404(_panel_queryset(), pk=pk)).data)


class PanelDocumentVerify(APIView):
    """POST v1/panel/teachers/<teacher>/documents/<document>/

    "A teacher's documents ticked off one by one, with who verified them." The
    signature is the reason this is not a PATCH on the document: `mark()` writes
    `verified_by` and `verified_at` together, and a verification nobody signed is
    one nobody can be asked about.
    """

    authentication_classes = [CustomAuthentication]
    permission_classes = [IsStaff]

    def post(self, request, pk, document):
        teacher = get_object_or_404(TeacherProfile, pk=pk)
        row = get_object_or_404(teacher.documents, pk=document)
        status = str(request.data.get("status") or "").strip()
        if status not in dict(taxonomy.VERIFICATION_CHOICES):
            return fail("Pass status as pending, verified or rejected.")
        note = str(request.data.get("note") or "")
        if status == taxonomy.VERIFICATION_REJECTED and not note:
            return fail("Say why it was rejected — the teacher is shown this.")
        row.mark(status, by=request.user, note=note)

        from notifications.service import deliver

        if status != taxonomy.VERIFICATION_PENDING:
            verb = "verified" if status == taxonomy.VERIFICATION_VERIFIED else "could not be accepted"
            deliver(
                [teacher.user], kind="document",
                title=f"Your {row.get_kind_display()} was {verb}",
                body=note or "Open the app to see your documents.",
                data={"screen": "documents"},
            )
        return ok("Saved.", TeacherDocumentReadSerializer(row).data)
