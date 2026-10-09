"""The pipeline — one teacher, one vacancy, and every stage between.

The proposal sells the pipeline as the thing that stops the "koi update?" phone
calls: "Application status, including the demo-class date, topic and grade" in
the app, and "exactly where they have reached" in the panel. That only holds if
the stage is SET by someone rather than inferred, and if every move is recorded
with who made it.

Hence `ApplicationEvent`. A stage column alone answers "where is she now"; the
event log answers "who shortlisted her, when, and what did the school say" —
which is the question that actually gets asked, three weeks later, by a school
that has changed its mind.
"""

from django.db import models
from django.utils import timezone

from app.public_id import PublicId
from teacher.models import TeacherProfile
from user.models import User
from vacancy.models import Vacancy

STAGE_APPLIED = "applied"
STAGE_SCREENING = "screening"
STAGE_SHORTLISTED = "shortlisted"
STAGE_DEMO_SCHEDULED = "demo_scheduled"
STAGE_DEMO_DONE = "demo_done"
STAGE_INTERVIEW = "interview"
STAGE_OFFERED = "offered"
STAGE_JOINED = "joined"
STAGE_REJECTED = "rejected"
STAGE_WITHDRAWN = "withdrawn"

STAGE_CHOICES = (
    (STAGE_APPLIED, "Applied"),
    (STAGE_SCREENING, "Documents being checked"),
    (STAGE_SHORTLISTED, "Shortlisted"),
    (STAGE_DEMO_SCHEDULED, "Demo class scheduled"),
    (STAGE_DEMO_DONE, "Demo class done"),
    (STAGE_INTERVIEW, "Interview"),
    (STAGE_OFFERED, "Offer made"),
    (STAGE_JOINED, "Joined"),
    (STAGE_REJECTED, "Not selected"),
    (STAGE_WITHDRAWN, "Withdrawn by the teacher"),
)

# The order the pipeline is drawn in on the dashboard, and the order a teacher's
# progress bar fills. Rejected and withdrawn are endings, not steps, so they are
# not in it.
STAGE_ORDER = (
    STAGE_APPLIED, STAGE_SCREENING, STAGE_SHORTLISTED, STAGE_DEMO_SCHEDULED,
    STAGE_DEMO_DONE, STAGE_INTERVIEW, STAGE_OFFERED, STAGE_JOINED,
)
CLOSED_STAGES = (STAGE_JOINED, STAGE_REJECTED, STAGE_WITHDRAWN)


class Application(models.Model):
    id = PublicId(prefix="app")
    vacancy = models.ForeignKey(Vacancy, on_delete=models.CASCADE, related_name="applications")
    teacher = models.ForeignKey(TeacherProfile, on_delete=models.CASCADE, related_name="applications")

    stage = models.CharField(max_length=20, choices=STAGE_CHOICES, default=STAGE_APPLIED, db_index=True)
    cover_note = models.TextField(blank=True, default="")

    # Who in the office owns this one. The panel assigns it; the teacher never
    # sees it.
    consultant = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name="applications_handled",
    )
    # Shown to the teacher when the stage is `rejected`. A rejection with no
    # reason is the thing that generates the phone call this product exists to
    # stop.
    outcome_note = models.CharField(max_length=300, blank=True, default="")
    internal_note = models.TextField(blank=True, default="")

    # A school may mark its own shortlist, so the firm needs to know which side
    # moved it last.
    stage_set_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name="applications_moved",
    )
    stage_changed_at = models.DateTimeField(default=timezone.now)
    applied_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    @property
    def is_closed(self) -> bool:
        return self.stage in CLOSED_STAGES

    @property
    def progress(self) -> int:
        """How far along, 0–100, for the teacher's own progress bar. A rejected
        application keeps the progress it had reached rather than dropping to
        zero — it tells the teacher how far they got."""
        if self.stage in (STAGE_REJECTED, STAGE_WITHDRAWN):
            last = self.events.exclude(to_stage__in=CLOSED_STAGES).order_by("-at").first()
            reference = last.to_stage if last else STAGE_APPLIED
        else:
            reference = self.stage
        try:
            index = STAGE_ORDER.index(reference)
        except ValueError:
            return 0
        return int(round((index + 1) * 100 / len(STAGE_ORDER)))

    @property
    def documents_pending(self) -> list:
        """Which of this teacher's required documents are not verified yet. The
        school's applicant card shows them ticked off one by one, so this reads
        the teacher's documents rather than keeping a second copy of the answer.
        """
        from app import taxonomy

        verified = set(
            self.teacher.documents.filter(status=taxonomy.VERIFICATION_VERIFIED)
            .values_list("kind", flat=True)
        )
        return [kind for kind in taxonomy.REQUIRED_DOCUMENTS if kind not in verified]

    def move(self, stage: str, by=None, note: str = "") -> "ApplicationEvent":
        """Move to `stage` and record who did it.

        The only way the stage should ever change. A bare `application.stage =
        x; save()` leaves the pipeline with a hole in it, and the hole is always
        found by the person trying to explain a decision to a school.
        """
        previous = self.stage
        self.stage = stage
        self.stage_set_by = by
        self.stage_changed_at = timezone.now()
        if note and stage in (STAGE_REJECTED, STAGE_WITHDRAWN):
            self.outcome_note = note[:300]
        self.save(update_fields=[
            "stage", "stage_set_by", "stage_changed_at", "outcome_note", "updated_at",
        ])
        return ApplicationEvent.objects.create(
            application=self, from_stage=previous, to_stage=stage, by=by, note=note[:300],
        )

    def __str__(self) -> str:
        return f"{self.teacher} → {self.vacancy.title}"

    class Meta:
        managed = True
        db_table = "application"
        ordering = ("-applied_at",)
        constraints = [
            # One application per teacher per vacancy. Without this, a
            # double-tapped Apply button in the app puts the same teacher on a
            # school's list twice.
            models.UniqueConstraint(fields=["vacancy", "teacher"], name="uq_application_vacancy_teacher"),
        ]
        indexes = [
            models.Index(fields=["stage", "applied_at"], name="idx_application_stage"),
        ]


