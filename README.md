# Mant Bridges LTD — platform

Django REST Framework backend plus a React (Vite) frontend in one repository.

```
backend/          Django 5 + DRF + SimpleJWT. Owns all business logic, permissions and PDFs.
  apps/core        company profile, lookups/vocabularies, health, PDF helpers, seed_demo
  apps/accounts    email login, roles (ADMIN / LANDLORD / TENANT), profile, password change
  apps/properties  listings, images, public search facets, enquiries
  apps/blog        public posts/categories + admin endpoints
  apps/leases      tenancies, lease numbering, statements, invoice generation
  apps/billing     invoices, payments, receipts, late fees, analytics, PDFs
  apps/messaging   conversations, messages, attachments, unread counts
  config/settings.py reads everything from backend/.env
frontend/         React 18 + Vite 5 + react-router 6, talking to the API over /api
  src/api         one module per domain + client.js (auth, errors, uploads, downloads)
  src/context     AuthContext (JWT + role), LookupContext (server vocabularies), CompanyContext
  src/hooks       useApi, useList, useAction, useDebounce
  src/components  ui/ design-system primitives, layout/, properties/, billing/, messaging/
  src/pages       public/, auth/, account/, manage/ (admin+landlord), portal/ (tenant), shared/
  src/styles/global.css   the whole design system (navy/red/ink tokens, layout, tables, forms)
```

## Prerequisites

- Python 3.11+ (developed and verified on 3.13 in `backend/.venv`)
- Node 18+ and npm (verified on Node 24.18)
- No database server needed for local work (SQLite by default)

## Backend

```bash
cd backend
python -m venv .venv
.venv/Scripts/pip install -r requirements.txt        # Windows
# source .venv/bin/activate && pip install -r requirements.txt   # macOS/Linux
copy .env.example .env                               # cp on macOS/Linux — never overwrite a real .env
.venv/Scripts/python manage.py migrate
.venv/Scripts/python manage.py seed_demo             # realistic Kampala demo data
.venv/Scripts/python manage.py runserver 8000
```

`seed_demo` is idempotent ("safe to run more than once", every row is `get_or_create`) and prints
the logins it created. `--password` overrides the default; `--no-images` skips generating listing
photos.
Interactive admin is at `http://127.0.0.1:8000/django-admin/`, OpenAPI docs at
`http://127.0.0.1:8000/api/docs/`, schema at `/api/schema/`.

### `backend/.env`

| Variable | Purpose |
| --- | --- |
| `DJANGO_SECRET_KEY` | generate one, never commit it |
| `DJANGO_DEBUG` | `True` locally only |
| `DJANGO_ALLOWED_HOSTS` | comma-separated |
| `DJANGO_TIME_ZONE` | defaults to `Africa/Kampala` |
| `DB_ENGINE` | `sqlite` (default) or `postgresql`; then `DB_NAME/USER/PASSWORD/HOST/PORT` |
| `CORS_ALLOWED_ORIGINS` | browser origins allowed to call the API directly |
| `EMAIL_BACKEND`, `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD`, `EMAIL_USE_TLS`, `DEFAULT_FROM_EMAIL` | console backend in development |
| `PUBLIC_SITE_URL` | origin used for the links inside newsletter emails; must be the public site in production |
| `NEWSLETTER_CONFIRM_HOURS` | how long a confirmation link stays valid (default 72) |
| `NEWSLETTER_SUBSCRIBE_RATE`, `NEWSLETTER_TOKEN_RATE` | per-IP DRF rate limits on the public newsletter endpoints |
| `LOG_LEVEL` | root logger level |

`.gitignore` already excludes `.env`, `db.sqlite3`, `media/`, `.venv/`, `node_modules/`, `dist/`.

## Frontend

```bash
cd frontend
npm install
npm run dev            # http://127.0.0.1:5173
npm run build          # production bundle into dist/
npm run preview        # serve dist/ on 4173
```

In development Vite proxies `/api` and `/media` to `http://127.0.0.1:8000`, so the browser stays
same-origin: no CORS preflight, no absolute media URLs, uploaded images resolve as-is.

| Variable | Purpose |
| --- | --- |
| `VITE_BACKEND_URL` | move the dev proxy if Django runs elsewhere |
| `VITE_MEDIA_BASE_URL` | prefix media with a CDN/object-store origin in production |
| `VITE_API_BASE_URL` | API origin when the SPA is not served behind the same host |

Media is portable by design: the API returns `request.build_absolute_uri()` paths, and
`frontend/src/utils/media.js` reduces them to a pathname and re-prefixes only if
`VITE_MEDIA_BASE_URL` is set. No component hardcodes `localhost:8000`.

