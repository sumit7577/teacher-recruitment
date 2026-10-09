# Teacher recruitment frontend — code architecture

Next 16 (App Router, Turbopack) + React 19 + Tailwind 4 + TanStack Query. One app
serving four audiences; the Django API is beside it at `../be`.

**The conventions are deliberately `~/code/allcoaching-educator`'s**, so anyone who
knows the studio knows this. The framework is different — educator is Vite SPA,
this is Next — so §6 lists what Next forces to change and why.

## 1. Directory structure

```
web/src/
├── app/                      # ROUTES ONLY — thin, mostly server components
│   ├── layout.tsx            # fonts, brand colours, <Providers>, metadata
│   ├── globals.css           # design tokens + the four component classes
│   ├── (site)/               # the public website. Route group: not in the URL.
│   │   ├── layout.tsx        # SiteHeader + SiteFooter
│   │   ├── page.tsx          # Home
│   │   ├── jobs/             # the board + /jobs/[id]
│   │   ├── institutions/  about/  contact/
│   ├── sitemap.ts  robots.ts
├── components/
│   ├── Providers.tsx         # the "use client" boundary
│   ├── common/               # Column, Row, Button, Pager, PageLoader, EmptyState
│   └── site/                 # the public site's own components
├── context/                  # ThemeContext, SidebarContext
├── lib/                      # fonts.ts, cn.ts
├── networking/               # 🔑 every call to the API
│   ├── controller.ts         # ApiController — the only place a URL is built
│   ├── interceptor.ts        # browser axios + the session store
│   ├── server.ts             # server-component fetch (public endpoints only)
│   ├── types.ts  error-type.ts  index.ts
└── queryClient.ts
```

## 2. Networking — nothing builds a URL but the controller

Components call `ApiController.getVacancies({ city })`. They never touch axios and
never write a path, so a backend route change is one edit. Methods are grouped by
audience in the same order as `be/app/urls.py` — public, auth, teacher, school,
panel — and a `panel*` call on a teacher screen is a bug you can see.

**Two clients, and the split matters:**

| | `interceptor.ts` | `server.ts` |
|---|---|---|
| Runs in | the browser | server components |
| Auth | `Authorization: Token …` from localStorage | none — public endpoints only |
| Caching | React Query | Next's `fetch` cache |
| On failure | throws a typed error | returns `null` |

Importing `interceptor.ts` from a server component would not crash; every request
would just go out unauthenticated, which presents as a permissions bug. Use
`serverGetData` there.

`server.ts` returns null rather than throwing because it runs during render: an
API hiccup should cost one section of a page, not the page.

### Errors

The interceptor normalises everything into `NetworkError`, `AuthenticationError`,
`ServerError` or `ClientError`. `ClientError` keeps `code` and `errors`, so a form
binds `errors` to its fields and a modal keys off `code`.

A 401 from a **sign-in** endpoint is the answer to the question, not a dead
session — `POST v1/auth/password` returns 401 for a wrong password by design. The
interceptor tests the URL *and* whether the request carried a token, because each
catches what the other misses. (Educator shipped the version without this and a
mistyped password threw users back to the start with no error shown.)

### Session

One session per browser under `localStorage.session`, carrying `{key, role}`. It
is an **external store**: read it with `useSyncExternalStore(subscribeSession,
sessionSnapshot, serverSessionSnapshot)`, never `useState` + an effect.
`writeSession` dispatches a `session` event because the browser's `storage` event
only fires in *other* tabs — without it the header misses its own sign-in.

## 3. Styling

Tokens in `globals.css` under `:root` and `.dark`, exposed as utilities through
`@theme inline` — inline so the utilities reference `var(--token)` rather than
baking in the light value, which is the whole reason `.dark` works.

**Never write `bg-white`, `bg-gray-*` or `text-gray-*`.** They do not flip in dark
mode and they ignore the client's brand. Use `bg-surface`, `bg-surface-2`,
`text-ink-1/2/3`, `border-line`, `text-accent`, `bg-deep`.

Two colours carry the brand: `--accent` and `--deep`. `BrandStyle` overrides them
at the document root from `SiteSetting`, so the client changes their colours in the
panel with no deploy. It validates the hex first — a value from the database inside
a `<style>` tag is stored XSS otherwise.

Four component classes exist because these shapes appear on every screen:
`.card`, `.btn` + `.btn-accent/-deep/-outline/-ghost`, `.chip` (+ `-accent/-ok/
-warn/-bad`), `.field` / `.label`.

Fonts load through `next/font` (`lib/fonts.ts`), never an `@import` in the CSS: an
`@import` must precede every rule, and the production optimiser silently drops one
that does not — the build exits 0 and only production renders in the fallback
stack.

## 4. Server vs client

The default is a server component. Add `"use client"` only for state, an effect,
an event handler or a browser API.

The public pages are server-rendered because the whole point of them is Google.
Two rules follow:

