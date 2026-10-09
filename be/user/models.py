"""Identity — one `User` row, three roles.

A teacher, a school's contact person and the firm's own staff all sign in
through the same door, and the proposal is explicit about it: "One door, two
sides of the same hire." So there is one User table and **the role is the
presence of a role profile**, exactly as allcoaching does it:

    hasattr(user, "teacher_profile")  → a teacher
    hasattr(user, "school_profile")   → an institution
    user.is_staff_member              → the firm's office

Why not a `role` column: a column has to be kept in step with the profile row
by hand, and the day they disagree the app shows a teacher a school's
workspace. The profile IS the role, so they cannot disagree. (Staff is the one
exception — the firm's own people have no profile to hang off, so they get a
flag — and it is deliberately not something a signup can set.)

A single person CAN hold two roles. A school's director who is also looking for
a job is not a data error, and the sign-in switch picks which workspace to open.
"""

import hashlib
import secrets

from django.db import models
from django.utils import timezone

from app.public_id import PublicId
from app.uploads import upload_to, validate_image


class User(models.Model):
    id = PublicId(prefix="usr")
    name = models.CharField(max_length=150, blank=True, default="")
    # Unique when present, absent for the many teachers who have a phone and no
    # email. `null=True` rather than `default=""`: unique treats every empty
    # string as a collision, so the second email-less teacher could not sign up.
    email = models.EmailField(unique=True, max_length=254, blank=True, null=True)
    # The login. Bare 10 digits for an Indian mobile — the OTP gateway, the DLT
    # template and every row already written assume it.
    phone = models.CharField(unique=True, max_length=20, db_index=True)
    # pbkdf2, via django.contrib.auth.hashers. Empty for an account that has
    # only ever signed in with a one-time code, which is most of them.
    password = models.CharField(max_length=255, blank=True, default="")
    # Google's stable subject id from the ID token (`sub`), NEVER the email.
    # The email column holds whatever someone typed; `sub` is written only
    # after a verified Google token. Null = no Google sign-in for this account.
    google_sub = models.CharField(max_length=64, unique=True, blank=True, null=True)

    city = models.CharField(max_length=80, blank=True, default="", db_index=True)
    state = models.CharField(max_length=80, blank=True, default="")
    image = models.ImageField(
        upload_to=upload_to("user", "avatar"),
        validators=[validate_image],
        blank=True, null=True, max_length=500,
    )

    # The firm's own office staff — the only people the admin panel lets in.
    # Set from the Django admin or a management command, never from a signup
    # payload: an API that can grant this is an API that can hand over the
    # panel.
    is_staff_member = models.BooleanField(default=False, db_index=True)
    is_active = models.BooleanField(default=True)

    date_joined = models.DateTimeField(default=timezone.now)
    date_updated = models.DateTimeField(auto_now=True)
    last_login_at = models.DateTimeField(null=True, blank=True)

    @property
    def is_authenticated(self) -> bool:
        """Always True — DRF permission checks ask for this, and an
        unauthenticated request never gets a User instance at all."""
        return True

    @property
    def is_anonymous(self) -> bool:
        return False

    def set_password(self, raw: str) -> None:
        from django.contrib.auth.hashers import make_password

        self.password = make_password(raw)

    def check_password(self, raw: str) -> bool:
        from django.contrib.auth.hashers import check_password

        if not self.password or not raw:
            return False
        return check_password(raw, self.password)

    @property
    def has_password(self) -> bool:
        return bool(self.password)

    @property
    def roles(self) -> list:
        """Every workspace this account can open. The sign-in response carries
        it so the client knows whether to show the switch at all."""
        found = []
        if hasattr(self, "teacher_profile"):
            found.append("teacher")
        if hasattr(self, "school_profile"):
            found.append("school")
        if self.is_staff_member:
            found.append("staff")
        return found

    def __str__(self) -> str:
        return f"{self.name or 'unnamed'} ({self.phone})"

    class Meta:
        managed = True
        db_table = "user"
        ordering = ("-date_joined",)


class AuthToken(models.Model):
    """A session, stored as a SHA256 digest.

    The cleartext token is shown to the client once at `issue()` and never
    persisted, so a database leak compromises no session. SHA256 rather than
    bcrypt because the cleartext already carries 256 bits of entropy from
    `secrets.token_urlsafe(32)` — there is nothing for a KDF to stretch.

    Not a OneToOne. allcoaching's is, which means signing in on a phone silently
    signs you out on the laptop — tolerable for an educator dashboard, wrong
    here where the whole point of the app is that a teacher uses it alongside
    the website. `device` is free text so a teacher can see and revoke them.
    """

    id = PublicId(prefix="tok")
    key_hash = models.CharField(max_length=64, unique=True, db_index=True)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="tokens")
    # Which workspace this token was issued for. A teacher token must not open
    # the panel even if the same person is also staff — the audience is decided
    # at sign-in, and re-checked on every request by the permission class.
    ROLE_CHOICES = (("teacher", "Teacher"), ("school", "School"), ("staff", "Staff"))
    role = models.CharField(max_length=16, choices=ROLE_CHOICES, db_index=True)
    device = models.CharField(max_length=120, blank=True, default="")
    created = models.DateTimeField(default=timezone.now)
    last_used_at = models.DateTimeField(null=True, blank=True)

    @staticmethod
    def _hash(raw: str) -> str:
        return hashlib.sha256((raw or "").encode("utf-8")).hexdigest()

    @classmethod
    def issue(cls, user, role: str, device: str = "") -> "tuple[AuthToken, str]":
        """Returns (record, cleartext). The cleartext MUST go straight into the
        response and must never be logged or stored."""
        raw = secrets.token_urlsafe(32)
        record = cls.objects.create(
            user=user, role=role, device=device[:120], key_hash=cls._hash(raw)
        )
        return record, raw

    @classmethod
    def lookup(cls, raw: str) -> "AuthToken | None":
        if not raw:
            return None
        return cls.objects.select_related("user").filter(key_hash=cls._hash(raw)).first()

    class Meta:
        managed = True
        db_table = "auth_token"
        ordering = ("-created",)


class Otp(models.Model):
    """A one-time code, scoped to the audience that asked for it.

    `kind` exists so a teacher signing into the app and the same person opening
    the school workspace on a laptop do not overwrite each other's code. The
    verify lookup matches on (phone, otp, kind) — allcoaching learned this one
    by having an educator's code silently delete an in-flight student code on
    the same number.
    """

    KIND_CHOICES = (
        ("teacher", "Teacher"),
        ("school", "School"),
        ("staff", "Staff"),
        ("contact", "Verifying a new number on an existing account"),
    )

    id = PublicId(prefix="otp")
    phone = models.CharField(max_length=20, db_index=True)
    otp = models.CharField(max_length=6)
    kind = models.CharField(max_length=16, choices=KIND_CHOICES, default="teacher", db_index=True)
    # Brute force protection. Five wrong guesses and this row is dead; asking
    # for a new code replaces it, which is the only way forward.
    attempts = models.PositiveSmallIntegerField(default=0)
    created = models.DateTimeField(default=timezone.now)

    MAX_ATTEMPTS = 5

    @property
    def is_expired(self) -> bool:
        from django.conf import settings

        ttl = int(getattr(settings, "OTP_TTL_SECONDS", 600))
        return (timezone.now() - self.created).total_seconds() > ttl

    def __str__(self) -> str:
        return f"{self.phone}/{self.kind}"

    class Meta:
        managed = True
        db_table = "otp"
        constraints = [
            models.UniqueConstraint(fields=["phone", "kind"], name="uq_otp_phone_kind"),
        ]
