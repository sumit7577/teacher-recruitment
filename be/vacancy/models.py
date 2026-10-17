"""A vacancy — the one row all four audiences read.

Field names follow the demo's vacancy card, because the card is the contract:
qualification above salary, the demo-class format spelled out, duties and
requirements as lists rather than a paragraph. A principal scanning twelve posts
reads the four lines of `requirements`; nobody reads `description`.

Two things worth knowing before changing this model:

**`salary_min_lpa` / `salary_max_lpa` are numbers, `salary_note` is words.**
Sorting by salary is on the board, so the range cannot live in a string. But
"+ accommodation", "as per CBSE norms" and "UGC norms" are the part a teacher
actually negotiates, and flattening them into a number loses the offer.

**`status` is the pipeline, `published_at` is visibility.** A vacancy is on the
website when it is live AND published — staff can take a live post off the board
to fix a typo without losing the stage it had reached, and a draft that was never
published has no stale date hanging off it.
"""

from django.db import models
from django.db.models import Q
from django.utils import timezone

from app import taxonomy
from app.public_id import PublicId
from location.models import NearbyQuerySet
from school.models import School
from user.models import User

STATUS_DRAFT = "draft"
STATUS_PENDING = "pending_review"
STATUS_LIVE = "live"
STATUS_SHORTLISTING = "shortlisting"
STATUS_INTERVIEWING = "interviewing"
STATUS_FILLED = "filled"
STATUS_CLOSED = "closed"

STATUS_CHOICES = (
    (STATUS_DRAFT, "Draft"),
    (STATUS_PENDING, "Waiting for review"),
    (STATUS_LIVE, "Live"),
    (STATUS_SHORTLISTING, "Shortlisting"),
    (STATUS_INTERVIEWING, "Interviewing"),
    (STATUS_FILLED, "Filled"),
    (STATUS_CLOSED, "Closed"),
)

# Still taking applications. `shortlisting` is in here on purpose: the board
# keeps showing a post while the firm works through the first batch, because
# closing it early is how a good candidate is lost.
OPEN_STATUSES = (STATUS_LIVE, STATUS_SHORTLISTING)

SOURCE_FIRM = "firm"
SOURCE_SCHOOL = "school"
SOURCE_CHOICES = ((SOURCE_FIRM, "Posted by the office"), (SOURCE_SCHOOL, "Posted by the institution"))


class VacancyQuerySet(NearbyQuerySet):
    def public(self):
        """What an anonymous visitor may see. Everything else — drafts, posts
        waiting for review, a filled post — is invisible, and this method is the
        only thing the public views are allowed to start from."""
        return self.filter(
            status__in=OPEN_STATUSES,
            published_at__isnull=False,
            published_at__lte=timezone.now(),
        ).filter(Q(closes_on__isnull=True) | Q(closes_on__gte=timezone.now().date()))

    def matching(self, teacher):
        """Vacancies this teacher qualifies for — the app's whole first screen.

        Deliberately generous on two axes and strict on one. Strict on `post`,
        because a PRT vacancy is not a PGT job and showing it wastes everybody's
        time. Generous on subject (a "Physics" teacher sees "Physical Science")
        and on city (their own city plus anywhere they said they would move to,
        and everything if they ticked relocate).

        Experience is a floor, not a band match: a teacher with six years should
        see the 1–3 yrs post if they want it. It is their time.
        """
        qs = self.public()
        if teacher is None:
            return qs
        if teacher.post:
            qs = qs.filter(post=teacher.post)

        subjects = [s for s in (teacher.subjects or []) if s]
        if subjects:
            subject_q = Q(subject="")
            for subject in subjects:
                subject_q |= Q(subject__icontains=subject)
            qs = qs.filter(subject_q)

        if not teacher.willing_to_relocate:
            cities = [c for c in ([teacher.city] + list(teacher.preferred_cities or [])) if c]
            if cities:
                city_q = Q()
                for city in cities:
                    city_q |= Q(city__iexact=city)
                qs = qs.filter(city_q)

        years = float(teacher.experience_years or 0)
        qs = qs.filter(Q(experience_min__isnull=True) | Q(experience_min__lte=years))
        return qs


