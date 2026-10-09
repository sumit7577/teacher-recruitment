"""Who gets told, and how.

Every send goes through `deliver()`, which does two things in this order:

 1. writes a `Notification` row for each recipient — the app's inbox, and the
    record;
 2. pushes to their devices.

The order is the point. A push that fails must not mean the teacher never learns
their demo class was scheduled: the inbox is the truth, and the push is a tap on
the shoulder. Doing it the other way round — push, then write only on success —
is how a notification gets lost silently.
"""

import logging

from django.utils import timezone

from app import fcm
from notifications.models import Device, Notification, PushCampaign

log = logging.getLogger(__name__)


def deliver(users, kind: str, title: str, body: str, data: dict | None = None) -> dict:
    """Inbox row + push, for each user. Returns {"users", "sent", "failed"}."""
    users = [u for u in users if u is not None]
    if not users:
        return {"users": 0, "sent": 0, "failed": 0}

    Notification.objects.bulk_create([
        Notification(user=user, kind=kind, title=title, body=body, data=data or {})
        for user in users
    ])

    tokens = list(
        Device.objects.filter(user__in=users, is_active=True).values_list("token", flat=True)
    )
    result = fcm.send(tokens, title=title, body=body, data=data or {})
    if result["invalid"]:
        # The app was uninstalled or the token was reissued. Deactivated rather
        # than deleted so a reinstall on the same handset is visible in support.
        Device.objects.filter(token__in=result["invalid"]).update(is_active=False)
    return {"users": len(users), "sent": result["sent"], "failed": result["failed"]}


def notify_matching_teachers(vacancy, by=None) -> int:
    """"Send a push notification to matching teachers in the same action."

    Reuses `Vacancy.objects.matching()` in reverse: rather than a second
    hand-written match that would drift from the app's own first screen, this
    walks open teachers and asks the queryset whether it would have shown them
    this vacancy. At launch volumes (hundreds of teachers) that is one query per
    teacher and runs in well under a second; past a few thousand it wants
    inverting into a single query, and `campaign.recipients` is the number that
    will say when.
    """
    from teacher.models import TeacherProfile
    from vacancy.models import Vacancy

    campaign = PushCampaign.objects.create(
        title=f"New {vacancy.get_post_display()} vacancy",
        body=f"{vacancy.title} at {vacancy.institution_name}, {vacancy.city}",
        audience="vacancy_match",
        vacancy=vacancy,
        deep_link={"screen": "vacancy", "id": vacancy.id},
        status="sending",
        sent_by=by,
    )

    recipients = []
    candidates = (
        TeacherProfile.objects.filter(is_open_to_work=True, post=vacancy.post)
        .select_related("user")
    )
    for teacher in candidates.iterator():
        if Vacancy.objects.matching(teacher).filter(pk=vacancy.pk).exists():
            recipients.append(teacher.user)

    result = deliver(
        recipients,
        kind="vacancy",
        title=campaign.title,
        body=campaign.body,
        data=campaign.deep_link,
    )
    PushCampaign.objects.filter(pk=campaign.pk).update(
        status="sent",
        recipients=result["users"],
        delivered=result["sent"],
        failed=result["failed"],
        sent_at=timezone.now(),
    )
    return result["users"]


def campaign_audience(campaign):
    """Resolve a panel campaign's filter to a list of users, at send time.

    At send time and not at create time: "everyone teaching Physics" should mean
    whoever that is on the day it goes out, which is what the person clicking
    Send intends.
    """
    from school.models import School
    from teacher.models import TeacherProfile
    from vacancy.models import Vacancy

    filters = campaign.filters or {}

    if campaign.audience == "schools":
        return [s.user for s in School.objects.select_related("user")]

    if campaign.audience == "vacancy_match" and campaign.vacancy_id:
        return [
            t.user
            for t in TeacherProfile.objects.filter(
                is_open_to_work=True, post=campaign.vacancy.post
            ).select_related("user")
            if Vacancy.objects.matching(t).filter(pk=campaign.vacancy_id).exists()
        ]

    teachers = TeacherProfile.objects.filter(is_open_to_work=True).select_related("user")
    if campaign.audience == "post" and filters.get("post"):
        teachers = teachers.filter(post=filters["post"])
    elif campaign.audience == "subject" and filters.get("subject"):
        teachers = teachers.filter(subjects__icontains=filters["subject"])
    elif campaign.audience == "city" and filters.get("city"):
        teachers = teachers.filter(city__iexact=filters["city"])
    return [t.user for t in teachers]


def send_campaign(campaign, by=None) -> dict:
    PushCampaign.objects.filter(pk=campaign.pk).update(status="sending")
    try:
        users = campaign_audience(campaign)
        result = deliver(
            users,
            kind="broadcast",
            title=campaign.title,
            body=campaign.body,
            data=campaign.deep_link or {},
        )
    except Exception as exc:  # pragma: no cover
        log.exception("campaign %s failed", campaign.pk)
        PushCampaign.objects.filter(pk=campaign.pk).update(status="failed", error=str(exc)[:300])
        raise
    PushCampaign.objects.filter(pk=campaign.pk).update(
        status="sent",
        recipients=result["users"],
        delivered=result["sent"],
        failed=result["failed"],
        sent_by=by or campaign.sent_by,
        sent_at=timezone.now(),
    )
    return result
