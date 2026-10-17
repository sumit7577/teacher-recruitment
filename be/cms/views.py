"""The website's content, and the panel that edits it."""

from django.core.cache import cache
from django.core.mail import send_mail
from django.conf import settings
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.generics import ListAPIView, ListCreateAPIView, RetrieveUpdateDestroyAPIView
from rest_framework.permissions import AllowAny
from rest_framework.views import APIView

from app.responses import fail, ok
from cms.models import Enquiry, Faq, Page, ProcessStep, Service, SiteSetting, SuccessStory, TeamMember, Testimonial
from cms.serializer import (
    EnquiryReadSerializer,
    EnquirySerializer,
    PageSerializer,
    ProcessStepSerializer,
    ServiceSerializer,
    SiteSettingSerializer,
    SiteSettingWriteSerializer,
    TeamMemberSerializer,
    TestimonialSerializer,
    FaqSerializer,
    SuccessStorySerializer,
)
from user.auth import CustomAuthentication, IsStaff


class PublicSiteView(APIView):
    """GET v1/public/site/ — everything the website needs to render its chrome.

    One request, not six. The Next app fetches this in a server component on
    every page, so six would be six round trips before the first byte of HTML.
    """

    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        from vacancy.models import Vacancy

        return ok("", {
            "settings": SiteSettingSerializer(SiteSetting.load()).data,
            "services": ServiceSerializer(
                Service.objects.filter(is_published=True), many=True
            ).data,
            "process": ProcessStepSerializer(
                ProcessStep.objects.filter(is_published=True), many=True
            ).data,
            "team": TeamMemberSerializer(
                TeamMember.objects.filter(is_published=True), many=True
            ).data,
            "testimonials": TestimonialSerializer(
                Testimonial.objects.filter(is_published=True), many=True
            ).data,
            # The live count in the hero. Counted here rather than fetched
            # separately because it is the one number on the page that must not
            # be stale — "47 vacancies" over an empty board is the worst
            # possible first impression.
            # Section 8 of the brief. Both sides ask different questions, so
            # the client groups by `audience` rather than printing one list.
            "faqs": FaqSerializer(
                Faq.objects.filter(is_published=True), many=True
            ).data,
            "stories": SuccessStorySerializer(
                SuccessStory.objects.filter(is_published=True), many=True
            ).data,
            "live_vacancies": Vacancy.objects.public().count(),
        })


class PublicPageView(APIView):
    """GET v1/public/site/pages/<slug>/ — one page's editable text."""

    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request, slug):
        page = Page.objects.filter(slug=slug, is_published=True).first()
        if page is None:
            return fail("No such page.", status_code=404)
        return ok("", PageSerializer(page).data)


class EnquiryCreateView(APIView):
    """POST v1/public/enquiry/ — the contact form.

    Rate limited by IP, in the cache rather than the database: the limit has to
    be checked before anything is written, and a counter that itself writes a row
    is a counter that can be used to fill the disk.

    Three an hour is generous for a person and useless for a script. The reply is
    the same either way — a form that says "you are being rate limited" tells
    whoever is probing exactly what to work around.
    """

    authentication_classes = []
    permission_classes = [AllowAny]

    LIMIT = 3
    WINDOW_SECONDS = 3600

    def post(self, request):
        ip = _client_ip(request)
        key = f"enquiry:{ip}"
        count = cache.get(key, 0)
        if count >= self.LIMIT:
            return ok("Thanks — we have your message. We will call you back.")

        serializer = EnquirySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        enquiry = serializer.save(ip=ip)
        cache.set(key, count + 1, self.WINDOW_SECONDS)

        _email_office(enquiry)
        return ok("Thanks — we have your message. We will call you back.")


def _client_ip(request) -> str:
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR", "")
    if forwarded:
        # Leftmost is the client; the rest are proxies. Behind Cloudflare and
        # nginx this header has three entries and the last one is our own box.
        return forwarded.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR", "") or ""


def _email_office(enquiry) -> None:
    """"Saved in the panel and emailed to you."

    Saved first, emailed second, and a failure to email is swallowed: the row is
    the record, and a dead SMTP password must not turn a teacher's enquiry into a
    500 they read as "this firm's website is broken".
    """
    office = getattr(settings, "OFFICE_EMAIL", "")
    if not office:
        return
    lines = [
        f"{enquiry.get_side_display()} enquiry",
        f"Name: {enquiry.name}",
        f"Phone: {enquiry.phone}",
        f"Email: {enquiry.email or '—'}",
        f"City: {enquiry.city or '—'}",
    ]
    if enquiry.side == "teacher":
        lines += [
            f"Post: {enquiry.get_post_display() if enquiry.post else '—'}",
            f"Subject: {enquiry.subject or '—'}",
            f"Qualification: {enquiry.qualification or '—'}",
        ]
    else:
        lines += [
            f"Institution: {enquiry.institution_name or '—'}",
            f"Vacancies: {enquiry.vacancies_count or '—'}",
        ]
    lines += ["", enquiry.message or ""]
    try:
        send_mail(
            subject=f"New {enquiry.get_side_display().lower()} enquiry — {enquiry.name}",
            message="\n".join(lines),
            from_email=getattr(settings, "DEFAULT_FROM_EMAIL", ""),
            recipient_list=[office],
            fail_silently=True,
        )
    except Exception:
        pass