* **Do not call `useSearchParams()` to read a filter.** It opts the component out
  of prerendering, so its markup is missing from the served HTML. The page is a
  server component and already has `searchParams` — pass the value down. (The
  contact form shipped the wrong way round once: the entire form was absent from
  the HTML and appeared only after hydration.)
* **Filter state lives in the URL.** `router.replace(..., { scroll: false })`
  inside `useTransition` gives a soft navigation — the filter panel stays mounted,
  only the server part re-renders, and `isPending` dims the results instead of
  blanking them. It also makes a filtered board shareable, which matters because
  most teachers arrive from a WhatsApp link.

## 5. Adding a screen

1. Add the method to `networking/controller.ts` (and its types to `types.ts`).
2. Build the screen under `components/` or as a page under `app/`.
3. Signed-in data goes through `useQuery` with a key that **names the audience** —
   `["panel", "vacancies", filters]`, not `["vacancies"]`. One shared key across two
   audiences is how a school ends up reading the panel's cached copy.
4. Mutations `invalidateQueries` on the keys they touch. The panel is a working
   tool: "I just verified that" has to show as verified.

## 6. Where Next forces a difference from educator

| educator (Vite SPA) | here | why |
|---|---|---|
| `src/pages/<Feature>/` holds screens, `App.tsx` routes them | `src/app/**/page.tsx` | the router is the filesystem |
| everything is a client component | server by default | the five public pages have to be HTML for Google |
| one axios client | plus `networking/server.ts` | server components have no localStorage |
| `react-router` `useSearchParams` freely | avoided for render-critical state | it disables prerendering |
| `@import` fonts in `index.css` | `next/font` | see §3 |

Kept identical: `ApiController` as the single network surface, the typed error
classes, `Column`/`Row`, the module-level `queryClient`, the token in localStorage,
and `ThemeContext` / `SidebarContext`.

## 7. Accessibility — labels are not decoration

Use `components/common/Field` for every labelled input. `<label>Name</label>` next
to an `<input>` is **not a label**: with no `for`/`id` pair a screen reader
announces the input as unlabelled and clicking the text does not focus it. Every
form here had that until a `getByLabel()` query in the end-to-end test could not
find a single input.

`Field` generates the id with `useId()` and clones it onto its child, so a caller
cannot forget. It also **detects whether the child is a form control** and falls
back to `fieldset`/`legend` when it is not — because a `Field` wrapping a `Row` of
two inputs put the id on a `<div>` and reintroduced the same dangling `for` one
level up. Pass `group` explicitly for a set that is not one input (the
qualification chips, the subject tags), and give each control inside its own
`aria-label`.

Use `components/common/Drawer` for every side panel. Three screens had hand-rolled
one as a `<div>` plus an overlay, which looks right and behaves wrong: no dialog
role, so Tab walked out of it into the list behind the overlay where every control
is invisible but still focusable; no Escape; and nothing for a test to scope to —
a query for "the Verified button" matched the filter tab behind the overlay. The
shared one carries `role="dialog"`, `aria-modal`, Escape, body-scroll lock, and
returns focus to whatever opened it.

## 8. Running it

```bash
cp .env.example .env.local        # points at http://localhost:8000 by default
npm install
npm run dev                       # the API must be running — see ../be/README.md
npm run build && npm run lint     # both must be clean before a commit
```

`npm run build` type-checks with Next's generated route types, which are stricter
than a bare `tsc --noEmit`: `useSearchParams()` is `… | null` and `usePathname()`
is `string | null` there. **Run the build, not just tsc.**

### End-to-end

```bash
npm install --no-save playwright-core     # drives the system Chrome
node scripts/e2e-teacher.mjs              # with the API and the site running
```

22 checks through a real browser: registering with a password, the four matching
questions, that a PGT Physics teacher is matched to the PGT Physics post and not to
an unrelated one, that applying with no CV redirects to the documents section, the
upload, applying, the application appearing at the right stage, the vacancy then
refusing a second application, and the role guard bouncing a signed-out visitor to
`/login?next=…`.

It asserts there are no unhandled JS errors, filtering Chrome's "Failed to load
resource" line — the run deliberately provokes one 400 (applying with no CV) which
the app handles.

## 9. What is built

All of it: the public website, `/login` and `/register`, and the three workspaces —
teacher, institution and the office's panel. 32 routes.

Three browser suites, 69 checks between them, plus the backend's 58:

```bash
npm install --no-save playwright-core
node scripts/e2e-teacher.mjs   # register → profile → CV → apply → the guard
node scripts/e2e-school.mjs    # register → post → held as a draft → publish → demo
node scripts/e2e-panel.mjs     # verify a document and an institution → publish and
                               # notify → the push gate → a brand colour reaching the site
```

Run them in that order the first time — the school suite applies as the teacher the
first one creates, and the panel suite verifies them both. They are idempotent
after that.

Next is the Android app, against the same API.
