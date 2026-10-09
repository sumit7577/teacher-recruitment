"""Everything on the website that is words rather than data.

"This is the part that decides whether the site is still alive in six months.
Everything on the website and in the app is edited here, by your staff, without
calling a developer." That sentence is in the proposal, so the headline, the
four services, the five process steps, the team photographs, the testimonials
and the contact details are all rows — not strings in a React component.

`SiteSetting` is a singleton. Not enforced with a pk=1 trick, which breaks the
moment someone deletes the row: `SiteSetting.load()` returns the first row and
creates it if there is none, so the site renders on an empty database.
"""

from django.db import models
from django.utils import timezone

from app import taxonomy
from app.public_id import PublicId
from app.uploads import upload_to, validate_document, validate_image
from user.models import User


class SiteSetting(models.Model):
    """The brand, the contact details, and the numbers on the About page.

    This is the "one block of settings, not a rebuild" the proposal promises for
    branding: the client's logo and two colours go in here and the website, the
    panel and the app all take them.
    """

    id = PublicId(prefix="set")

    brand_name = models.CharField(max_length=120, default="Jeewan Sir")
    tagline = models.CharField(max_length=200, blank=True, default="")
    logo = models.ImageField(
        upload_to=upload_to("site", "logo"), validators=[validate_image],
        blank=True, null=True, max_length=500,
    )
    logo_dark = models.ImageField(
        upload_to=upload_to("site", "logo"), validators=[validate_image],
        blank=True, null=True, max_length=500,
    )
    favicon = models.ImageField(
        upload_to=upload_to("site", "favicon"), validators=[validate_image],
        blank=True, null=True, max_length=500,
    )
    # The two colours. Hex, because they are handed straight to CSS custom
    # properties — the frontend sets `--accent` and `--deep` from these and the
    # whole site changes.
    accent_colour = models.CharField(max_length=9, default="#F0682B")
    deep_colour = models.CharField(max_length=9, default="#14283F")

    phone = models.CharField(max_length=20, blank=True, default="")
    whatsapp = models.CharField(max_length=20, blank=True, default="")
    email = models.EmailField(max_length=254, blank=True, default="")
    address = models.TextField(blank=True, default="")
    map_url = models.URLField(max_length=500, blank=True, default="")
    office_hours = models.CharField(max_length=160, blank=True, default="")

    established_year = models.PositiveSmallIntegerField(null=True, blank=True)
    about_heading = models.CharField(max_length=200, blank=True, default="")
    about_body = models.TextField(blank=True, default="")

    # The row of numbers on Home and About — "teachers placed", "institutions
    # served". A JSON list of {label, value, note} rather than four columns,
    # because the client will want a fifth and that should not be a migration.
    stats = models.JSONField(default=list, blank=True)
    social = models.JSONField(default=dict, blank=True)

    seo_title = models.CharField(max_length=200, blank=True, default="")
    seo_description = models.CharField(max_length=320, blank=True, default="")
    og_image = models.ImageField(
        upload_to=upload_to("site", "og"), validators=[validate_image],
        blank=True, null=True, max_length=500,
    )
    google_verification = models.CharField(max_length=120, blank=True, default="")

    updated_at = models.DateTimeField(auto_now=True)

    @classmethod
    def load(cls) -> "SiteSetting":
        """The settings row, created on first read. Never raises — the website
        has to render on a database nobody has touched yet."""
        row = cls.objects.order_by("pk").first()
        return row or cls.objects.create()

    def __str__(self) -> str:
        return self.brand_name

    class Meta:
        managed = True
        db_table = "site_setting"


