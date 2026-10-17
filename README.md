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

Both exist and are idempotent, but nothing runs them yet — put them on cron / Task Scheduler
(see `BACKEND_FOLLOWUPS.md`, item 11):

```bash
python manage.py mark_overdue            # expire leases, flag overdue, apply late fees
python manage.py generate_invoices       # bill active tenancies up to today
python manage.py generate_invoices --months 1
```

## API surface consumed by the frontend

71 endpoints under `/api`. Groups the SPA uses daily:

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
`/manage/posts` (+`new`, `:id/edit`) · `/manage/categories` · `/manage/company` ·
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

## Newsletter (double opt-in)

Public sign-up is live; bulk campaigns are not (see `BACKEND_FOLLOWUPS.md`).

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
  administrator has to change them in `/django-admin/`, where the token hashes are not shown.
- The subscribe box appears as a navy band on the homepage and as a card after the body of every
  article (`components/common/NewsletterSignup.jsx`); the emailed links land on
  `/newsletter/confirm` and `/newsletter/unsubscribe`, which post the token straight back to Django.
- Nothing is sent to a subscriber today: only the confirmation email exists. Campaign sending,
  blog-to-newsletter distribution and delivery reporting still need a queue and a provider.

**Before real sending works:** point `EMAIL_BACKEND` at an SMTP or transactional provider with
verified credentials, set `DEFAULT_FROM_EMAIL` to an address on a domain with SPF, DKIM and DMARC
records, set `PUBLIC_SITE_URL` to the public origin, and put bulk mail behind a queue — the
confirmation email is sent inside the request, which is fine for one message and wrong for thousands.
While `EMAIL_BACKEND` is the console backend nothing leaves the machine; the automated tests use the
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

`npm run build` → `✓ 2082 modules transformed`, `dist/assets/index-*.js` ≈ 545 kB (gzip 155 kB),
`✓ built in 4.0s`. `python manage.py check` → no issues. `python manage.py test` → 22 tests, OK
(10 services, 12 newsletter).

The dashboard, portal and public pages were exercised in a real browser against the running API:
sign-in as each role, property create/edit with photo upload and cover switch, lease create and
invoice generation, invoice detail → PDF → reminder → late fee, payment record → confirm → receipt
PDF → void, enquiry submit → inbox → status change, blog draft → publish → unpublish, categories
and user CRUD, messaging, and the tenant portal including a brand-new tenant with no leases (empty
states). The newsletter band and article card were exercised the same way: consent-off and
invalid-address validation, the server's neutral success message, a confirmation link that activated
the row exactly once, and an unsubscribe link that required no login. Console stayed clean apart
from two React Router v7 future-flag warnings.

**Not verified:** desktop-width rendering of the newsletter band (the automation browser sat at a
543×426 viewport, so only the stacked mobile layout was screenshotted and measured), delivery of a
real email — `EMAIL_BACKEND` here is the console backend, so no message has ever reached an inbox —
the company logo upload (it would overwrite the real file), and any production deployment steps.

**Placeholder assets:** `frontend/public/images/{kampala,landlord,contracting}.jpg` are
AI-generated stand-ins, not Mant Bridges photography. Replace them before launch.