class ApplicationEvent(models.Model):
    """One move, kept forever. Append-only — nothing updates these rows."""

    id = PublicId(prefix="evt")
    application = models.ForeignKey(Application, on_delete=models.CASCADE, related_name="events")
    from_stage = models.CharField(max_length=20, choices=STAGE_CHOICES, blank=True, default="")
    to_stage = models.CharField(max_length=20, choices=STAGE_CHOICES)
    by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name="application_events",
    )
    note = models.CharField(max_length=300, blank=True, default="")
    at = models.DateTimeField(default=timezone.now)

    class Meta:
        managed = True
        db_table = "application_event"
        ordering = ("-at",)


class DemoClass(models.Model):
    """The stage between shortlist and interview, with the topic and the grade
    fixed in advance.

    A FK rather than a OneToOne because a demo class gets rescheduled, and the
    first date having existed is part of the record — a teacher who was stood up
    once should not have that quietly erased. `Application.demo_classes.first()`
    is the current one, by ordering.
    """

    MODE_CHOICES = (("in_person", "At the institution"), ("online", "Online"))
    STATUS_SCHEDULED = "scheduled"
    STATUS_CHOICES = (
        (STATUS_SCHEDULED, "Scheduled"),
        ("done", "Done"),
        ("cancelled", "Cancelled"),
        ("no_show", "Teacher did not attend"),
        ("rescheduled", "Rescheduled"),
    )

    id = PublicId(prefix="dmo")
    application = models.ForeignKey(Application, on_delete=models.CASCADE, related_name="demo_classes")

    scheduled_at = models.DateTimeField(db_index=True)
    duration_minutes = models.PositiveSmallIntegerField(default=30)
    # Both are promised in advance, in the app, by the proposal. A demo class
    # with no topic is the complaint teachers have about every other agency.
    topic = models.CharField(max_length=180, blank=True, default="")
    grade = models.CharField(max_length=60, blank=True, default="")
    mode = models.CharField(max_length=12, choices=MODE_CHOICES, default="in_person")
    venue = models.CharField(max_length=240, blank=True, default="")
    meeting_link = models.URLField(max_length=400, blank=True, default="")
    panel = models.CharField(max_length=240, blank=True, default="")

    status = models.CharField(max_length=12, choices=STATUS_CHOICES, default=STATUS_SCHEDULED, db_index=True)
    # Filled in afterwards by whoever watched it.
    feedback = models.TextField(blank=True, default="")
    rating = models.PositiveSmallIntegerField(null=True, blank=True)
    recommended = models.BooleanField(null=True, blank=True)

    scheduled_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name="demo_classes_scheduled",
    )
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return f"Demo {self.scheduled_at:%d %b %H:%M} — {self.application_id}"

    class Meta:
        managed = True
        db_table = "demo_class"
        ordering = ("-scheduled_at",)


class Offer(models.Model):
    """The end of it. "Make an offer at the end of it" on the school's applicant
    card, and the row that turns a pipeline into a placement."""

    STATUS_CHOICES = (
        ("sent", "Sent"),
        ("accepted", "Accepted"),
        ("declined", "Declined"),
        ("withdrawn", "Withdrawn"),
    )

    id = PublicId(prefix="ofr")
    application = models.OneToOneField(Application, on_delete=models.CASCADE, related_name="offer")
    salary_lpa = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    joining_date = models.DateField(null=True, blank=True)
    terms = models.TextField(blank=True, default="")
    letter = models.FileField(upload_to="application/offers/", blank=True, null=True, max_length=500)

    status = models.CharField(max_length=12, choices=STATUS_CHOICES, default="sent", db_index=True)
    sent_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name="offers_sent",
    )
    sent_at = models.DateTimeField(default=timezone.now)
    responded_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        managed = True
        db_table = "offer"
        ordering = ("-sent_at",)