# ── the firm's panel ────────────────────────────────────────────────────────


class PanelSiteSettingView(APIView):
    """GET / PATCH v1/panel/site/ — the brand and the contact details."""

    authentication_classes = [CustomAuthentication]
    permission_classes = [IsStaff]

    def get(self, request):
        return ok("", SiteSettingWriteSerializer(SiteSetting.load()).data)

    def patch(self, request):
        serializer = SiteSettingWriteSerializer(SiteSetting.load(), data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return ok("Saved.", SiteSettingSerializer(SiteSetting.load()).data)


class _PanelList(ListCreateAPIView):
    """Shared base for the five content tables.

    They are the same CRUD five times over, differing only in model and
    serializer, so they share a base rather than repeating 30 lines each.
    `pagination_class = None` throughout: these are lists of four to eight rows
    that the panel reorders by drag, and paginating a reorderable list means a
    row can be dragged off the page.
    """

    authentication_classes = [CustomAuthentication]
    permission_classes = [IsStaff]
    pagination_class = None
    model = None

    def get_queryset(self):
        return self.model.objects.all()


class _PanelDetail(RetrieveUpdateDestroyAPIView):
    authentication_classes = [CustomAuthentication]
    permission_classes = [IsStaff]
    model = None

    def get_queryset(self):
        return self.model.objects.all()


class PanelPageList(_PanelList):
    model = Page
    serializer_class = PageSerializer


class PanelPageDetail(_PanelDetail):
    model = Page
    serializer_class = PageSerializer


class PanelServiceList(_PanelList):
    model = Service
    serializer_class = ServiceSerializer


class PanelServiceDetail(_PanelDetail):
    model = Service
    serializer_class = ServiceSerializer


class PanelProcessList(_PanelList):
    model = ProcessStep
    serializer_class = ProcessStepSerializer


class PanelProcessDetail(_PanelDetail):
    model = ProcessStep
    serializer_class = ProcessStepSerializer


class PanelTeamList(_PanelList):
    model = TeamMember
    serializer_class = TeamMemberSerializer


class PanelTeamDetail(_PanelDetail):
    model = TeamMember
    serializer_class = TeamMemberSerializer


class PanelTestimonialList(_PanelList):
    model = Testimonial
    serializer_class = TestimonialSerializer


class PanelTestimonialDetail(_PanelDetail):
    model = Testimonial
    serializer_class = TestimonialSerializer


class PanelEnquiryList(ListAPIView):
    """GET v1/panel/enquiries/ — the contact form's inbox."""

    authentication_classes = [CustomAuthentication]
    permission_classes = [IsStaff]
    serializer_class = EnquiryReadSerializer

    def get_queryset(self):
        params = self.request.query_params
        queryset = Enquiry.objects.select_related("handled_by")
        status_filter = (params.get("status") or "").strip()
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        side = (params.get("side") or "").strip()
        if side:
            queryset = queryset.filter(side=side)
        query = (params.get("q") or "").strip()
        if query:
            from django.db.models import Q

            queryset = queryset.filter(
                Q(name__icontains=query)
                | Q(phone__icontains=query)
                | Q(institution_name__icontains=query)
            )
        return queryset.order_by("-created_at")


class PanelEnquiryDetail(APIView):
    """GET / PATCH v1/panel/enquiries/<id>/ — work an enquiry."""

    authentication_classes = [CustomAuthentication]
    permission_classes = [IsStaff]

    def get(self, request, pk):
        return ok("", EnquiryReadSerializer(get_object_or_404(Enquiry, pk=pk)).data)

    def patch(self, request, pk):
        enquiry = get_object_or_404(Enquiry, pk=pk)
        changed = []
        if "status" in request.data:
            value = str(request.data["status"])
            if value not in dict(Enquiry.STATUS_CHOICES):
                return fail("Not a status we know.")
            enquiry.status = value
            enquiry.handled_by = request.user
            enquiry.handled_at = timezone.now()
            changed += ["status", "handled_by", "handled_at"]
        if "internal_note" in request.data:
            enquiry.internal_note = str(request.data["internal_note"])
            changed.append("internal_note")
        if not changed:
            return fail("Nothing to change.")
        enquiry.save(update_fields=changed)
        return ok("Saved.", EnquiryReadSerializer(enquiry).data)


class PanelFaqList(ListCreateAPIView):
    """GET/POST v1/panel/site/faqs/"""

    authentication_classes = [CustomAuthentication]
    permission_classes = [IsStaff]
    serializer_class = FaqSerializer
    pagination_class = None
    queryset = Faq.objects.all()


class PanelFaqDetail(RetrieveUpdateDestroyAPIView):
    authentication_classes = [CustomAuthentication]
    permission_classes = [IsStaff]
    serializer_class = FaqSerializer
    queryset = Faq.objects.all()


class PanelStoryList(ListCreateAPIView):
    """GET/POST v1/panel/site/stories/"""

    authentication_classes = [CustomAuthentication]
    permission_classes = [IsStaff]
    serializer_class = SuccessStorySerializer
    pagination_class = None
    queryset = SuccessStory.objects.all()


class PanelStoryDetail(RetrieveUpdateDestroyAPIView):
    authentication_classes = [CustomAuthentication]
    permission_classes = [IsStaff]
    serializer_class = SuccessStorySerializer
    queryset = SuccessStory.objects.all()
