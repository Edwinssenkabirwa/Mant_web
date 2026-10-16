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

`/` · `/properties` · `/properties/:slug` · `/services` · `/about` · `/blog` · `/blog/:slug` ·
`/careers` · `/contact` · `/login` · `/register` · `/manage` · `/manage/reports` ·
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

`npm run build` → `✓ 2076 modules transformed`, `dist/assets/index-*.js` ≈ 535 kB (gzip 153 kB),
`✓ built in 4.4s`. `python manage.py check` → no issues.

The dashboard, portal and public pages were exercised in a real browser against the running API:
sign-in as each role, property create/edit with photo upload and cover switch, lease create and
invoice generation, invoice detail → PDF → reminder → late fee, payment record → confirm → receipt
PDF → void, enquiry submit → inbox → status change, blog draft → publish → unpublish, categories
and user CRUD, messaging, and the tenant portal including a brand-new tenant with no leases (empty
states). Console stayed clean apart from two React Router v7 future-flag warnings.

**Not verified:** visual/screenshot checks (the automation browser reports a hidden viewport, so
pixel rendering and responsive breakpoints were not confirmed), the company logo upload (it would
overwrite the real file), and any production deployment steps.

**Placeholder assets:** `frontend/public/images/{kampala,landlord,contracting}.jpg` are
AI-generated stand-ins, not Mant Bridges photography. Replace them before launch.
