"""Teacher search, for an institution.

Sections 4 and 5 of the brief ask for it plainly: "search/filter teachers".
Until now only the office could, and that was deliberate — the firm sits
between the two sides, verifies the documents, and earns its fee for being
there. Opening direct search changes what the business is, and that was
flagged in writing before this was built. It is a commercial decision and it
has been made.

What it is **not** is an open contact list. Three things hold:

  * `TeacherCardSerializer` — no phone, no email, no CV URL. Same shape a
    school already sees on an applicant card.
  * Hidden profiles and teachers not open to work never appear.
  * Reaching a teacher still goes through an interest they must accept
    (`v1/connect/`), or through the office. Search finds people; it does not
    deliver them.
"""

from django.db.models import Prefetch, Q
from rest_framework.generics import ListAPIView

from app import taxonomy
from location.models import haversine_km
from teacher.models import TeacherDocument, TeacherProfile
from teacher.serializer import TeacherCardSerializer
from user.auth import CustomAuthentication, IsSchool


class SchoolTeacherSearch(ListAPIView):
    """GET v1/school/teachers/

    `?post=` `?designation=` `?subject=` `?qualification=` `?experience=`
    `?medium=` `?district=` `?block=` `?city=` `?residential=true`
    `?exam=` `?verified=true` `?q=` `?lat=&lon=&km=`
    """

    authentication_classes = [CustomAuthentication]
    permission_classes = [IsSchool]
    serializer_class = TeacherCardSerializer

    def get_queryset(self):
        params = self.request.query_params

        rows = (
            TeacherProfile.objects
            # The floor. A teacher who has hidden their profile or closed
            # themselves to offers is not findable, by anyone, through here.
            .filter(is_hidden=False, is_open_to_work=True, user__is_active=True)
            .select_related("user", "district_ref", "block_ref")
            # The card prints a tick per verified document; without this it is
            # one query per teacher in the list.
            .prefetch_related(Prefetch("documents", queryset=TeacherDocument.objects.only(
                "kind", "status", "teacher_id",
            )))
        )

        if post := params.get("post"):
            rows = rows.filter(post=post)
        if designation := params.get("designation"):
            rows = rows.filter(designation=designation)
        if subject := params.get("subject"):
            rows = rows.filter(subjects__icontains=subject)
        if qualification := params.get("qualification"):
            rows = rows.filter(qualifications__icontains=qualification)
        if experience := params.get("experience"):
            rows = rows.filter(experience_band=experience)
        if medium := params.get("medium"):
            # A teacher who teaches in both mediums answers a search for
            # either; one who has not said is not excluded on a guess.
            rows = rows.filter(Q(medium=medium) | Q(medium="both") | Q(medium=""))
        if exam := params.get("exam"):
            rows = rows.filter(exams__icontains=exam)
        if city := params.get("city"):
            rows = rows.filter(city__iexact=city)
        if district := params.get("district"):
            # "All India" teachers answer every district search — that is what
            # they said they wanted when they ticked it.
            rows = rows.filter(Q(district_ref_id=district) | Q(open_to_all_india=True))
        if block := params.get("block"):
            rows = rows.filter(block_ref_id=block)
        if params.get("residential") == "true":
            rows = rows.filter(open_to_residential=True)
        if params.get("verified") == "true":
            rows = rows.filter(verification=taxonomy.VERIFICATION_VERIFIED)
        if query := (params.get("q") or "").strip():
            rows = rows.filter(
                Q(user__name__icontains=query)
                | Q(headline__icontains=query)
                | Q(subjects__icontains=query)
            )

        lat, lon = _coords(params)
        if lat is not None:
            rows = rows.near(lat, lon, _float(params.get("km"), 25.0))

        return rows

    def list(self, request, *args, **kwargs):
        response = super().list(request, *args, **kwargs)
        lat, lon = _coords(request.query_params)
        if lat is None or not isinstance(response.data, dict):
            return response

        # Distance is attached to the page, not computed in SQL. Haversine in a
        # WHERE clause cannot use an index; the bounding box in `near()` does
        # the filtering, and this labels the ten rows that survived it.
        page = {row["id"]: row for row in response.data.get("results", [])}
        for obj in TeacherProfile.objects.filter(id__in=list(page)).only(
            "id", "latitude", "longitude",
        ):
            row = page.get(str(obj.id))
            if row is not None and obj.latitude is not None:
                row["distance_km"] = round(haversine_km(lat, lon, obj.latitude, obj.longitude), 1)
        response.data["results"] = sorted(
            page.values(),
            key=lambda r: r.get("distance_km") if r.get("distance_km") is not None else 1e9,
        )
        return response


def _float(value, default=None):
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _coords(params):
    """`lat`/`lon`, or (None, None). An out-of-range value is treated as absent
    rather than clamped — `lat=999` is a broken caller, and silently searching
    near the north pole hides the bug."""
    lat, lon = _float(params.get("lat")), _float(params.get("lon"))
    if lat is None or lon is None:
        return None, None
    if not (-90 <= lat <= 90) or not (-180 <= lon <= 180):
        return None, None
    return lat, lon