### Demo logins (`seed_demo` default password `MantDemo@2026`)

| Role | Email | Lands on |
| --- | --- | --- |
| ADMIN | `admin@mantbridges.com` | `/manage` |
| ADMIN (ops) | `ops@mantbridges.com` | `/manage` |
| LANDLORD | `landlord@mantbridges.com` | `/manage` (own scope) |
| LANDLORD | `aisha@mantbridges.com` | `/manage` (own scope) |
| TENANT | `tenant@mantbridges.com` | `/portal` |

## Scheduled jobs

All three exist and are idempotent, but nothing runs them yet — put them on cron / Task Scheduler
(see `BACKEND_FOLLOWUPS.md`, item 11):

```bash
python manage.py mark_overdue                       # expire leases, flag overdue, apply late fees
python manage.py generate_invoices                  # bill active tenancies up to today
python manage.py generate_invoices --months 1
python manage.py send_email_campaign --limit 200     # walk queued campaigns, a slice per run
python manage.py send_email_campaign --campaign 4 --passes 5 --delay 0.5
```

`send_email_campaign` claims a queued campaign atomically, so a second run started while the first is
still going reports that the campaign is held and does nothing. Re-running it resumes the same
campaign where it stopped; each recipient gets at most 3 attempts before it is marked failed.

## API surface consumed by the frontend

95 endpoints under `/api` (enumerated from the URLconf). Groups the SPA uses daily:

- `GET /api/company/`, `/api/lookups/`, `/api/health/` — profile, vocabularies, liveness
- `/api/properties/` (+`featured/`, `cities/`, `stats/`, `<slug>/`) — public catalogue, hidden
  unless `is_published` and `status=AVAILABLE`
- `/api/blog/posts/`, `/api/blog/categories/` (+`featured/`, `latest/`, `tags/`) — public blog
- `POST /api/enquiries/` — public contact form
- `POST /api/newsletter/{subscribe,confirm,unsubscribe}/` — public double opt-in, throttled per IP
- `POST /api/auth/{register,login,refresh,me,change-password}/` — JWT; refresh rotates
- `/api/manage/{properties,property-images,posts,blog-categories,enquiries,users}/`,
  `/api/manage/properties/stats/`, `/api/manage/posts/stats/` — staff CRUD (role-gated)
- `/api/leases/` (+`options/`, `stats/`, `{id}/generate-invoices/`, `{id}/statement/`)
- `/api/invoices/` (+`generate/`, `summary/`, `{id}/{pdf,remind,apply-late-fee}/`)
- `/api/payments/` (+`summary/`, `{id}/{confirm,reject}/`), `/api/receipts/` (+`{id}/{download,void}/`)
- `/api/statements/`, `/api/analytics/` — server-aggregated reporting
- `/api/conversations/` (+`recipients/`, `unread-count/`, `{id}/{messages,mark-read,close}/`)
- `/api/manage/email/subscribers/` (+`stats/`, `{id}/{suppress,reactivate}/`) — admin view of the
  mailing list. Read and annotate only: no create, no `PUT`, no delete, and `notes` is the single
  writable field. Token hashes are not serialized.
- `/api/manage/email/campaigns/` (+`stats/`, `audience-count/`, `{id}/{preview,recipients,test,queue,cancel}/`)
  — admin drafts. Nothing here sends a campaign; `queue/` only freezes the audience.

Two conventions matter when extending the UI:

1. Pagination is fixed at 12 and `page_size` is not accepted, so option pickers page through
   everything with `collect(getter, params, pages)` from `api/paginate.js`.
2. Financial numbers come from the server. `Invoice.effective_status`, `total_display`, `balance`
   and the analytics payload are rendered as returned — nothing is re-derived in JavaScript.

## Routes

Complete and wired to real data:

`/` · `/properties` · `/properties/:slug` · `/services` · `/services/:slug` · `/about` ·
`/blog` · `/blog/:slug` · `/careers` · `/contact` ·
`/newsletter/confirm?token=…` · `/newsletter/unsubscribe?token=…` ·
`/login` · `/register` · `/manage` · `/manage/reports` ·
`/manage/properties` (+`new`, `:id/edit`) · `/manage/leases` (+`new`, `:id/edit`) ·
`/manage/invoices` (+`:id`) · `/manage/payments` · `/manage/receipts` · `/manage/messages` ·
`/manage/profile` · `/manage/password` · `/manage/users` · `/manage/enquiries` ·
`/manage/posts` (+`new`, `:id/edit`) · `/manage/categories` · `/manage/email/campaigns` ·
`/manage/email/subscribers` · `/manage/company` ·
`/portal` · `/portal/leases` · `/portal/statement` · `/portal/invoices` (+`:id`) ·
`/portal/payments` · `/portal/receipts` · `/portal/messages` · `/portal/profile` ·
`/portal/password`

