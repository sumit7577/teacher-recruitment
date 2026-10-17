"""The fourth audience — a student, or the parent of one.

The first three audiences are all in the hiring business: a teacher wants a
job, an institution wants to fill a post, the office sits between them. This
one is not. A parent wants somebody to come to the house on Tuesday and
Thursday and teach their daughter chemistry, and none of the existing
machinery fits: there is no vacancy, no application, no demo class, no offer
letter.

So it is a separate app with its own two models:

    `StudentProfile`       who the learner is, and who speaks for them
    `TuitionRequirement`   a posting — what is needed, where, and for how much

A requirement is deliberately **not** a `Vacancy`. They look similar for about
one field and then diverge completely: a vacancy has a salary band, a board, a
qualification bar and an applicant pipeline with ten stages; a requirement has
a budget per month, two days a week, and a parent who wants three tutors to
call them. Forcing them into one table would mean a dozen nullable columns and
an `if` in every query, which is how the vacancy board would eventually start
showing tuition requests to principals.

## Consent

The brief asks for "parent/guardian consent process for minor students" and it
is the one rule in this app with teeth. A minor's profile is not visible and
cannot be contacted until a named guardian has consented — see
`needs_consent` and the queryset below. The account may be held by the parent
*or* by the student; `account_holder` records which, because a seventeen-year-
old signing up for themselves still needs a guardian on the record.
"""

from datetime import date

from django.db import models
from django.utils import timezone

from app import taxonomy
from app.public_id import PublicId
from location.models import NearbyQuerySet
from user.models import User

# Below this, a guardian must consent before anyone can see or contact them.
MINOR_AGE = 18


class StudentQuerySet(NearbyQuerySet):
    def contactable(self):
        """Profiles a teacher may actually be shown.

        Three conditions, and the consent one is the reason this is a method
        rather than a filter written out at each call site. A minor whose
        guardian has not consented must not appear in a search result, a
        nearby list, or an interest a teacher can send — and "must not appear
        anywhere" is exactly the kind of rule that gets applied in three places
        out of four.
        """
        return self.filter(is_hidden=False).exclude(
            models.Q(date_of_birth__gt=_minor_cutoff()) & models.Q(guardian_consent_at__isnull=True)
        )


def _minor_cutoff() -> date:
    """Anyone born after this date is under `MINOR_AGE` today."""
    today = timezone.localdate()
    try:
        return today.replace(year=today.year - MINOR_AGE)
    except ValueError:
        # 29 February. The 28th is the conventional answer and errs towards
        # treating someone as a minor for one more day, which is the safe way
        # to be wrong here.
        return today.replace(year=today.year - MINOR_AGE, day=28)


