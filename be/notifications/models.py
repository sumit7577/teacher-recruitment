"""Push, and the inbox behind it.

"The website brings a teacher once. The app is what brings them back — a
notification the moment a vacancy in their subject opens, and the demo-class date
the moment it is fixed."

Three tables, and the split matters:

* `Device` — where to send. One row per installed app, not per user: a teacher
  with a phone and a tablet gets both, and an uninstall kills one without
  silencing the other.
* `Notification` — what the teacher sees in the app's Notifications tab. Written
  even when the push itself fails, because a dropped push must not mean the
  teacher never learns their demo class was scheduled. The inbox is the record;
  the push is a tap on the shoulder.
* `PushCampaign` — the panel's "send to everyone, or to one subject" sender, and
  what it reached. Kept so the client can see that the 400 they sent on Tuesday
  actually delivered to 380.
"""

from django.db import models
from django.utils import timezone

from app import taxonomy
from app.public_id import PublicId
from user.models import User


class Device(models.Model):
    PLATFORM_CHOICES = (("android", "Android"), ("ios", "iOS"), ("web", "Web"))

    id = PublicId(prefix="dev")
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="devices")
    # FCM registration token. Unique — the same token must never sit on two
    # users, which happens when a phone is handed over and someone else signs
    # in. The sign-in handler reassigns it rather than creating a second row,
    # or the previous owner keeps getting the new owner's notifications.
    token = models.CharField(max_length=255, unique=True)
    platform = models.CharField(max_length=10, choices=PLATFORM_CHOICES, default="android")
    app_version = models.CharField(max_length=20, blank=True, default="")
    is_active = models.BooleanField(default=True, db_index=True)
    created_at = models.DateTimeField(default=timezone.now)
    last_seen_at = models.DateTimeField(default=timezone.now)

    class Meta:
        managed = True
        db_table = "device"
        ordering = ("-last_seen_at",)


class Notification(models.Model):
    """One row per user per event — fan-out on write.

    Fan-out on write rather than on read because the audience is computed from a
    match (subject, post, city) that changes as teachers edit their profiles.
    Computed at read time, a teacher who changed their subject in March would
    retroactively lose every notification they were sent in February, and the
    "why did I get this" question would have no answer.
    """

    KIND_CHOICES = (
        ("vacancy", "A new matching vacancy"),
        ("application", "An application moved"),
        ("demo_class", "A demo class"),
        ("document", "A document was checked"),
        ("offer", "An offer"),
        ("broadcast", "From the office"),
        ("account", "Account"),
        # Sections 9 and 12 — a heart, and a chat message.
        ("interest", "An interest request"),
        ("message", "A new message"),
    )

    id = PublicId(prefix="ntf")
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="notifications")
    kind = models.CharField(max_length=16, choices=KIND_CHOICES, default="broadcast", db_index=True)
    title = models.CharField(max_length=160)
    body = models.TextField(blank=True, default="")
    # Where tapping it goes — {"screen": "vacancy", "id": "vac_..."}. The app and
    # the website both route on this, so it is a small, stable shape rather than
    # a URL that would differ between them.
    data = models.JSONField(default=dict, blank=True)
    read_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now, db_index=True)

    class Meta:
        managed = True
        db_table = "notification"
        ordering = ("-created_at",)
        indexes = [
            models.Index(fields=["user", "read_at"], name="idx_notification_unread"),
        ]


class PushCampaign(models.Model):
    """A send from the panel, and what it reached.

    `audience` is the filter, not the resolved list. Resolving at send time means
    "everyone teaching Physics" means whoever that is on the day it goes out,
    which is what the person clicking Send intends.
    """

    AUDIENCE_ALL = "all"
    AUDIENCE_CHOICES = (
        (AUDIENCE_ALL, "Every teacher"),
        ("post", "One post type"),
        ("subject", "One subject"),
        ("city", "One city"),
        ("vacancy_match", "Teachers matching one vacancy"),
        ("schools", "Every institution"),
    )
    STATUS_CHOICES = (
        ("draft", "Draft"),
        ("sending", "Sending"),
        ("sent", "Sent"),
        ("failed", "Failed"),
    )

    id = PublicId(prefix="psh")
    title = models.CharField(max_length=160)
    body = models.TextField(blank=True, default="")
    audience = models.CharField(max_length=16, choices=AUDIENCE_CHOICES, default=AUDIENCE_ALL)
    # {"post": "pgt"} / {"subject": "Physics"} / {"city": "Lucknow"}.
    filters = models.JSONField(default=dict, blank=True)
    vacancy = models.ForeignKey(
        "vacancy.Vacancy", on_delete=models.SET_NULL, null=True, blank=True, related_name="campaigns",
    )
    deep_link = models.JSONField(default=dict, blank=True)

    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default="draft", db_index=True)
    recipients = models.PositiveIntegerField(default=0)
    delivered = models.PositiveIntegerField(default=0)
    failed = models.PositiveIntegerField(default=0)
    error = models.CharField(max_length=300, blank=True, default="")

    sent_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name="campaigns_sent",
    )
    created_at = models.DateTimeField(default=timezone.now)
    sent_at = models.DateTimeField(null=True, blank=True)

    def __str__(self) -> str:
        return f"{self.title} → {self.get_audience_display()}"

    class Meta:
        managed = True
        db_table = "push_campaign"
        ordering = ("-created_at",)
