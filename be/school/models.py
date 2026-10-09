"""The institution's side.

A school signs in, posts its own vacancies and reads applicants whose documents
the firm has already checked. What it CANNOT do is go live unchecked: the
proposal sells "Verifying an institution before its posts go live", and that
promise is what stops the board filling up with vacancies from someone who is
not a school at all.

So `status` on this model gates `Vacancy.publish()`, not the signup. A school
registers, posts immediately, and its first vacancy waits in the panel until
staff have seen the affiliation certificate. After that its posts go live
without a hop — the verification is of the institution, not of each post.
"""

from django.db import models
from django.utils import timezone

from app import taxonomy
from app.public_id import PublicId
from app.uploads import upload_to, validate_document, validate_image
from user.models import User


class School(models.Model):
    id = PublicId(prefix="sch")
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="school_profile")

    name = models.CharField(max_length=180, db_index=True)
    # The two or three letters on the vacancy card where there is no logo.
    # Derived on save from the name, overridable — "Nalanda Public School" gives
    # NPS, which is what the school itself would have written.
    initials = models.CharField(max_length=4, blank=True, default="")
    institution_type = models.CharField(
        max_length=20, choices=taxonomy.INSTITUTION_CHOICES, default="school", db_index=True,
    )
    board = models.CharField(max_length=20, choices=taxonomy.BOARD_CHOICES, blank=True, default="")

    city = models.CharField(max_length=80, db_index=True)
    state = models.CharField(max_length=80, blank=True, default="")
    locality = models.CharField(max_length=120, blank=True, default="")
    address = models.TextField(blank=True, default="")
    pincode = models.CharField(max_length=10, blank=True, default="")

    contact_person = models.CharField(max_length=140, blank=True, default="")
    designation = models.CharField(max_length=100, blank=True, default="")
    # The school's own switchboard, which is not the login number. A principal
    # signs in on their mobile and wants the office line printed on the vacancy.
    office_phone = models.CharField(max_length=20, blank=True, default="")
    office_email = models.EmailField(max_length=254, blank=True, default="")
    website = models.URLField(max_length=300, blank=True, default="")

    logo = models.ImageField(
        upload_to=upload_to("school", "logo"), validators=[validate_image],
        blank=True, null=True, max_length=500,
    )
    about = models.TextField(blank=True, default="")
    established_year = models.PositiveSmallIntegerField(null=True, blank=True)
    student_count = models.PositiveIntegerField(null=True, blank=True)
    staff_count = models.PositiveIntegerField(null=True, blank=True)

    # ── verification ───────────────────────────────────────────────────────
    status = models.CharField(
        max_length=12, choices=taxonomy.VERIFICATION_CHOICES,
        default=taxonomy.VERIFICATION_PENDING, db_index=True,
    )
    affiliation_certificate = models.FileField(
        upload_to=upload_to("school", "affiliation"), validators=[validate_document],
        blank=True, null=True, max_length=500,
    )
    verified_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name="schools_verified",
    )
    verified_at = models.DateTimeField(null=True, blank=True)
    rejection_reason = models.CharField(max_length=300, blank=True, default="")

    # Which of the firm's staff looks after this account.
    consultant = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name="schools_managed",
    )
    internal_note = models.TextField(blank=True, default="")

    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    @property
    def is_verified(self) -> bool:
        return self.status == taxonomy.VERIFICATION_VERIFIED

    @property
    def outstanding(self) -> list:
        """What the school still owes us — the banner on its dashboard, which
        the proposal describes as "their affiliation certificate is still
        outstanding". A list rather than a boolean so the banner can name it."""
        missing = []
        if not self.affiliation_certificate:
            missing.append("affiliation certificate")
        if not self.contact_person:
            missing.append("contact person")
        if not self.office_phone:
            missing.append("office phone number")
        return missing

    @staticmethod
    def derive_initials(name: str) -> str:
        """NPS from "Nalanda Public School"; LS from "Little Scholars".

        Words like "of" and "the" are dropped — "Institute of Technology" is IT,
        not IOT. Capped at 4 because the card has room for 4 and a 7-letter
        monogram reads as a mistake.
        """
        skip = {"of", "the", "and", "for", "in", "at", "a", "an"}
        words = [w for w in str(name or "").split() if w.strip(".,").lower() not in skip]
        letters = "".join(w[0] for w in words if w[:1].isalpha())
        return letters.upper()[:4]

    def mark(self, status: str, by=None, reason: str = "") -> None:
        self.status = status
        self.rejection_reason = reason[:300] if status == taxonomy.VERIFICATION_REJECTED else ""
        self.verified_by = by
        self.verified_at = timezone.now() if status != taxonomy.VERIFICATION_PENDING else None
        self.save(update_fields=["status", "rejection_reason", "verified_by", "verified_at"])

    def save(self, *args, **kwargs):
        if not self.initials:
            self.initials = self.derive_initials(self.name)
        super().save(*args, **kwargs)

    def __str__(self) -> str:
        return self.name

    class Meta:
        managed = True
        db_table = "school"
        ordering = ("-created_at",)