class StudentProfile(models.Model):
    """The learner, and the adult responsible for them."""

    ACCOUNT_STUDENT = "student"
    ACCOUNT_PARENT = "parent"
    ACCOUNT_CHOICES = (
        (ACCOUNT_STUDENT, "The student"),
        (ACCOUNT_PARENT, "A parent or guardian"),
    )

    RELATION_CHOICES = (
        ("mother", "Mother"),
        ("father", "Father"),
        ("guardian", "Guardian"),
        ("self", "Self"),
        ("other", "Other"),
    )

    id = PublicId(prefix="stu")
    # Same pattern as teacher and school: the profile IS the role. A parent who
    # is also a teacher is not a data error.
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="student_profile")

    account_holder = models.CharField(
        max_length=10, choices=ACCOUNT_CHOICES, default=ACCOUNT_PARENT,
    )
    student_name = models.CharField(max_length=140, db_index=True)
    # Nullable because a parent registering in a hurry will skip it. Nullable
    # is treated as "not known to be an adult" — `needs_consent` says why.
    date_of_birth = models.DateField(null=True, blank=True)
    klass = models.CharField(
        max_length=10, choices=taxonomy.CLASS_CHOICES, blank=True, default="",
        db_index=True, verbose_name="Class",
    )
    school_name = models.CharField(max_length=180, blank=True, default="")
    board = models.CharField(
        max_length=20, choices=taxonomy.BOARD_CHOICES, blank=True, default="",
    )
    medium = models.CharField(
        max_length=12, choices=taxonomy.MEDIUM_CHOICES, blank=True, default="",
    )

    # ── the adult ───────────────────────────────────────────────────────
    guardian_name = models.CharField(max_length=140, blank=True, default="")
    guardian_relation = models.CharField(
        max_length=10, choices=RELATION_CHOICES, blank=True, default="",
    )
    guardian_phone = models.CharField(max_length=20, blank=True, default="")
    guardian_email = models.EmailField(max_length=254, blank=True, default="")
    # The consent itself. A timestamp rather than a boolean, because "when did
    # they agree" is the question actually asked afterwards.
    guardian_consent_at = models.DateTimeField(null=True, blank=True)
    guardian_consent_by = models.CharField(
        max_length=140, blank=True, default="",
        help_text="The name typed by whoever gave consent.",
    )

    # ── where ───────────────────────────────────────────────────────────
    address = models.TextField(blank=True, default="")
    village = models.CharField(max_length=140, blank=True, default="")
    city = models.CharField(max_length=80, blank=True, default="", db_index=True)
    pincode = models.CharField(max_length=10, blank=True, default="", db_index=True)
    state_ref = models.ForeignKey(
        "location.State", on_delete=models.SET_NULL, null=True, blank=True, related_name="students",
    )
    district_ref = models.ForeignKey(
        "location.District", on_delete=models.SET_NULL, null=True, blank=True, related_name="students",
    )
    block_ref = models.ForeignKey(
        "location.Block", on_delete=models.SET_NULL, null=True, blank=True, related_name="students",
    )
    latitude = models.FloatField(null=True, blank=True)
    longitude = models.FloatField(null=True, blank=True)

    is_hidden = models.BooleanField(default=False, db_index=True)
    internal_note = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    objects = StudentQuerySet.as_manager()

    @property
    def age(self) -> int | None:
        if not self.date_of_birth:
            return None
        today = timezone.localdate()
        return today.year - self.date_of_birth.year - (
            (today.month, today.day) < (self.date_of_birth.month, self.date_of_birth.day)
        )

    @property
    def is_minor(self) -> bool:
        """Unknown age counts as a minor.

        Most users of a home-tuition service are schoolchildren, so an absent
        date of birth is far more likely to be a parent who skipped the field
        than an adult learner. Defaulting the other way would publish a child's
        address and the name of their school on the strength of a blank form
        field.
        """
        age = self.age
        return True if age is None else age < MINOR_AGE

    @property
    def needs_consent(self) -> bool:
        return self.is_minor and self.guardian_consent_at is None

    @property
    def is_contactable(self) -> bool:
        return not self.is_hidden and not self.needs_consent

    def give_consent(self, name: str) -> None:
        """Record a guardian's agreement. Stamped once and not re-stamped —
        consent already given is not improved by giving it again, and the
        original date is the one that matters if it is ever questioned."""
        if self.guardian_consent_at is None:
            self.guardian_consent_at = timezone.now()
            self.guardian_consent_by = (name or "").strip()[:140]
            self.save(update_fields=["guardian_consent_at", "guardian_consent_by", "updated_at"])

    def __str__(self) -> str:
        return f"{self.student_name} ({self.get_klass_display() or 'class not set'})"

    class Meta:
        managed = True
        db_table = "student_profile"
        ordering = ("-created_at",)


class TuitionRequirementQuerySet(NearbyQuerySet):
    def live(self):
        """Open requirements from a profile a teacher is allowed to see.

        The consent rule reaches through to the posting: a minor's requirement
        carries their class, their subjects and the area they live in, which is
        the same exposure as the profile. Hiding one and not the other would be
        a gap with a child on the other side of it.
        """
        return self.filter(
            status=TuitionRequirement.STATUS_OPEN,
            student__is_hidden=False,
        ).exclude(
            models.Q(student__date_of_birth__gt=_minor_cutoff())
            & models.Q(student__guardian_consent_at__isnull=True)
        )


