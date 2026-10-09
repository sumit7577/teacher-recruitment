# Teacher recruitment — website, workspaces and admin panel

Next 16 + React 19 + Tailwind 4, talking to the Django API in `../be`.
Architecture and conventions: [CLAUDE.md](CLAUDE.md).

## Quick start

```bash
cp .env.example .env.local
npm install
npm run dev
```

The API has to be running first:

```bash
cd ../be && DJANGO_DEBUG=true .venv/bin/python manage.py runserver 8000
```

Then <http://localhost:3000>.

## What is here

| Route | What |
|---|---|
| `/` | Home — live vacancy count, search, featured posts, the posts we fill |
| `/jobs` | the board. Filters, sort and paging all live in the URL |
| `/jobs/[id]` | one vacancy, with JobPosting structured data for Google |
| `/institutions` | the four services and the five-step process |
| `/about` | the firm's numbers and the consultants, with photographs |
| `/contact` | one form for both sides, with CV upload |
| `/sitemap.xml`, `/robots.txt` | generated, with every live vacancy in the sitemap |

Everything on these pages is editable from the admin panel — the headline, the
services, the process steps, the team, the testimonials, the brand colours and the
contact details. Nothing is hard-coded in a component.

Signed in:

| Route | Who |
|---|---|
| `/login`, `/register` | one door, two sides — the switch decides which questions get asked |
| `/teacher` | dashboard: matching vacancies, the demo class, what the profile is missing |
| `/teacher/vacancies` | only posts they qualify for, with an Every-vacancy tab |
| `/teacher/applications` | the stage of each one, the demo-class date, the offer |
| `/teacher/profile` | one CV, every certificate, and the four fields that decide matching |
| `/teacher/notifications` | the same inbox the Android app shows |

The institution's side:

| Route | What |
|---|---|
| `/school` | live posts, new applicants, demo classes this week, what is outstanding |
| `/school/vacancies`, `/school/vacancies/new` | post one, with the card teachers will see drawn live |
| `/school/applicants` | shortlist, book the demo, make an offer |
| `/school/profile` | the institution, and the affiliation certificate we verify |

The office's panel:

| Route | What |
|---|---|
| `/panel` | what is waiting on the office, the pipeline, posts with people waiting |
| `/panel/vacancies` | every post including drafts; publishing notifies matching teachers |
| `/panel/applications` | every application, any stage, the demo calendar |
| `/panel/teachers` | documents ticked off one by one, with who verified them |
| `/panel/schools` | verify an institution — and publish whatever it had waiting |
| `/panel/enquiries` | the contact form's inbox |
| `/panel/notifications` | the push sender, with the headcount before you send |
| `/panel/site` | every word on the website, the two brand colours, and the Google tags |

## Checks

```bash
npm run build     # includes the type check — run this, not just tsc
npm run lint      # must be clean

npm install --no-save playwright-core
node scripts/e2e-teacher.mjs   # the teacher's path, through a real browser
node scripts/e2e-school.mjs    # the institution's
node scripts/e2e-panel.mjs     # the office's
```
