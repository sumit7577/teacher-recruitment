"""The whole API surface, mounted by AUDIENCE.

Four audiences read this backend, and which one a request belongs to decides
everything about it — who may call it, what it may see, and whether it needs a
token at all:

    v1/public/   the website, anonymous. Vacancy board, page content, enquiry
                 form. No token. Anything here is on Google.
    v1/auth/     sign-in and sign-up for all three signed-in audiences.
    v1/teacher/  a teacher, on the website or in the Android app.
    v1/school/   an institution's own workspace.
    v1/panel/    the firm's staff — the admin panel.

Mounting by audience rather than by feature is the point: one feature (a
vacancy) is read by all four, and the differences between them are not small —
the public sees a live vacancy with no salary breakdown, a school sees only its
own, staff see every one including drafts. Separate url modules per audience
inside the feature app keep each queryset's tenant filter next to the route
that needs it, instead of one view growing four code paths. allcoaching does
the same thing with `institute/team_urls.py` and `course/schedule_urls.py`.
"""

from django.urls import include, path

from app import views

urlpatterns = [
    path("", views.health),
    path("healthz/", views.health, name="health"),

    # ── public website (anonymous) ─────────────────────────────────────────
    path("v1/public/vacancies/", include("vacancy.public_urls")),
    path("v1/public/site/", include("cms.public_urls")),
    path("v1/public/enquiry/", include("cms.enquiry_urls")),

    # ── auth (all audiences) ───────────────────────────────────────────────
    path("v1/auth/", include("user.urls")),

    # ── teacher ────────────────────────────────────────────────────────────
    path("v1/teacher/profile/", include("teacher.urls")),
    path("v1/teacher/vacancies/", include("vacancy.teacher_urls")),
    path("v1/teacher/applications/", include("application.teacher_urls")),
    path("v1/teacher/notifications/", include("notifications.teacher_urls")),

    # ── school ─────────────────────────────────────────────────────────────
    path("v1/school/", include("school.urls")),
    path("v1/school/vacancies/", include("vacancy.school_urls")),
    path("v1/school/applicants/", include("application.school_urls")),

    # ── the firm's admin panel ─────────────────────────────────────────────
    path("v1/panel/dashboard/", include("panel.urls")),
    path("v1/panel/vacancies/", include("vacancy.panel_urls")),
    path("v1/panel/applications/", include("application.panel_urls")),
    path("v1/panel/teachers/", include("teacher.panel_urls")),
    path("v1/panel/schools/", include("school.panel_urls")),
    path("v1/panel/site/", include("cms.panel_urls")),
    path("v1/panel/enquiries/", include("cms.enquiry_panel_urls")),
    path("v1/panel/notifications/", include("notifications.panel_urls")),
]
