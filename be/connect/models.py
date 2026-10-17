"""Mutual interest, and the conversation it unlocks.

Sections 9 and 12 of the brief are one feature wearing two names. "Chat access
is enabled after acceptance" is the whole design: nobody can message anybody
until both sides have agreed, which is what stops a teacher-recruitment
platform turning into a place where strangers message schoolchildren.

    Interest   one side taps the heart. pending → accepted | rejected
    Thread     exists only for an accepted Interest
    Message    text, inside a Thread
    Block      "never show me this person again"
    Report     "somebody should look at this person"

## Why `Interest` points at users and not at profiles

Three pairings are in the brief — teacher↔school, teacher↔coaching,
teacher↔student/parent — and a generic (from_user, to_user) covers all of them
with one table and one permission rule. The alternative is three near-identical
models and three copies of the accept logic, which is three places for the
consent check to be forgotten in two of them.

`context` records what was being looked at when the heart was tapped (a
vacancy, a tuition requirement), because "interested in what?" is the first
thing the recipient asks.

## The rule that is enforced in one place

`Interest.may_open(sender, recipient)` is the only function that decides
whether a heart may be sent. Blocks, consent, hidden profiles and
self-interest are all checked there and nowhere else. Every view calls it.
"""

from django.db import models
from django.utils import timezone

from app.public_id import PublicId
from user.models import User


class Block(models.Model):
    """"I do not want to hear from this person."

    Enforced in `Interest.may_open` and in every list a user is shown. A block
    is one-directional in intent but two-directional in effect: if either party
    has blocked the other, nothing passes between them. A blocker who still
    appeared in the blocked person's search results would be a block that only
    half worked.
    """

    id = PublicId(prefix="blk")
    by = models.ForeignKey(User, on_delete=models.CASCADE, related_name="blocks_made")
    target = models.ForeignKey(User, on_delete=models.CASCADE, related_name="blocks_received")
    reason = models.CharField(max_length=300, blank=True, default="")
    created_at = models.DateTimeField(default=timezone.now)

    @staticmethod
    def between(a_id, b_id) -> bool:
        """True if either has blocked the other."""
        return Block.objects.filter(
            models.Q(by_id=a_id, target_id=b_id) | models.Q(by_id=b_id, target_id=a_id)
        ).exists()

    class Meta:
        managed = True
        db_table = "connect_block"
        ordering = ("-created_at",)
        constraints = [
            models.UniqueConstraint(fields=["by", "target"], name="uniq_block_pair"),
        ]


class Report(models.Model):
    """"Somebody should look at this."

    Goes to the office panel. Deliberately not automated: a report does not
    hide anyone by itself, because an automatic hide is a button for silencing
    a rival. A staff member reads it and acts.
    """

    REASON_CHOICES = (
        ("fake", "Fake or impersonating"),
        ("abusive", "Abusive messages"),
        ("spam", "Spam or advertising"),
        ("money", "Asking for money"),
        ("inappropriate", "Inappropriate for a minor"),
        ("other", "Something else"),
    )
    STATUS_CHOICES = (
        ("open", "Open"),
        ("reviewing", "Being looked at"),
        ("actioned", "Acted on"),
        ("dismissed", "Dismissed"),
    )

    id = PublicId(prefix="rep")
    by = models.ForeignKey(User, on_delete=models.CASCADE, related_name="reports_made")
    target = models.ForeignKey(User, on_delete=models.CASCADE, related_name="reports_received")
    reason = models.CharField(max_length=16, choices=REASON_CHOICES)
    detail = models.TextField(blank=True, default="")
    status = models.CharField(max_length=12, choices=STATUS_CHOICES, default="open", db_index=True)
    handled_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name="reports_handled",
    )
    handled_at = models.DateTimeField(null=True, blank=True)
    internal_note = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(default=timezone.now, db_index=True)

    def __str__(self) -> str:
        return f"{self.get_reason_display()} → {self.target_id}"

    class Meta:
        managed = True
        db_table = "connect_report"
        ordering = ("-created_at",)


