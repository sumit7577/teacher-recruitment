# Teacher recruitment backend — code architecture

Django 4.2 + DRF. Serves four audiences: the public website, the teacher (web and
Android app), the institution, and the firm's own admin panel. The Next.js
frontend lives beside this at `../web`.

**The architecture is deliberately the same as `~/code/allcoachingAdmin`**, so
anyone who knows that codebase knows this one. This document is the contract:
when you change code here, follow the patterns below rather than introducing new
ones. Where this repo diverges from allcoaching, §7 says so and why.

## 1. Tech stack

- **Framework:** Django 4.2 + DRF 3.15
- **Python:** 3.13
- **Database:** PostgreSQL. SQLite is the fallback when `POSTGRES_DB` is unset —
  for a fresh clone only; anything shipped is verified against Postgres.
- **Auth:** custom `AuthToken` model, SHA256-hashed — *not* DRF's `TokenAuthentication`
- **Primary keys:** prefixed UUID v7 slugs (`vac_…`, `tch_…`) via `app/public_id.py`
- **API style:** REST, JSON, `PageNumberPagination` at `PAGE_SIZE = 10`
- **Uploads:** local filesystem under `MEDIA_ROOT`, served by nginx in production
- **SMS:** Fast2SMS over DLT (`app/sms.py`) — the sign-in OTP, nothing else
- **Push:** Firebase Cloud Messaging (`app/fcm.py`)
- **Sign-in with Google:** `user/google_auth.py`, linked by Google's `sub`
- **Deploy:** Dockerfile → gunicorn, 3 workers × 3 threads, port 8000

## 2. Directory structure

```
be/
├── manage.py
├── recruit/              # project — settings, root urls, wsgi/asgi
├── app/                  # 🔑 integrations + shared plumbing. NO domain models.
│   ├── urls.py           # the whole API surface, mounted BY AUDIENCE
│   ├── public_id.py      # PublicId field + the <pid:…> URL converter
│   ├── taxonomy.py       # posts, qualifications, boards, document kinds
│   ├── uploads.py        # upload_to paths + file validators
│   ├── responses.py      # ok() / fail() — the response envelope
│   ├── sms.py  fcm.py    # the two outbound integrations
│   └── apps.py           # registers <pid:…>; admin defaults
├── user/                 # identity + sign-in. User, AuthToken, Otp.
├── teacher/              # TeacherProfile, TeacherDocument, TeacherExperience
├── school/               # School (the institution)
├── vacancy/              # Vacancy — the row all four audiences read
├── application/          # Application, ApplicationEvent, DemoClass, Offer
├── cms/                  # editable site content + the enquiry form
├── notifications/        # Device, Notification, PushCampaign
└── panel/                # the firm's dashboard. No models.
```

### Models live in the app that owns their endpoints

Unlike allcoaching's original "everything in `app/models.py`" (which that repo
has itself since grown out of — its models now live per-app), every model here
lives in its feature app from the start. `app/models.py` and `panel/models.py`
are deliberately empty stubs so Django still registers the apps. Don't delete
them.

### Serializer filenames are spelled correctly

allcoaching has `serliazer.py` and `serialaizer.py` typos that cannot be renamed
without breaking imports across that codebase. Here every app uses
**`serializer.py`**. Don't "match" allcoaching's typos.

## 3. URL routing — mounted by audience, not by feature

Three levels: `recruit/urls.py` → `app/urls.py` → each feature app's url module.

```
v1/public/    the website, anonymous. No token.
v1/auth/      sign-in and sign-up for all three signed-in audiences.
v1/teacher/   a teacher, on the website or in the app.
v1/school/    an institution's own workspace.
v1/panel/     the firm's staff.
```

One feature is read by all four audiences and the differences are not cosmetic —
the public sees a live vacancy, a school sees only its own including drafts, staff
see every one. So a feature app carries **several url modules**, one per audience:
`vacancy/public_urls.py`, `vacancy/teacher_urls.py`, `vacancy/school_urls.py`,
`vacancy/panel_urls.py`. (allcoaching does the same thing with
`institute/team_urls.py` and `course/schedule_urls.py`.)

**Adding an endpoint:** put the path in the feature app's url module for that
audience, with a `name=`. Never in `app/urls.py`.

## 4. Patterns to follow

### 4.1 Auth and audience scoping

Every protected view sets both:

```python
authentication_classes = [CustomAuthentication]
permission_classes     = [IsTeacher]   # or IsSchool / IsStaff / IsSignedIn
```

**The token carries the audience it was issued for**, and the permission class
checks it. A person can legitimately be both a teacher and a school's contact; a
token minted at the school sign-in must not open the teacher API.

