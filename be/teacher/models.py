"""The teacher's side — one profile, one CV, every certificate.

The proposal's promise is "One profile — CV, degree, B.Ed, CTET, experience
letters" and "Apply in one tap; everything goes with it". That only works if the
documents live on the TEACHER and not on the application: a teacher who applies
to four posts uploads their B.Ed certificate once, and the firm verifies it once.

So `TeacherDocument.status` is the single truth about whether a certificate has
been checked, and an application reads it. Putting a verification row on the
application instead would mean the same certificate sitting at "verified" for
one school and "pending" for the next, and staff doing the work four times.
"""

from django.db import models
from django.utils import timezone

from app import taxonomy
from app.public_id import PublicId
from app.uploads import upload_to, validate_document
from user.models import User


class TeacherProfile(models.Model):
    """The role profile that makes a `User` a teacher.

    `post`, `subjects`, `qualifications` and `city` are not optional extras —
    they are, in the proposal's words, "the four things that decide which
    vacancies they will ever see". Signup asks for them and the matching query
    reads nothing else.
    """

    id = PublicId(prefix="tch")
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="teacher_profile")

    post = models.CharField(max_length=20, choices=taxonomy.POST_CHOICES, db_index=True)
    # Free text rather than a lookup table, deliberately. A school writes
    # "Physics", "Physical Science" and "Science (Physics)" for the same
    # vacancy, and a fixed list means staff either mangle the post or ask for a
    # new row. Normalised on save and matched case-insensitively; the panel
    # exposes the distinct values so the website's filter stays a real list.
    subjects = models.JSONField(default=list, blank=True)
    qualifications = models.JSONField(default=list, blank=True)
    highest_qualification = models.CharField(max_length=120, blank=True, default="")

    experience_band = models.CharField(
        max_length=10, choices=taxonomy.EXPERIENCE_CHOICES,
        default=taxonomy.EXPERIENCE_FRESHER, db_index=True,
    )
    experience_years = models.DecimalField(max_digits=4, decimal_places=1, default=0)

    city = models.CharField(max_length=80, blank=True, default="", db_index=True)
    state = models.CharField(max_length=80, blank=True, default="")
    preferred_cities = models.JSONField(default=list, blank=True)
    willing_to_relocate = models.BooleanField(default=False)

    expected_salary_lpa = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    available_from = models.DateField(null=True, blank=True)
    notice_period_days = models.PositiveSmallIntegerField(null=True, blank=True)

    headline = models.CharField(max_length=160, blank=True, default="")
    about = models.TextField(blank=True, default="")
    languages = models.JSONField(default=list, blank=True)

    cv = models.FileField(
        upload_to=upload_to("teacher", "cv"), validators=[validate_document],
        blank=True, null=True, max_length=500,
    )

    # Set by the firm, not by the teacher. "Verified" on a teacher means staff
    # have seen the originals — it is the thing a school is paying for, so it is
    # never something a signup form can claim.
    verification = models.CharField(
        max_length=12, choices=taxonomy.VERIFICATION_CHOICES,
        default=taxonomy.VERIFICATION_PENDING, db_index=True,
    )
    police_verified = models.BooleanField(default=False)
    # The office's own notes about a candidate. Never serialised to a teacher or
    # a school — see TeacherProfileReadSerializer.
    internal_note = models.TextField(blank=True, default="")

    # Whether this teacher wants to appear to schools at all. A teacher who has
    # found a job should be able to go quiet without deleting their account.
    is_open_to_work = models.BooleanField(default=True, db_index=True)

    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    # The dashboard shows "Ninety percent done, one reference to go", so the
    # number has to mean something. These are the fields that decide whether an
    # application is worth sending to a school.
    COMPLETENESS_FIELDS = (
        "post", "subjects", "qualifications", "city",
        "experience_band", "headline", "about", "cv",
    )

    @property
    def completeness(self) -> int:
        """Percent complete, 0–100. Documents count as one field of the set:
        a teacher with a CV and no certificates is further along than one with
        neither, but not finished."""
        total = len(self.COMPLETENESS_FIELDS) + 1
        done = 0
        for field in self.COMPLETENESS_FIELDS:
            value = getattr(self, field, None)
            if isinstance(value, list):
                done += 1 if value else 0
            elif value:
                done += 1
        if self.pk and self.documents.exists():
            done += 1
        return int(round(done * 100 / total))

    @property
    def missing_documents(self) -> list:
        """Which of the required documents are not uploaded yet — the teacher
        dashboard's "one reference to go" line."""
        if not self.pk:
            return list(taxonomy.REQUIRED_DOCUMENTS)
        held = set(self.documents.values_list("kind", flat=True))
        return [kind for kind in taxonomy.REQUIRED_DOCUMENTS if kind not in held]

    def save(self, *args, **kwargs):
        # Subjects are matched case-insensitively against a vacancy's subject,
        # so they are stored trimmed and title-cased once here rather than
        # lowered at every read site.
        if isinstance(self.subjects, list):
            seen = {}
            for subject in self.subjects:
                cleaned = str(subject or "").strip()
                if cleaned:
                    seen.setdefault(cleaned.lower(), cleaned)
            self.subjects = list(seen.values())
        if self.experience_years is not None:
            self.experience_band = taxonomy.experience_band(self.experience_years)
        super().save(*args, **kwargs)

    def __str__(self) -> str:
        return f"{self.user.name or self.user.phone} — {self.get_post_display()}"

    class Meta:
        managed = True
        db_table = "teacher_profile"
        ordering = ("-created_at",)