class Interest(models.Model):
    """One tap of the heart, and its answer."""

    STATUS_PENDING = "pending"
    STATUS_ACCEPTED = "accepted"
    STATUS_REJECTED = "rejected"
    STATUS_WITHDRAWN = "withdrawn"
    STATUS_CHOICES = (
        (STATUS_PENDING, "Waiting"),
        (STATUS_ACCEPTED, "Accepted"),
        (STATUS_REJECTED, "Declined"),
        (STATUS_WITHDRAWN, "Withdrawn"),
    )

    CONTEXT_CHOICES = (
        ("profile", "A profile"),
        ("vacancy", "A vacancy"),
        ("tuition", "A tuition requirement"),
    )

    id = PublicId(prefix="int")
    sender = models.ForeignKey(User, on_delete=models.CASCADE, related_name="interests_sent")
    recipient = models.ForeignKey(User, on_delete=models.CASCADE, related_name="interests_received")

    context = models.CharField(max_length=10, choices=CONTEXT_CHOICES, default="profile")
    # Which vacancy or requirement, when there is one. A plain id rather than
    # three nullable foreign keys: this is a label for the recipient's benefit,
    # not something joined on, and three FKs would be three more columns that
    # are null on almost every row.
    context_id = models.CharField(max_length=40, blank=True, default="")
    message = models.CharField(max_length=300, blank=True, default="")

    status = models.CharField(
        max_length=10, choices=STATUS_CHOICES, default=STATUS_PENDING, db_index=True,
    )
    responded_at = models.DateTimeField(null=True, blank=True)
    seen_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now, db_index=True)

    # ── the one gate ────────────────────────────────────────────────────

    @staticmethod
    def may_open(sender: User, recipient: User) -> tuple[bool, str]:
        """Whether `sender` may send `recipient` an interest.

        Every check that protects a person lives here, so there is one place to
        read and one place to change. A view that writes its own version of
        this is the bug.
        """
        if sender.pk == recipient.pk:
            return False, "You cannot send yourself an interest."
        if not recipient.is_active:
            return False, "That account is no longer active."
        if Block.between(sender.pk, recipient.pk):
            # Deliberately vague. "They have blocked you" tells a blocked
            # person they were blocked, which is information the blocker did
            # not agree to share.
            return False, "You cannot contact this person."

        # A minor whose guardian has not consented is not contactable by
        # anyone, through any route. The profile queryset hides them from
        # search; this is the same rule at the only other door.
        profile = getattr(recipient, "student_profile", None)
        if profile is not None and not profile.is_contactable:
            return False, "That profile is not accepting messages."

        return True, ""

    def accept(self) -> "Thread":
        """Say yes, and open the conversation.

        Creating the thread here rather than letting a later request do it is
        what makes "chat requires an accepted interest" structurally true: a
        `Thread` has no other way to come into existence.
        """
        if self.status != self.STATUS_ACCEPTED:
            self.status = self.STATUS_ACCEPTED
            self.responded_at = timezone.now()
            self.save(update_fields=["status", "responded_at"])
        thread, _ = Thread.objects.get_or_create(interest=self)
        return thread

    def reject(self) -> None:
        if self.status == self.STATUS_PENDING:
            self.status = self.STATUS_REJECTED
            self.responded_at = timezone.now()
            self.save(update_fields=["status", "responded_at"])

    def __str__(self) -> str:
        return f"{self.sender_id} → {self.recipient_id} ({self.status})"

    class Meta:
        managed = True
        db_table = "connect_interest"
        ordering = ("-created_at",)
        indexes = [
            models.Index(fields=["recipient", "status"]),
            models.Index(fields=["sender", "status"]),
        ]
        constraints = [
            # One live interest per pair per thing. Without this, a heart
            # tapped twice is two rows in the recipient's list, and a tap-
            # untap-tap is three.
            models.UniqueConstraint(
                fields=["sender", "recipient", "context", "context_id"],
                name="uniq_interest_pair_context",
            ),
        ]


class Thread(models.Model):
    """A conversation. Exists only because an interest was accepted.

    One-to-one with the interest, which is the enforcement: there is no
    `Thread.objects.create(a, b)` anywhere, so there is no route to a
    conversation that did not begin with both sides agreeing.
    """

    id = PublicId(prefix="thr")
    interest = models.OneToOneField(Interest, on_delete=models.CASCADE, related_name="thread")
    created_at = models.DateTimeField(default=timezone.now)
    last_message_at = models.DateTimeField(null=True, blank=True, db_index=True)
    # Either side can close it. The other can reopen by writing again — this is
    # a tidy-up, not a block, and Block is the thing for that.
    closed_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name="threads_closed",
    )

    @property
    def participants(self) -> tuple[int, int]:
        return self.interest.sender_id, self.interest.recipient_id

    def other_party(self, user_id):
        a, b = self.participants
        return b if user_id == a else a

    def includes(self, user_id) -> bool:
        return user_id in self.participants

    class Meta:
        managed = True
        db_table = "connect_thread"
        ordering = ("-last_message_at", "-created_at")


class Message(models.Model):
    """Text, inside a thread.

    Text only, and the brief agrees: "Image/document sharing, audio/video
    calling ... require separate scope confirmation." An attachment field left
    here unused would be an invitation to wire it up without that conversation.
    """

    id = PublicId(prefix="msg")
    thread = models.ForeignKey(Thread, on_delete=models.CASCADE, related_name="messages")
    sender = models.ForeignKey(User, on_delete=models.CASCADE, related_name="messages_sent")
    body = models.TextField(max_length=4000)
    read_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now, db_index=True)

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        # Denormalised onto the thread so the inbox can sort without a join to
        # the newest message of every conversation.
        Thread.objects.filter(pk=self.thread_id).update(last_message_at=self.created_at)

    class Meta:
        managed = True
        db_table = "connect_message"
        ordering = ("created_at",)
        indexes = [models.Index(fields=["thread", "created_at"])]