**THE CONTRACT:** behind `IsTeacher`, `request.teacher` is set and is never None.
Behind `IsSchool`, `request.school` is. The permission class refuses the request
when it would be, so no view body checks. (allcoaching's `_stash` pattern.)

`IsTeacherAudience` / `IsSchoolAudience` exist for exactly one endpoint each —
creating the profile that `IsTeacher` / `IsSchool` would otherwise require.

**Tenant isolation is in `get_queryset`, never in a parameter.** Every list starts
from a queryset already narrowed to its audience:

```python
def get_queryset(self):
    return _with_counts(self.request.school.vacancies.all())
```

There is no code path where a school id arrives in the request and is trusted.

### 4.2 Generic CBVs from `rest_framework.generics`

| Need | Class |
|---|---|
| List + create | `ListCreateAPIView` |
| List only | `ListAPIView` |
| Detail + update + delete | `RetrieveUpdateDestroyAPIView` |
| Detail only | `RetrieveAPIView` |

`APIView` is reserved for non-CRUD shapes: sign-in, the three pipeline actions,
and the two create-or-fetch profile endpoints (the resource may not exist yet, so
a generic retrieve would 404 the user on the one request that matters).

### 4.3 Two-serializer pattern (write vs read)

- **`<Model>Serializer`** — write. `exclude`s what the client must not set.
- **`<Model>ReadSerializer`** — read. **Explicit `fields` tuple.**

The explicit field list is the only reason `password`, `google_sub` and
`internal_note` have never leaked into a response. Never use `fields = "__all__"`
on a read serializer.

Where audiences differ, there is one read serializer **per audience** —
`TeacherSelfSerializer` (own profile, phone included), `TeacherCardSerializer`
(what a school sees: no phone, no email, no CV url), `TeacherPanelSerializer`
(staff: everything). Four explicit lists is four things to read; one serializer
with four `if`s is one thing nobody can audit.

### 4.4 `perform_create` derives the parent from URL + token

Never trust a client-supplied parent id:

```python
def perform_create(self, serializer):
    serializer.save(school=self.request.school, source=SOURCE_SCHOOL,
                    posted_by=self.request.user)
```

### 4.5 Annotate counts, don't compute them per row

`applications_count`, `new_applications`, `live_vacancies` are annotations. A
property on a model behind a list of thirty is thirty-one queries.

### 4.6 Uploads

`upload_to=upload_to("teacher", "cv")` from `app/uploads.py`, plus a validator
(`validate_document` or `validate_image`). Paths carry a random segment because
files are served as static by nginx and the files here are CVs and ID proofs.
Extensions are **allow-listed** — a deny list is a list of the attacks somebody
already thought of.

`upload_to` is a `@deconstructible` class, not a closure: `makemigrations` cannot
serialise a nested function.

### 4.7 Side effects go through a service module

Notifications are sent by `notifications/service.py:deliver()`, which writes the
inbox row **first** and pushes **second**. A push that fails must not mean the
teacher never learns their demo class was scheduled.

### 4.8 Response envelope

```python
return ok("Saved.", data)                      # {"status":"true","message":…,"data":…}
return fail("Nothing to change.")              # {"status":"false","message":…}
```

`status` is the **string** `"true"`/`"false"` — allcoaching's wire contract, which
the Android client parses as a string. Errors are flattened into the same shape by
`user/service.py:custom_exception_handler`.

### 4.9 Stage changes go through `Application.move()`

Never `application.stage = x; save()`. `move()` writes who did it and appends an
`ApplicationEvent`. The event log is what answers "who shortlisted her, and what
did the school say" three weeks later — which is the question that actually gets
asked.

## 5. Workflows

**Add a field to a model:** edit the model → `makemigrations <app>` → add it to
*both* serializers (the read one has an explicit tuple, so it is silently omitted
otherwise) → note it in `../web/API_MIGRATION_SPEC.md` if the frontend needs it.

**Add a model + endpoints:** model in the feature app → `db_table` in snake_case →
`makemigrations` → write+read serializer pair → the right generic CBV with both
auth classes and a tenant-filtered `get_queryset` → wire the audience's url module.

**Add an integration:** a module in `app/`, credentials via
`getattr(settings, "KEY", None)`, never hardcoded.

## 6. Running it

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
cp .env.example .env            # fill it in; SQLite until POSTGRES_DB is set
.venv/bin/python manage.py migrate
.venv/bin/python manage.py seed_demo          # 12 vacancies + the editable text
.venv/bin/python manage.py make_staff 9845637278 --name "Office"
DJANGO_DEBUG=true .venv/bin/python manage.py runserver 8000
```

With no SMS credentials, `OTP_CONSOLE_FALLBACK` (defaults to `DEBUG`) prints the
code to the log and reports it as sent — otherwise nobody can sign in locally. It
is never silently on in production.

**Smoke test** — 58 checks over the real URL tree, permissions and serializers:

```bash
DJANGO_DEBUG=true PYTHONPATH=$PWD .venv/bin/python scripts/smoke.py
```

It writes to whatever database is configured, so point it at SQLite, not prod.

## 7. Where this diverges from allcoachingAdmin, and why

allcoaching's CLAUDE.md §6 lists sharp edges it asks you not to "improve". Those
are real constraints *there* — the repo is live with 300 academies and a history
that cannot be rewritten. None of them is architecture, and this repo is new and
is handed to a client, so they are not copied:

| allcoaching | here | why |
|---|---|---|
| Secrets committed in `settings.py` | every secret from the environment | the Razorpay secret, SMS key and FTP password are in that repo's git history forever, and deleting the line did not unpublish them |
| `DEBUG = True` in production | defaults to False | |
| `serliazer.py`, `serialaizer.py` | `serializer.py` | nothing imports the typos yet |
| `timezone.now()` as a field default (resolved at import) | `timezone.now` / `auto_now` | |
| `JSONField(default={})` mutable default | `default=dict` / `default=list` | |
| `is_institute` check commented out, so any authenticated user passed | the audience is on the token and checked every request | this product has two kinds of customer who must not see each other |
| `AuthToken` is a OneToOne — signing in on a phone signs you out on the laptop | FK, one row per device | the whole point of the app is a teacher using it alongside the website |

## 8. Scope boundaries, from the proposal

Built: the five-page website, the vacancy board, teacher and school accounts
(phone + password, one-time code, or Google), schools posting and managing their
own vacancies, institution verification before posts go live, the admin panel,
push notifications, the enquiry form.

**Deliberately not built**, and the proposal says so: money moving through the
platform (paid listings, subscriptions, invoicing, online payment), a searchable
teacher database for schools to browse, CV parsing, online assessments, video
interviews, automated document verification (the panel *tracks* the checks; staff
do them), feeds from other job boards, and iOS.

Don't add a payment integration here without a new conversation about scope — it
is a second product with billing, receipts, refunds and tax behind it.