class Vacancy(models.Model):
    id = PublicId(prefix="vac")

    # Null when the firm is hiring on behalf of a school that has no account
    # here — which is most of them at launch, and the reason this is nullable
    # rather than required. `school_name` then carries what goes on the card.
    school = models.ForeignKey(
        School, on_delete=models.SET_NULL, null=True, blank=True, related_name="vacancies",
    )
    school_name = models.CharField(max_length=180, blank=True, default="")
    school_initials = models.CharField(max_length=4, blank=True, default="")
    source = models.CharField(max_length=10, choices=SOURCE_CHOICES, default=SOURCE_FIRM, db_index=True)
    posted_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name="vacancies_posted",
    )

    title = models.CharField(max_length=180)
    post = models.CharField(max_length=20, choices=taxonomy.POST_CHOICES, db_index=True)
    subject = models.CharField(max_length=80, blank=True, default="", db_index=True)
    institution_type = models.CharField(
        max_length=20, choices=taxonomy.INSTITUTION_CHOICES, default="school", db_index=True,
    )
    board = models.CharField(max_length=20, choices=taxonomy.BOARD_CHOICES, blank=True, default="")
    grades = models.CharField(max_length=60, blank=True, default="")
    openings = models.PositiveSmallIntegerField(default=1)

    city = models.CharField(max_length=80, db_index=True)
    state = models.CharField(max_length=80, blank=True, default="")
    locality = models.CharField(max_length=120, blank=True, default="")

    # The line that sits at the top of the card: "M.Sc + B.Ed".
    qualification = models.CharField(max_length=160, blank=True, default="")
    # The same thing machine-readable, for matching and for the website's filter.
    qualification_codes = models.JSONField(default=list, blank=True)

    experience_band = models.CharField(
        max_length=10, choices=taxonomy.EXPERIENCE_CHOICES,
        default=taxonomy.EXPERIENCE_FRESHER, db_index=True,
    )
    experience_min = models.DecimalField(max_digits=4, decimal_places=1, null=True, blank=True)
    experience_max = models.DecimalField(max_digits=4, decimal_places=1, null=True, blank=True)

    salary_min_lpa = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    salary_max_lpa = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True, db_index=True)
    salary_note = models.CharField(max_length=80, blank=True, default="")
    salary_hidden = models.BooleanField(default=False)

    description = models.TextField(blank=True, default="")
    duties = models.JSONField(default=list, blank=True)
    requirements = models.JSONField(default=list, blank=True)
    # "Demo class: 30 minutes, Class XII, topic given one day in advance."
    demo_class = models.TextField(blank=True, default="")

    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default=STATUS_DRAFT, db_index=True)
    is_featured = models.BooleanField(default=False, db_index=True)
    is_urgent = models.BooleanField(default=False)
    published_at = models.DateTimeField(null=True, blank=True, db_index=True)
    closes_on = models.DateField(null=True, blank=True)
    filled_at = models.DateTimeField(null=True, blank=True)

    consultant = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name="vacancies_handled",
    )
    internal_note = models.TextField(blank=True, default="")
    view_count = models.PositiveIntegerField(default=0)

    # ── the questions a teacher asks before applying ────────────────────
    #
    # Asked symmetrically with the teacher profile, so a match is a comparison
    # and not an interpretation. Medium decides whether they can teach the
    # class at all; the residential block decides whether they will move.
    designation = models.CharField(
        max_length=24, choices=taxonomy.DESIGNATION_CHOICES, blank=True, default="", db_index=True,
    )
    medium = models.CharField(
        max_length=12, choices=taxonomy.MEDIUM_CHOICES, blank=True, default="",
    )
    exams = models.JSONField(default=list, blank=True)
    classes_taught = models.JSONField(default=list, blank=True)

    is_residential = models.BooleanField(default=False, db_index=True)
    accommodation = models.CharField(
        max_length=16, choices=taxonomy.ACCOMMODATION_CHOICES, blank=True, default="",
    )
    food = models.CharField(max_length=8, choices=taxonomy.FOOD_CHOICES, blank=True, default="")
    facilities = models.JSONField(default=list, blank=True)
    residential_note = models.TextField(blank=True, default="")

    # Structured location, mirroring the teacher's. `city`/`state` above stay.
    state_ref = models.ForeignKey(
        "location.State", on_delete=models.SET_NULL, null=True, blank=True, related_name="vacancies",
    )
    district_ref = models.ForeignKey(
        "location.District", on_delete=models.SET_NULL, null=True, blank=True, related_name="vacancies",
    )
    block_ref = models.ForeignKey(
        "location.Block", on_delete=models.SET_NULL, null=True, blank=True, related_name="vacancies",
    )
    latitude = models.FloatField(null=True, blank=True)
    longitude = models.FloatField(null=True, blank=True)

    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    objects = VacancyQuerySet.as_manager()

    # A vacancy carries the "New" flag on the board for this long after it is
    # published. Seven days, because the board is checked weekly by most
    # teachers and a badge that never expires is not a badge.
    NEW_FOR_DAYS = 7

    @property
    def is_new(self) -> bool:
        if not self.published_at:
            return False
        return (timezone.now() - self.published_at).days < self.NEW_FOR_DAYS

    @property
    def is_open(self) -> bool:
        return self.status in OPEN_STATUSES and bool(self.published_at)

    @property
    def institution_name(self) -> str:
        """What goes on the card. The linked school wins over the typed name, so
        a school that renames itself renames its posts."""
        if self.school_id and self.school:
            return self.school.name
        return self.school_name

    @property
    def institution_initials(self) -> str:
        if self.school_id and self.school:
            return self.school.initials
        return self.school_initials or School.derive_initials(self.school_name)

    @property
    def salary_label(self) -> str:
        """"₹4.8 – 7.2 LPA", or "Not disclosed". Built here and not in the
        frontend because the website, the app and the panel all print it, and
        three implementations is three roundings."""
        if self.salary_hidden:
            return "Not disclosed"
        low, high = self.salary_min_lpa, self.salary_max_lpa
        if low and high and low != high:
            return f"₹{_trim(low)} – {_trim(high)} LPA"
        value = high or low
        return f"₹{_trim(value)} LPA" if value else "Not disclosed"

    def can_publish(self) -> tuple:
        """(allowed, reason). The institution-verification promise lives here:
        a school's own post waits until staff have checked the school."""
        if self.school_id and self.school and not self.school.is_verified:
            return False, "This institution has not been verified yet."
        if not self.title or not self.post or not self.city:
            return False, "A vacancy needs a title, a post and a city."
        return True, ""

    def publish(self, by=None) -> tuple:
        allowed, reason = self.can_publish()
        if not allowed:
            return False, reason
        self.status = STATUS_LIVE
        self.published_at = self.published_at or timezone.now()
        self.save(update_fields=["status", "published_at", "updated_at"])
        return True, ""

    def save(self, *args, **kwargs):
        if self.school_id and self.school and not self.school_name:
            self.school_name = self.school.name
        if not self.school_initials:
            self.school_initials = School.derive_initials(self.institution_name)
        if self.experience_min is not None:
            self.experience_band = taxonomy.experience_band(self.experience_min)
        if self.status == STATUS_FILLED and not self.filled_at:
            self.filled_at = timezone.now()
        super().save(*args, **kwargs)

    def __str__(self) -> str:
        return f"{self.title} — {self.institution_name}, {self.city}"

    class Meta:
        managed = True
        db_table = "vacancy"
        ordering = ("-published_at", "-created_at")
        indexes = [
            # The board's own query: live posts in a city for a post type,
            # newest first.
            models.Index(fields=["status", "published_at"], name="idx_vacancy_board"),
            models.Index(fields=["post", "city", "status"], name="idx_vacancy_filter"),
        ]


def _trim(value) -> str:
    """7.2 not 7.20, and 7 not 7.0 — the card has no room for trailing zeros."""
    text = f"{float(value):.2f}".rstrip("0").rstrip(".")
    return text or "0"