class TuitionRequirement(models.Model):
    """"I need a maths tutor for class 9, twice a week, in Kankarbagh."

    Posted by a student or parent; answered by a teacher sending an interest.
    """

    MODE_HOME = "home"
    MODE_CHOICES = (
        (MODE_HOME, "At our home"),
        ("teacher_place", "At the teacher's place"),
        ("online", "Online"),
        ("either", "Either"),
    )

    STATUS_OPEN = "open"
    STATUS_CHOICES = (
        (STATUS_OPEN, "Looking"),
        ("filled", "Found someone"),
        ("closed", "No longer needed"),
    )

    GENDER_CHOICES = (
        ("", "No preference"),
        ("female", "Female teacher"),
        ("male", "Male teacher"),
    )

    id = PublicId(prefix="tur")
    student = models.ForeignKey(
        StudentProfile, on_delete=models.CASCADE, related_name="requirements",
    )

    klass = models.CharField(
        max_length=10, choices=taxonomy.CLASS_CHOICES, db_index=True, verbose_name="Class",
    )
    subjects = models.JSONField(default=list, blank=True)
    medium = models.CharField(
        max_length=12, choices=taxonomy.MEDIUM_CHOICES, blank=True, default="",
    )
    board = models.CharField(
        max_length=20, choices=taxonomy.BOARD_CHOICES, blank=True, default="",
    )
    exams = models.JSONField(default=list, blank=True)

    mode = models.CharField(max_length=16, choices=MODE_CHOICES, default=MODE_HOME)
    days_per_week = models.PositiveSmallIntegerField(null=True, blank=True)
    preferred_time = models.CharField(
        max_length=80, blank=True, default="", help_text="e.g. after 5 pm, or weekend mornings",
    )
    # Rupees per month, not paise: this is a stated expectation to be
    # negotiated, never a number anything charges against. `payments` uses
    # paise precisely because it is the opposite kind of figure.
    budget_min = models.PositiveIntegerField(null=True, blank=True)
    budget_max = models.PositiveIntegerField(null=True, blank=True)
    # Routinely asked for a tutor coming to a family home, and refusing to
    # model it does not make it stop being asked — it makes it happen over the
    # telephone where nobody can see it.
    teacher_gender = models.CharField(
        max_length=8, choices=GENDER_CHOICES, blank=True, default="",
    )

    # Where the teaching happens. Copied from the student on save when blank,
    # because most tuition is at home — but a parent may want it near the
    # office or the grandparents' house instead.
    city = models.CharField(max_length=80, blank=True, default="", db_index=True)
    district_ref = models.ForeignKey(
        "location.District", on_delete=models.SET_NULL, null=True, blank=True,
        related_name="requirements",
    )
    block_ref = models.ForeignKey(
        "location.Block", on_delete=models.SET_NULL, null=True, blank=True,
        related_name="requirements",
    )
    latitude = models.FloatField(null=True, blank=True)
    longitude = models.FloatField(null=True, blank=True)

    description = models.TextField(blank=True, default="")
    status = models.CharField(
        max_length=10, choices=STATUS_CHOICES, default=STATUS_OPEN, db_index=True,
    )
    view_count = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(default=timezone.now, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = TuitionRequirementQuerySet.as_manager()

    def save(self, *args, **kwargs):
        # Inherit the student's location when none was given. Done here rather
        # than in the serializer so a row created from the admin or a script
        # is not left unfindable by every location filter.
        if self.student_id:
            if not self.city:
                self.city = self.student.city
            if self.district_ref_id is None:
                self.district_ref_id = self.student.district_ref_id
            if self.block_ref_id is None:
                self.block_ref_id = self.student.block_ref_id
            if self.latitude is None and self.longitude is None:
                self.latitude = self.student.latitude
                self.longitude = self.student.longitude
        if isinstance(self.subjects, list):
            seen = {}
            for subject in self.subjects:
                cleaned = str(subject or "").strip()
                if cleaned:
                    seen.setdefault(cleaned.lower(), cleaned)
            self.subjects = list(seen.values())
        super().save(*args, **kwargs)

    @property
    def budget_label(self) -> str:
        if self.budget_min and self.budget_max:
            return f"₹{self.budget_min:,}–{self.budget_max:,} a month"
        if self.budget_max:
            return f"Up to ₹{self.budget_max:,} a month"
        if self.budget_min:
            return f"From ₹{self.budget_min:,} a month"
        return "Budget not stated"

    def __str__(self) -> str:
        return f"{self.get_klass_display()} · {', '.join(self.subjects) or 'subjects not set'}"

    class Meta:
        managed = True
        db_table = "tuition_requirement"
        ordering = ("-created_at",)
        indexes = [models.Index(fields=["status", "klass"])]
