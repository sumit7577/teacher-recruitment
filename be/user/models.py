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
import hmac
import secrets
from datetime import timedelta

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
    # Set when a code sent to `email` came back correct. Null means the address
    # is unproven — it may be a typo, or somebody else's. Password resets go
    # only to a proven address, which is the whole reason this column exists.
    email_verified_at = models.DateTimeField(null=True, blank=True)

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


class EmailCode(models.Model):
    """A six-digit code, emailed, good for ten minutes.

    This is the one-time password the brief asked for, carried by email instead
    of SMS. Sending a transactional SMS in India needs a DLT-registered sender
    and approved templates — weeks of paperwork in the client's name, which is
    why sign-in shipped on a password alone. Email needs none of that, works
    today, and leaves the user a written record they can search for.

    It is used for two things and will be used for more:

        `verify_email`    prove the address on an account is reachable
        `reset_password`  a forgotten password, without telephoning the office

    ## What is stored

    Only a SHA256 digest of the code. Six digits is a million possibilities,
    which is thin — so the protection is not the hash, it is `attempts` and
    `expires_at`. Five wrong guesses burns the code; ten minutes burns it
    anyway. A million-guess attack needs two hundred thousand codes to be
    issued, and `issue()` won't.

    ## The ordering trap

    `issue()` writes the row and *then* the caller sends the mail. Never the
    other way round. allcoaching had this inverted once — it deleted the old
    rows, made a network call that took a second, and wrote the new row after;
    anyone who typed the code quickly enough was told it was invalid, and the
    bug only reproduced on a fast typist. Write first, send second, always.
    """

    PURPOSE_VERIFY_EMAIL = "verify_email"
    PURPOSE_RESET_PASSWORD = "reset_password"
    PURPOSE_CHOICES = (
        (PURPOSE_VERIFY_EMAIL, "Verify an email address"),
        (PURPOSE_RESET_PASSWORD, "Reset a forgotten password"),
    )

    # Ten minutes is long enough to find the mail in a spam folder and short
    # enough that a code left open on a shared screen stops mattering.
    TTL_MINUTES = 10
    MAX_ATTEMPTS = 5
    # A new code cannot be asked for more often than this. Stops the endpoint
    # being used to post mail at somebody repeatedly, and stops a guesser from
    # minting the volume of codes a brute force would need.
    RESEND_AFTER_SECONDS = 60

    id = PublicId(prefix="otp")
    # Stored lowercased. The address is on the row rather than only on the user
    # because `verify_email` runs *before* the address is on the account — that
    # is the whole point of verifying it.
    email = models.EmailField(max_length=254, db_index=True)
    purpose = models.CharField(max_length=20, choices=PURPOSE_CHOICES, db_index=True)
    code_hash = models.CharField(max_length=64)
    # Null for a flow that has no account yet. `reset_password` always has one.
    user = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="email_codes", null=True, blank=True,
    )
    attempts = models.PositiveSmallIntegerField(default=0)
    created = models.DateTimeField(default=timezone.now, db_index=True)
    expires_at = models.DateTimeField(db_index=True)
    consumed_at = models.DateTimeField(null=True, blank=True)

    @staticmethod
    def _hash(raw: str) -> str:
        return hashlib.sha256((raw or "").strip().encode("utf-8")).hexdigest()

    @classmethod
    def issue(cls, email: str, purpose: str, user=None) -> tuple["EmailCode", str]:
        """Mint a code. Returns the row and the cleartext, which is never stored.

        Any unconsumed code for the same address and purpose is expired first —
        two live codes for one mailbox means the older mail still works, which
        is exactly the window a forwarded or leaked mail needs.
        """
        email = (email or "").strip().lower()
        now = timezone.now()

        cls.objects.filter(
            email=email, purpose=purpose, consumed_at__isnull=True, expires_at__gt=now,
        ).update(expires_at=now)

        # `secrets`, not `random` — this is a credential. zfill keeps it six
        # characters so "004271" is not read out as "4271".
        raw = str(secrets.randbelow(1_000_000)).zfill(6)
        row = cls.objects.create(
            email=email,
            purpose=purpose,
            user=user,
            code_hash=cls._hash(raw),
            expires_at=now + timedelta(minutes=cls.TTL_MINUTES),
        )
        return row, raw

    @classmethod
    def too_soon(cls, email: str, purpose: str) -> bool:
        """True when a code was issued for this address moments ago."""
        cutoff = timezone.now() - timedelta(seconds=cls.RESEND_AFTER_SECONDS)
        return cls.objects.filter(
            email=(email or "").strip().lower(), purpose=purpose, created__gt=cutoff,
        ).exists()

    @classmethod
    def verify(cls, email: str, purpose: str, code: str) -> tuple["EmailCode | None", str]:
        """Verify and consume. Returns `(row, "")` or `(None, reason)`.

        NOT named `check`: that is Django's own classmethod on every Model (the
        system-check hook), and shadowing it makes `manage.py check` call this
        with `app_configs=` and `databases=` and blow up.

        The reason is written to be shown to the user as-is: "that code has
        expired" and "that code is not right" are different problems with
        different next steps, and collapsing them into one message sends people
        to re-read a mail that was never going to work.

        A failed attempt increments the counter on the row it failed against,
        so five guesses burn that code rather than merely being slow.
        """
        email = (email or "").strip().lower()
        now = timezone.now()

        row = (
            cls.objects.filter(email=email, purpose=purpose, consumed_at__isnull=True)
            .order_by("-created")
            .first()
        )
        if row is None:
            return None, "Ask for a new code — this one has already been used."
        if row.expires_at <= now:
            return None, "That code has expired. Ask for a new one."
        if row.attempts >= cls.MAX_ATTEMPTS:
            return None, "Too many wrong tries. Ask for a new code."

        # compare_digest over a plain == so a wrong code cannot be narrowed down
        # by how long the comparison took.
        if not hmac.compare_digest(row.code_hash, cls._hash(code)):
            cls.objects.filter(pk=row.pk).update(attempts=models.F("attempts") + 1)
            left = cls.MAX_ATTEMPTS - (row.attempts + 1)
            if left <= 0:
                return None, "Too many wrong tries. Ask for a new code."
            return None, f"That code is not right. {left} tries left."

        row.consumed_at = now
        row.save(update_fields=["consumed_at"])
        return row, ""

    def __str__(self) -> str:
        return f"{self.purpose} → {self.email}"

    class Meta:
        managed = True
        db_table = "email_code"
        ordering = ("-created",)
        indexes = [models.Index(fields=["email", "purpose", "consumed_at"])]