class Page(models.Model):
    """One of the five pages, as editable text.

    `blocks` is a JSON list of {type, ...} — the headline block, the band of
    post types, the testimonial. The frontend knows how to draw each type; this
    table decides which appear and in what order, so staff can take the
    testimonial off Home without a deploy.
    """

    id = PublicId(prefix="pag")
    slug = models.SlugField(max_length=60, unique=True)
    title = models.CharField(max_length=160)
    heading = models.CharField(max_length=200, blank=True, default="")
    subheading = models.TextField(blank=True, default="")
    blocks = models.JSONField(default=list, blank=True)

    seo_title = models.CharField(max_length=200, blank=True, default="")
    seo_description = models.CharField(max_length=320, blank=True, default="")
    is_published = models.BooleanField(default=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return self.slug

    class Meta:
        managed = True
        db_table = "site_page"
        ordering = ("slug",)


class Service(models.Model):
    """The four services on For Institutions."""

    id = PublicId(prefix="svc")
    title = models.CharField(max_length=140)
    description = models.TextField(blank=True, default="")
    # A Heroicons name, resolved by the frontend. A name rather than an uploaded
    # image so the icons stay consistent when staff add a fifth service.
    icon = models.CharField(max_length=60, blank=True, default="")
    order = models.PositiveSmallIntegerField(default=0, db_index=True)
    is_published = models.BooleanField(default=True)

    def __str__(self) -> str:
        return self.title

    class Meta:
        managed = True
        db_table = "site_service"
        ordering = ("order", "pk")


class ProcessStep(models.Model):
    """The five steps from brief to joining."""

    id = PublicId(prefix="stp")
    title = models.CharField(max_length=140)
    description = models.TextField(blank=True, default="")
    # "Within 48 hours", "Days 3–7" — the timing promise next to each step.
    timing = models.CharField(max_length=80, blank=True, default="")
    audience = models.CharField(
        max_length=12,
        choices=(("institution", "For institutions"), ("teacher", "For teachers")),
        default="institution", db_index=True,
    )
    order = models.PositiveSmallIntegerField(default=0, db_index=True)
    is_published = models.BooleanField(default=True)

    class Meta:
        managed = True
        db_table = "site_process_step"
        ordering = ("audience", "order", "pk")


class TeamMember(models.Model):
    """The consultants a principal will actually be dealing with, with
    photographs. `phone` and `email` are on here because the About page prints
    them — a named consultant with no number is a brochure."""

    id = PublicId(prefix="tem")
    name = models.CharField(max_length=140)
    role = models.CharField(max_length=140, blank=True, default="")
    bio = models.TextField(blank=True, default="")
    photo = models.ImageField(
        upload_to=upload_to("site", "team"), validators=[validate_image],
        blank=True, null=True, max_length=500,
    )
    phone = models.CharField(max_length=20, blank=True, default="")
    email = models.EmailField(max_length=254, blank=True, default="")
    # Ties a public profile to a staff login, so "assigned consultant" in the
    # panel and the face on the About page are the same person.
    user = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name="team_profile",
    )
    order = models.PositiveSmallIntegerField(default=0, db_index=True)
    is_published = models.BooleanField(default=True)

    def __str__(self) -> str:
        return self.name

    class Meta:
        managed = True
        db_table = "site_team_member"
        ordering = ("order", "pk")


class Testimonial(models.Model):
    id = PublicId(prefix="tst")
    quote = models.TextField()
    author = models.CharField(max_length=140)
    author_role = models.CharField(max_length=140, blank=True, default="")
    institution = models.CharField(max_length=180, blank=True, default="")
    photo = models.ImageField(
        upload_to=upload_to("site", "testimonial"), validators=[validate_image],
        blank=True, null=True, max_length=500,
    )
    side = models.CharField(
        max_length=12,
        choices=(("institution", "An institution"), ("teacher", "A teacher")),
        default="institution", db_index=True,
    )
    order = models.PositiveSmallIntegerField(default=0, db_index=True)
    is_published = models.BooleanField(default=True)

    class Meta:
        managed = True
        db_table = "site_testimonial"
        ordering = ("order", "pk")


class Enquiry(models.Model):
    """The contact form — "One form for both sides".

    This is the only write an anonymous visitor can make, which makes it the
    only thing on the public API that can be spammed. It is rate limited by IP
    in the view, and `ip` is kept so a flood can be traced and blocked.

    It is deliberately NOT a `TeacherProfile`. Someone filling in a contact form
    has not signed up, and creating an account for them would mean a login they
    never asked for and a phone number nobody verified.
    """

    SIDE_CHOICES = (("teacher", "A teacher"), ("institution", "An institution"))
    STATUS_CHOICES = (
        ("new", "New"),
        ("contacted", "Contacted"),
        ("converted", "Converted"),
        ("closed", "Closed"),
        ("spam", "Spam"),
    )

    id = PublicId(prefix="enq")
    side = models.CharField(max_length=12, choices=SIDE_CHOICES, default="teacher", db_index=True)
    name = models.CharField(max_length=140)
    phone = models.CharField(max_length=20, db_index=True)
    email = models.EmailField(max_length=254, blank=True, default="")
    city = models.CharField(max_length=80, blank=True, default="")

    # Teacher side.
    post = models.CharField(max_length=20, choices=taxonomy.POST_CHOICES, blank=True, default="")
    subject = models.CharField(max_length=80, blank=True, default="")
    qualification = models.CharField(max_length=160, blank=True, default="")
    experience_band = models.CharField(
        max_length=10, choices=taxonomy.EXPERIENCE_CHOICES, blank=True, default="",
    )
    cv = models.FileField(
        upload_to=upload_to("enquiry", "cv"), validators=[validate_document],
        blank=True, null=True, max_length=500,
    )

    # Institution side.
    institution_name = models.CharField(max_length=180, blank=True, default="")
    institution_type = models.CharField(
        max_length=20, choices=taxonomy.INSTITUTION_CHOICES, blank=True, default="",
    )
    vacancies_count = models.PositiveSmallIntegerField(null=True, blank=True)

    message = models.TextField(blank=True, default="")
    # Which page it came from, so the client can see what the site is doing.
    source_path = models.CharField(max_length=200, blank=True, default="")
    ip = models.GenericIPAddressField(null=True, blank=True)

    status = models.CharField(max_length=12, choices=STATUS_CHOICES, default="new", db_index=True)
    handled_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name="enquiries_handled",
    )
    handled_at = models.DateTimeField(null=True, blank=True)
    internal_note = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(default=timezone.now, db_index=True)

    def __str__(self) -> str:
        return f"{self.name} ({self.get_side_display()})"

    class Meta:
        managed = True
        db_table = "site_enquiry"
        ordering = ("-created_at",)
