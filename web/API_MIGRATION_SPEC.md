# API migration spec

Where the frontend specs an endpoint it needs before the backend has it.

**The convention:** when a screen needs something the API does not do yet, write
the request and response shape here first, build the screen against it, and mark it
shipped once `../be` implements it. The backend's `CLAUDE.md` §5 points here, and
whoever implements it matches this shape exactly rather than inventing one.

## Status

Nothing outstanding. Every endpoint the frontend calls today is implemented and
covered by `../be/scripts/smoke.py` (58 checks).

## Shipped

The full surface as of the first commit — see `../be/app/urls.py` for the
authoritative list, and `src/networking/controller.ts` for the client side:

| Audience | Prefix |
|---|---|
| public website | `v1/public/` — vacancies, filters, site content, enquiry |
| sign-in | `v1/auth/` — OTP, password, Google, me, logout |
| teacher | `v1/teacher/` — profile, documents, experience, vacancies, applications, notifications |
| institution | `v1/school/` — profile, dashboard, vacancies, applicants, demo classes, offers |
| the firm's panel | `v1/panel/` — dashboard, vacancies, applications, teachers, schools, site content, enquiries, push |

## Anticipated, NOT built — do not assume these exist

These come out of the proposal's "not in this scope" list. They are written down so
nobody builds a screen on the assumption that they are coming:

- **Anything where money moves through the platform** — paid listings,
  subscriptions, invoices, online payment. A second product with billing, receipts,
  refunds and tax behind it.
- **A searchable teacher database for schools to browse.** Schools read applicants
  to their own posts, not the whole roll — that is the firm's business.
- **CV parsing, online assessments, video interviews.**
- **Automated document verification.** The panel *tracks* the checks; staff do them.
- **Feeds from other job boards.**

If one of these is wanted, it is a scope conversation, not a ticket.