Built but deliberately limited, because the backend does not support more:

- `/careers` — shows role categories and says there are no advertised vacancies and no
  application tracking. No fake form. (follow-up 6)
- Password reset — the login page says it is unavailable and points to the desk. (follow-up 1)
- Email/identity verification — registration activates immediately and says so. (follow-up 3)
- Landlord lease form — cannot pick a brand-new tenant; explains why instead of showing an
  empty picker. (follow-up 4)
- Landlord cannot open the enquiry inbox; the route is admin-only. (follow-up 5)
- Payments are never taken online. Recording one creates a PENDING entry awaiting desk
  confirmation; the tenant portal shows the company's bank/mobile-money instructions.
- Logout clears the browser session but cannot revoke the token server-side. (follow-up 2)

## Newsletter and campaigns

Public sign-up is live, campaign drafts are live, and bulk sending is batched through a command.
No provider is configured here, so no message has ever reached an inbox
(see `BACKEND_FOLLOWUPS.md`, item 16).

- Model `NewsletterSubscription` (`apps/core/models.py`, migration `core.0003`) keeps one row per
  normalised address with statuses `PENDING_CONFIRMATION`, `SUBSCRIBED`, `UNSUBSCRIBED`,
  `SUPPRESSED`, `BOUNCED`, plus consent/confirmation/unsubscribe timestamps.
- `apps/core/services/newsletter.py` issues the confirmation token with `secrets.token_urlsafe`,
  stores only its SHA-256 hash, expires it after `NEWSLETTER_CONFIRM_HOURS` and clears the hash on
  use, so a link works once. Unsubscribe links are an HMAC of the address, so they stay valid across
  later emails without storing a recoverable token, and they need no login.
- `POST /api/newsletter/subscribe/` answers with the same body and 200 whether the address is new,
  already subscribed or blocked, so it cannot be used to enumerate subscribers. Consent is required
  and status overrides are not accepted. Both public endpoints are throttled per IP
  (`apps/core/throttles.py`).
- A previous unsubscribe is only reversed by signing up again *and* clicking a fresh confirmation
  link. `SUPPRESSED` and `BOUNCED` addresses are never re-activated by the web form — an
  administrator has to start that from `/manage/email/subscribers` (or `/django-admin/`), and even
  then the address stays pending until its owner clicks the new link. Token hashes are never
  serialized out of either screen.
- The subscribe box appears as a navy band on the homepage and as a card after the body of every
  article (`components/common/NewsletterSignup.jsx`); the emailed links land on
  `/newsletter/confirm` and `/newsletter/unsubscribe`, which post the token straight back to Django.

### Campaigns

`EmailCampaign` + `EmailCampaignRecipient` (migration `core.0004`) and
`apps/core/services/campaigns.py` are the whole sending path;
`User.marketing_opt_in` / `marketing_opt_in_at` (migration `accounts.0002`) is the consent record
for the three account audiences, and it is stamped and cleared in `/django-admin/` rather than by
the person editing a campaign.

- `/manage/email/campaigns` composes a draft, asks the server how many people the audience selection
  actually reaches (`POST /api/manage/email/campaigns/audience-count/`), previews the rendered
  message and can hand a `[TEST]` copy to the mail server. None of those calls mail the list.
- Queueing resolves the audiences once, merges duplicate addresses, drops anything suppressed,
  freezes the recipient rows and marks the campaign `QUEUED`. The draft stops being editable there.
  The HTTP request never loops over recipients; `manage.py send_email_campaign` does, in slices.
- Recipient statuses are `PENDING`, `ACCEPTED`, `FAILED` and `SKIPPED`. **`ACCEPTED` means the mail
  server took the message** — this platform records no delivery, open or click events, because no
  provider has confirmed any, so the UI says exactly that.
- Campaign bodies are plain text split on blank lines; the branded header, greeting and
  unsubscribe footer come from `apps/core/templates/email/campaign_email.{txt,html}`, with the HTML
  side autoescaped.
- Blog-to-newsletter distribution, per-user preferences and provider bounce/complaint webhooks are
  still open — see `BACKEND_FOLLOWUPS.md` 16.