class TeacherDocument(models.Model):
    """One certificate, and who checked it.

    `verified_by` and `verified_at` are the audit trail the panel shows — the
    proposal promises "with who verified them", and a verification nobody signed
    is one nobody can be asked about.
    """

    id = PublicId(prefix="doc")
    teacher = models.ForeignKey(TeacherProfile, on_delete=models.CASCADE, related_name="documents")
    kind = models.CharField(max_length=24, choices=taxonomy.DOCUMENT_CHOICES, db_index=True)
    title = models.CharField(max_length=160, blank=True, default="")
    file = models.FileField(
        upload_to=upload_to("teacher", "documents"), validators=[validate_document], max_length=500,
    )

    status = models.CharField(
        max_length=12, choices=taxonomy.VERIFICATION_CHOICES,
        default=taxonomy.VERIFICATION_PENDING, db_index=True,
    )
    verified_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name="documents_verified",
    )
    verified_at = models.DateTimeField(null=True, blank=True)
    # Why it was rejected. Shown to the teacher — a rejection they cannot act on
    # is a support call.
    note = models.CharField(max_length=300, blank=True, default="")

    uploaded_at = models.DateTimeField(default=timezone.now)

    def mark(self, status: str, by=None, note: str = "") -> None:
        self.status = status
        self.note = note[:300]
        self.verified_by = by
        self.verified_at = timezone.now() if status != taxonomy.VERIFICATION_PENDING else None
        self.save(update_fields=["status", "note", "verified_by", "verified_at"])

    def __str__(self) -> str:
        return f"{self.get_kind_display()} — {self.status}"

    class Meta:
        managed = True
        db_table = "teacher_document"
        ordering = ("kind", "-uploaded_at")
        constraints = [
            # One live document per kind. A teacher re-uploading their B.Ed
            # certificate replaces it rather than leaving staff to guess which
            # of three is current — "other" is exempt because it is the
            # catch-all and genuinely repeats.
            models.UniqueConstraint(
                fields=["teacher", "kind"],
                condition=~models.Q(kind="other"),
                name="uq_teacher_document_kind",
            ),
        ]


class TeacherExperience(models.Model):
    """Where they have taught. Read by a school on the applicant card, and by
    staff when they check an experience letter against what was claimed."""

    id = PublicId(prefix="exp")
    teacher = models.ForeignKey(TeacherProfile, on_delete=models.CASCADE, related_name="experience")
    institution = models.CharField(max_length=160)
    post = models.CharField(max_length=20, choices=taxonomy.POST_CHOICES, blank=True, default="")
    subject = models.CharField(max_length=80, blank=True, default="")
    city = models.CharField(max_length=80, blank=True, default="")
    board = models.CharField(max_length=20, choices=taxonomy.BOARD_CHOICES, blank=True, default="")
    started_on = models.DateField(null=True, blank=True)
    ended_on = models.DateField(null=True, blank=True)
    is_current = models.BooleanField(default=False)
    salary_lpa = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)

    def __str__(self) -> str:
        return f"{self.institution} ({self.subject or self.post})"

    class Meta:
        managed = True
        db_table = "teacher_experience"
        ordering = ("-is_current", "-started_on")