**Before real sending works:** point `EMAIL_BACKEND` at an SMTP or transactional provider with
verified credentials, set `DEFAULT_FROM_EMAIL` to an address on a domain with SPF, DKIM and DMARC
records, set `PUBLIC_SITE_URL` to the public origin, and schedule `send_email_campaign` (or replace
it with a queue worker). While `EMAIL_BACKEND` is not `smtp.EmailBackend` the campaigns screen shows
which backend is live and states that nothing can reach an inbox; the automated tests use the
in-memory backend and assert on `mail.outbox`.

## Security notes (read before deploying)

- **JWT lives in `localStorage`** (`mb.access`, `mb.refresh`, `mb.user`). Any XSS can read it, and
  there is no blacklist, so a token outlives "sign out". Migrate to `httpOnly` cookies +
  `token_blacklist` for real production.
- **React route guards are UX only.** `ProtectedRoute` / role checks hide links and redirect; every
  endpoint re-checks permissions in Django. Nothing in the UI is a security boundary.
- **No throttling on `POST /api/auth/login/`** — unlimited password guessing.
- **`GET /api/company/` is public** and currently includes bank account number, mobile-money
  number, document prefixes, grace period and late-fee policy. The tenant portal only needs the
  payment instructions; split the payload (follow-up 12).
- `national_id`, `tin` and passwords are never serialized out; `password` is write-only. Keep it
  that way if you add a tenant directory.
- `DEBUG`, `SECRET_KEY`, DB engine and CORS come from `.env`. Production also needs real
  `ALLOWED_HOSTS`, `python manage.py collectstatic`, a non-local media store and HTTPS.
- `manage.py runserver` is a development server. If you start it with `--noreload`, remember it
  will not pick up backend edits — that cost a debugging cycle here.

## Verification status

`npm run build` → `✓ 2085 modules transformed`, `dist/assets/index-*.js` 566 kB (gzip 160 kB),
`✓ built in 5.1s`. `python manage.py test` → **Ran 54 tests … OK** (51 s; system check reported no
issues). All 54 live in `apps/core/tests.py`: 10 services, 12 newsletter double opt-in, 17 campaign
engine, 15 admin email API. The campaign tests run on a throw-away database with Django's
in-memory email backend — nothing in the suite can reach a real mailbox, and `db.sqlite3` is not
touched by them.

The dashboard, portal and public pages were exercised in a real browser against the running API:
sign-in as each role, property create/edit with photo upload and cover switch, lease create and
invoice generation, invoice detail → PDF → reminder → late fee, payment record → confirm → receipt
PDF → void, enquiry submit → inbox → status change, blog draft → publish → unpublish, categories
and user CRUD, messaging, and the tenant portal including a brand-new tenant with no leases (empty
states). The newsletter band and article card were exercised the same way: consent-off and
invalid-address validation, the server's neutral success message, a confirmation link that activated
the row exactly once, and an unsubscribe link that required no login. Console stayed clean apart
from two React Router v7 future-flag warnings.

The email screens were checked against the **running dev server** but over HTTP, not by clicking
through them: opening `/manage/email/campaigns` signed in as the landlord rendered the
"This area is not open to your account" panel, the landlord sidebar had no Email section at all, and
the landlord JWT was refused with 403 by the subscriber list, the campaign list and campaign stats.
As admin: subscriber and campaign
lists, both `stats/` payloads, filter + search, `audience-count` (200 for valid audiences, 400 with
a field error for a bogus one), draft create → PATCH → `preview/` → `recipients/` → `queue/` refused
with 400 because the audience was empty, `GET …/test/` → 405, `POST`/`PUT`/`DELETE` on the
subscriber list → 405. The live install reports `email_backend: "console.EmailBackend"` and
`sends_real_mail: false`, which is the banner the campaigns screen renders. The smoke draft created
for that check was deleted afterwards; the tables are empty again.

**Not verified:** the campaign screens clicked through in a browser as an ADMIN (the automation
browser was refused by permission in this session — the render path, the modals and the queue/cancel
affordances are covered by tests and by a clean build, not by a screenshot); a real campaign run of
`send_email_campaign` against live data, because there are no confirmed subscribers on this install;
desktop-width rendering of the newsletter band (the automation browser sat at a 543×426 viewport, so
only the stacked mobile layout was screenshotted and measured); delivery of a real email —
`EMAIL_BACKEND` here is the console backend, so no message has ever reached an inbox; the company
logo upload (it would overwrite the real file); and any production deployment steps.

**Placeholder assets:** `frontend/public/images/{kampala,landlord,contracting}.jpg` are
AI-generated stand-ins, not Mant Bridges photography. Replace them before launch.
