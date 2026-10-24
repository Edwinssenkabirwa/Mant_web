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
  src/pages       public/, auth/, account/, manage/ (admin), landlord/ (owner portal),
                  portal/ (tenant), shared/
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

### Service entries

The website advertises five offers — **Rent collection & property management · Real estate ·
Contracting & lobbying · Land & property documentation · Debt recovery** — in that published order,
and their wording comes from the database, never from a list hard-coded in React. `seed_services`
creates them by slug and leaves any existing row exactly as an administrator set it; pass `--update`
to refresh a live database from the seeder after a deliberate copy change. `attach_service_images`
puts the matching illustration from `backend/seed_images/services/<slug>.jpg` onto a service that has
no picture yet, without touching an uploaded photograph; `--replace SLUG` is the only way an existing
picture is swapped. `Service.icon` is a whitelisted key that the frontend maps to its own icon set, so
a value outside the list renders no badge. Migration `core.0006` folded the rows seeded before the
brochures into the four brochure offers, `core.0008` relabelled them and re-added land documentation
as a published fifth service.

The badge under each offer is building / keys / landmark / document / coins. The service-page artwork
is AI-rendered and labelled illustrative in `Service.image_alt`: an apartment block, a plot of land
for sale, a contractor reviewing drawings on site, a land-transaction file and stacked US dollar
bundles. They are not crops of the shared flyer, which is 904×1280 — each of its service pictures is
only about 200×110 px and would not survive the banner on the service page.

Service copy is written in a small markdown-like dialect that `ServiceView` parses: a `## ` line
becomes a subheading, consecutive `- ` lines become a bulleted list, and a blank line separates
paragraphs. Nothing else (bold, links, numbered lists) is rendered, and administrators are free to
write plain prose instead.

Administrators write it at `/manage/services`. The list publishes, unpublishes and re-orders with
single-field PATCH calls, so saved wording is never resent, and `pages/manage/ServiceForm.jsx` holds
the whole record. The editor counts the headings, lists and paragraphs a draft will produce using the
same `parseBlocks` the page renders with, so the counters cannot disagree with the site.
`/manage/services/:id/preview` opens a draft through the admin endpoint — the only way to read an
unpublished page, since its public address answers 404 until it is published.

No public page prints a disclaimer. `Service.limitations` still stores the hedging for staff — the
editor labels it "Notes for the desk" and says so — but the service cards and service pages stopped
rendering the "Honest limits" note, and migration `core.0009` removed the two body sections that read
the same way: "The line we hold" on debt recovery and "Where our role stops" on land documentation.

### Listing artwork

`backend/seed_images/properties/<slug>.jpg` holds one AI-generated render per listing that has no
photograph of its own. `python manage.py attach_illustrative_images` matches each file to its listing
by slug and attaches it as a `PropertyImage` with `is_illustrative=True`, the caption "Illustrative
render — not a photograph of this property." and alt text naming the title; `--dry-run` reports the
matches, and a listing that already has an illustrative render is skipped, so the command is safe to
re-run. Nothing is deleted, and the public listing page plus the search card print an "Illustrative
render" badge straight from that flag.

One caution when adding a render to a listing that already has photographs: `PropertyImage.save()`
keeps exactly one primary per listing, so the new render takes the cover. Run `--dry-run` first, and
use the desk's cover switch on the listing if an owner's photograph should stay on top.

### `backend/.env`

Uploads do not live in `backend/media/` any more. `STORAGES["default"]` is
`apps.core.storage_backends.SupabasePublicMediaStorage` (bucket `mant-public-media`), and the receipt
PDF and chat-attachment fields are bound to `SupabasePrivateFilesStorage` (bucket
`mant-private-media`, signed GETs that expire after 300 seconds). The app therefore will not start at
all without the two `SUPABASE_S3_*` keys, because those storage objects are built when the models are
imported.

| Variable | Purpose |
| --- | --- |
| `DJANGO_SECRET_KEY` | generate one, never commit it |
| `DJANGO_DEBUG` | `True` locally only. Unset on Vercel it defaults to `False`, and the app then refuses to boot until the PostgreSQL variables are present |
| `DJANGO_ALLOWED_HOSTS` | comma-separated, no scheme. On Vercel the platform's own `VERCEL_URL` / `VERCEL_PROJECT_PRODUCTION_URL` hosts are appended automatically; anything else you serve has to be listed here |
| `DJANGO_TIME_ZONE` | defaults to `Africa/Kampala` |
| `DB_ENGINE` | `sqlite` (default) or `postgresql`; then `DB_NAME/USER/PASSWORD/HOST/PORT`. `DJANGO_DEBUG=False` requires `postgresql` |
| `DJANGO_DB_DISABLE_SERVER_SIDE_CURSORS` | `True` in the PostgreSQL branch, which is what Supabase's transaction pooler needs; set `False` only on a session pooler you have tested |
| `DJANGO_DB_CONN_MAX_AGE` | `0` by default: one connection per request, for hosts that freeze between requests |
| `SUPABASE_S3_ACCESS_KEY_ID`, `SUPABASE_S3_SECRET_ACCESS_KEY` | required; Supabase Storage's S3 credentials |
| `SUPABASE_S3_REGION`, `SUPABASE_S3_ENDPOINT_URL` | default to `eu-west-1` and the project's `/storage/v1/s3` endpoint |
| `CORS_ALLOWED_ORIGINS` | browser origins allowed to call the API directly |
| `EMAIL_BACKEND`, `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD`, `EMAIL_USE_TLS`, `DEFAULT_FROM_EMAIL` | console backend in development |
| `PUBLIC_SITE_URL` | origin used for the links inside newsletter emails; must be the public site in production |
| `NEWSLETTER_CONFIRM_HOURS` | how long a confirmation link stays valid (default 72) |
| `NEWSLETTER_SUBSCRIBE_RATE`, `NEWSLETTER_TOKEN_RATE` | per-IP DRF rate limits on the public newsletter endpoints |
| `LOG_LEVEL` | root logger level |

Note on the two local env files: `settings.py` loads `backend/.env` and then `backend/.env.supabase`
with `override=False`, so the first file wins wherever they both name a variable — which is why
`DB_ENGINE=sqlite` in `.env` keeps this machine on SQLite. Both files are gitignored and neither is
deployed; a hosted deployment gets its environment from the platform's project settings.

Production switches, all of which default to the development behaviour and are documented in
`DEPLOYMENT.md` section 4 and `VERCEL_DEPLOYMENT.md` section 2:

| Variable | Purpose |
| --- | --- |
| `CORS_ALLOW_CREDENTIALS` | now `False` unless set — the SPA authorises with a Bearer header, never cookies |
| `CSRF_TRUSTED_ORIGINS` | explicit `https://` origins, only if something sends cookies across origins |
| `DJANGO_TRUSTED_SSL_HEADER` | `header,value` (e.g. `HTTP_X_FORWARDED_PROTO,on`) so media and email links are built as `https` behind the host's SSL termination. Unset by default: trusting a header the front end does not set is a vulnerability, not a shortcut |
| `DJANGO_API_DOCS` | serves `/api/schema/` and `/api/docs/`. Follows `DEBUG`, so production 404s them unless you ask — they list every route the platform has |
| `DJANGO_SECURE_SSL_REDIRECT`, `DJANGO_SECURE_HSTS_SECONDS` | both off in production until HTTPS is proved by hand; the first loops the site behind a proxy that reports plain http, the second is cached by browsers and cannot be recalled |
| `DJANGO_MAX_UPLOAD_MB` | ceiling for an upload and for the whole request body, 15 by default. Set `4` on Vercel, whose functions reject a body over 4.5 MB before Django sees it |

`DJANGO_SECRET_KEY` is now fatal-if-wrong: with `DJANGO_DEBUG=False` and a missing, short or
development key, Django raises `ImproperlyConfigured` at import instead of booting in a state you
would not want public. So is the database: production on `sqlite`, or on `postgresql` with any of
`DB_NAME/USER/PASSWORD/HOST` blank, raises the same way rather than 500-ing per request.

`.gitignore` already excludes `.env`, `.env.*` (except `.env.example`), `db.sqlite3`, `media/`,
`.venv/`, `node_modules/`, `dist/`.

## Frontend

```bash
cd frontend
npm install
npm run dev            # http://127.0.0.1:5173
npm run build          # production bundle into dist/
npm run preview        # serve dist/ on 4173
```

In development Vite proxies `/api` and `/media` to `http://127.0.0.1:8000`, so the browser stays
same-origin for JSON calls and no CORS preflight happens. Uploads themselves no longer come from that
proxy: they are absolute Supabase object URLs.

| Variable | Purpose |
| --- | --- |
| `VITE_BACKEND_URL` | move the dev proxy if Django runs elsewhere — read from the shell by `vite.config.js`, not from a `.env` file |
| `VITE_API_BASE_URL` | API origin when the SPA is not served behind the same host, e.g. `https://<api-host>/api` |
| `VITE_MEDIA_BASE_URL` | only prefixes a *relative* `/media/...` path; unnecessary while Django hands out absolute bucket URLs |

The last two are baked into the bundle at build time, so they belong in `frontend/.env.production`
created *before* `npm run build`, or in the host's project environment. Anything `VITE_`-prefixed is
visible to every visitor — public configuration only. See `frontend/.env.example`.

`public/.htaccess` ships inside `dist/` and is what makes a refresh on `/properties/<slug>` render the
page instead of a 404 on Apache; it excludes `/api`, `/media`, `/static` and `/django-admin` on
purpose, because those falling through to `index.html` turns every JSON call into a 200 full of HTML.
On Vercel the same fallback comes from `frontend/vercel.json`, and the `.htaccess` file is inert.

Media is portable by design: the API returns `request.build_absolute_uri()` addresses, and
`frontend/src/utils/media.js` passes an absolute URL through untouched — which matters twice over now,
because a signed receipt or attachment URL loses its authorisation the moment its query string is
stripped. Only a path beginning with `/` is re-prefixed, and then only when `VITE_MEDIA_BASE_URL` is
set. No component hardcodes `localhost:8000`.

### Demo logins (`seed_demo` default password `MantDemo@2026`)

| Role | Email | Lands on |
| --- | --- | --- |
| ADMIN | `admin@mantbridges.com` | `/manage` |
| ADMIN (ops) | `ops@mantbridges.com` | `/manage` |
| LANDLORD | `landlord@mantbridges.com` | `/landlord` (own book, read-only) |
| LANDLORD | `aisha@mantbridges.com` | `/landlord` (own book, read-only) |
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

Nothing schedules them on Vercel: a request-driven Function has no cron and stops existing between
requests, and there is no HTTP endpoint that runs a command. That is documented as an open item in
`VERCEL_DEPLOYMENT.md` section 8 rather than quietly dropped — the rent-reminder job in
`apps/billing/reminders.py` is in the same class.

## API surface consumed by the frontend

109 distinct routes under `/api` — enumerated from the URLconf with `django.urls.get_resolver()` and
the format-suffix duplicates dropped. Groups the SPA uses daily:

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
- `/api/invoices/` (+`generate/`, `summary/`, `{id}/{pdf,remind,whatsapp-reminder,apply-late-fee}/`)
- `/api/reminders/` (+`{id}/opened/`) — the desk's own record of every rent reminder raised; admin
  read-only, `?invoice=` scopes it to one invoice
- `/api/payments/` (+`summary/`, `{id}/{confirm,reject}/`), `/api/receipts/` (+`{id}/{download,void}/`)
- `/api/statements/`, `/api/analytics/` — server-aggregated reporting
- `/api/conversations/` (+`recipients/`, `unread-count/`, `{id}/{messages,mark-read,close}/`)
- `/api/manage/email/subscribers/` (+`stats/`, `{id}/{suppress,reactivate}/`) — admin view of the
  mailing list. Read and annotate only: no create, no `PUT`, no delete, and `notes` is the single
  writable field. Token hashes are not serialized.
- `/api/manage/email/campaigns/` (+`stats/`, `audience-count/`, `{id}/{preview,recipients,test,queue,cancel}/`)
  — admin drafts. Nothing here sends a campaign; `queue/` only freezes the audience.
- `/api/manage/services/` — full admin CRUD for the website's services. The list and detail routes
  are the standard five verbs, so a picture is replaced with a **multipart PATCH** to
  `/api/manage/services/{id}/` (POST there answers 405) while the wording is saved as JSON; the API
  tests in `apps/core/tests.py` cover exactly that pair.

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
`/manage/invoices` (+`:id`) · `/manage/reminders` · `/manage/payments` · `/manage/receipts` ·
`/manage/messages` ·
`/manage/profile` · `/manage/password` · `/manage/users` · `/manage/enquiries` ·
`/manage/posts` (+`new`, `:id/edit`) · `/manage/categories` ·
`/manage/services` (+`new`, `:id/edit`, `:id/preview`) · `/manage/email/campaigns` ·
`/manage/email/subscribers` · `/manage/company` · `/manage/recommendations` ·
`/landlord` · `/landlord/properties` · `/landlord/recommendations` (+`new`, `:id/edit`) ·
`/landlord/messages` · `/landlord/profile` ·
`/landlord/password` ·
`/portal` · `/portal/leases` · `/portal/statement` · `/portal/invoices` (+`:id`) ·
`/portal/payments` · `/portal/receipts` · `/portal/messages` · `/portal/profile` ·
`/portal/password`

The whole `/manage` area is ADMIN-only since the landlord portal was cut over. A landlord who
opens `/manage/invoices` gets the "This area is not open to your account" panel, and the same
request is refused by Django with 403 whether or not the browser was told.
`/landlord` reads `/api/landlord/overview/`, which returns aggregates of that owner's own book —
collection trend, occupancy and a per-property collected/outstanding split — and never an
invoice, payment, receipt, lease or tenant detail. His properties page is read-only: no create,
edit, publish, feature or delete affordance is rendered, and the same writes are refused by the
API. A landlord has no listing form at all; new properties reach the catalogue only as
recommendations (below).

## Property recommendations and verification

An owner recommends; only the office publishes. The whole path is `apps/properties/`:

- `PropertyRecommendation` (migration `properties.0003`) holds the owner's answers — what the
  property is, whether it is to rent, for sale or both, the size, his own price expectation, where
  it sits, how it relates to him, who to call to view it — and its status: `DRAFT`, `SUBMITTED`,
  `IN_REVIEW`, `VERIFIED`, `DECLINED`.
- `/landlord/recommendations` (`pages/landlord/Recommendations.jsx` + `RecommendationForm.jsx`) lets
  him keep as many forms as he wants. A DRAFT is his private working copy: the desk's queue excludes
  drafts unless someone deliberately asks for `?status=DRAFT`. "Send to the desk" saves the screen
  first and then posts `…/submit/`, and `submit_recommendation()` refuses anything still missing a
  title, description, offer type, kind, address, town or ownership — the missing items are named in
  the 400 and listed under each row.
- `/manage/recommendations` (`pages/manage/Recommendations.jsx`) is the desk's queue: tabs with live
  counts from `stats/`, search across the owner's name, title, address and plot reference, a
  "Due diligence" step (`SUBMITTED → IN_REVIEW`), and a decision modal that shows every answer
  before it asks for one. **Verify publishes immediately** — `verify_recommendation()` creates the
  `Property` in one transaction, owned by the recommender, at his own expectation unless the desk
  types another price, with `is_published=True`. The listing then appears on the public site under
  its `MB-P#####` reference. Turning one down requires a reason the owner can act on; he reads it in
  his portal, and his form locks the moment the desk decides.
- Every write to `/api/manage/properties/` and `/api/manage/properties/*/images/` is `IsAdminRole`.
  Landlords still read their own listings through the same endpoints.
- `apps/accounts/signals.py` opens the paperwork a new account needs: a landlord gets an empty DRAFT
  form waiting in his portal, a tenant gets a NEW enquiry with his name, e-mail and phone so the desk
  can write the brief and match it to a verified listing.

The copy is deliberately unflattering to nobody: the owner's figure is called his expectation, not a
valuation, and a published listing is described as verified by the landlord and verified by the
team, with illustrative artwork labelled as such.

Built but deliberately limited, because the backend does not support more:

- `/careers` — shows role categories and says there are no advertised vacancies and no
  application tracking. No fake form. (follow-up 6)
- Password reset — the login page says it is unavailable and points to the desk. (follow-up 1)
- Email/identity verification — registration activates immediately and says so. (follow-up 3)
- Landlord cannot open the enquiry inbox; the route is admin-only. (follow-up 5)
- The landlord portal shows totals, not documents. A payout receipt or a signed report for the
  owner is not generated yet — the portal says so and routes the request to the desk by message.
- Payments are never taken online. Recording one creates a PENDING entry awaiting desk
  confirmation; the tenant portal shows the company's bank/mobile-money instructions.
- Logout clears the browser session but cannot revoke the token server-side. (follow-up 2)

## Rent reminders

The desk chases rent from two places — an invoice and the arrears list — and both raise the same
record. [`apps/billing/reminders.py`](backend/apps/billing/reminders.py) is the only renderer:
`reminder_text(invoice)` produces the words once, so the inbox copy and the WhatsApp copy cannot
drift apart (a test asserts the two stored bodies are byte-identical).

- `POST /api/invoices/{id}/remind/` writes the reminder into the tenant's own inbox thread
  (`get_or_create_conversation` + `post_message`) — the tenant sees it in `/portal/messages`.
- `POST /api/invoices/{id}/whatsapp-reminder/` writes that same inbox copy *and* returns a
  click-to-chat address built on the server: `https://wa.me/<digits>?text=<url-encoded body>`.
  The tenant therefore has the words in two places, which is the trade the desk accepted;
  `RentReminder` rows keep both records.
- Nothing sends. No WhatsApp Business API is configured and no provider credentials exist anywhere
  in this repository, so the platform hands a chat to the desk's own phone and the desk presses send
  there. WhatsApp returns no report, so the status vocabulary stops at `WRITTEN`, `LINK_READY`,
  `OPENED`, `NO_NUMBER` — `mark_chat_opened()` can only advance `LINK_READY → OPENED`, and the tests
  pin that vocabulary by name (asserting the four values are exactly those, with "deliver",
  "received" and "sent" banned from any of them) and assert a reminder response never contains the
  word "delivered".
- No number is invented or repaired. `normalise_msisdn()` accepts `+256 704 771 220`,
  `00256 704 771 220`, `256704771220`, `0704 771 220`, `704771220` and a genuine foreign `+44 …`,
  and returns `None` for anything else (short, alphabetic, an extension, a bare `+256`). When it
  returns `None` the endpoint still writes the inbox reminder and answers `link: null` with the
  number to fix, so a chase is never lost because a phone number was typed badly.
  `InvoiceSerializer.whatsapp_number` exposes that derived value, which is how
  `/manage/reminders` can label a row "No usable number" before anyone presses anything.
- `RentReminder` (migration `billing.0002`) is the trail: invoice, channel `INBOX`/`WHATSAPP`,
  status, the exact words handed over, the digits the chat was addressed to, who raised it and when.
  It is registered in `/django-admin/` as read-only, and `GET /api/reminders/` is `IsAdminRole` —
  a tenant or landlord asking for it is refused. The invoice screen renders it as a **Reminder log**.
- A settled or cancelled invoice is answered 400 *before* any row is written, so a "reminder" for
  nothing outstanding cannot be raised even by the API.
- `/manage/reminders` (`pages/manage/RentReminders.jsx`) works the rent book oldest-first:
  `GET /api/invoices/?overdue=true` plus `GET /api/invoices/summary/?overdue=true` for the four
  header figures. Both already existed — the overdue filter and the filter-aware summary — so the
  list invents no endpoint and derives no total in JavaScript.

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

## Documents and the letterhead

`apps/core/services/documents.py` is the only place a PDF is laid out, so a receipt, a rent
invoice and anything the desk prints later all leave on the same stationery:

- **Across the top** — the logo lockup at 46 mm, and the contact block on the right: address and
  city, the three phone lines on one row, the e-mail and the site without its `https://`. Every
  line comes from the company profile in `/django-admin/`; a field left empty simply drops out.
- **The rule** — navy across the page with a short red segment at its right end.
- **Behind the page** — the logo mark, wordmark cropped off, at 7% opacity low on the right.
- **Along the foot** — the navy band reading PROFESSIONAL | TRUSTED | RESULT DRIVEN with the red
  sweep out of the bottom-right corner, then the office line and the page number above it.
  The band and the mark are drawn on every page, not just the first.

The uploaded logo runs to over a megabyte, which would make a one-page receipt heavier than the
record it prints, so it is scaled to 620 px and cached beside the upload as `mb_pdf_logo.jpg` /
`mb_pdf_mark.jpg` in `MEDIA_ROOT/company/`. Those two files are derived, regenerable and safe to
delete; they are rewritten whenever the logo changes.

That cache assumes the logo is a file on this machine's disk. It is not any more — `Company.logo`
resolves through Supabase Storage, so `_logo_path()` finds no `.path` and the invoice and receipt print
the company name as text instead of the lockup, on any host without a writable persistent disk.
Documents still generate and download; the branding is what degrades. Resizing in memory instead of to
a sidecar file is the fix, recorded in `BACKEND_FOLLOWUPS.md`.

A receipt with a long metadata block, a breakdown, payment details and a signature line runs to
two pages — the signature block falls alone onto the second. That is the layout, not a bug: the
letterhead repeats, and the alternative is a document that no longer reads like the paper the
office signs on.

## Security notes (read before deploying)

- **JWT lives in `localStorage`** (`mb.access`, `mb.refresh`, `mb.user`). Any XSS can read it, and
  there is no blacklist, so a token outlives "sign out". Migrate to `httpOnly` cookies +
  `token_blacklist` for real production.
- **Generated PDFs are readable without signing in.** `Receipt.pdf` is written into `MEDIA_ROOT`,
  and while `DEBUG=True` Django serves `/media/` directly, so a receipt URL answers 200 to an
  anonymous request even though `/api/receipts/{id}/download/` checks the role. Move documents
  outside the media tree — `BACKEND_FOLLOWUPS.md` 19.
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
- **A missing `.env` no longer boots quietly.** With `DJANGO_DEBUG=False` and a short, absent or
  development `DJANGO_SECRET_KEY`, settings raise `ImproperlyConfigured` at import. Before this,
  the same host came up in debug mode on a key that is published in this repository.
- **`/api/schema/` and `/api/docs/` follow `DEBUG`** (`DJANGO_API_DOCS` overrides either way). They
  enumerate every route including the desk's and the landlords', so production 404s them.
- `manage.py runserver` is a development server. If you start it with `--noreload`, remember it
  will not pick up backend edits — that cost a debugging cycle here.
- The shared-hosting walk-through — cPanel Python app, `passenger_wsgi.py`, SQLite placement, the
  Apache rules that keep `/media/receipts` off the public web, cron lines for the three management
  commands, and what to do when it 500s — is `DEPLOYMENT.md`. Its final table marks every check
  PASS, FAIL or NOT VERIFIED; nothing there has been run against a real host. It is now marked
  superseded for hosting decisions, because uploads moved to Supabase Storage and the Vercel route was
  prepared: `VERCEL_DEPLOYMENT.md` carries the environment-variable table, the two-project layout, the
  serverless limitations (no scheduler, 4.5 MB request body, no writable disk) and its own
  verified/not-verified split.

## Verification status

`npm run build` → `✓ 2097 modules transformed`, `dist/assets/index-*.js` 634.22 kB (gzip 178.17 kB),
`dist/assets/index-*.css` 46.39 kB, `✓ built in 5.1s`. `python manage.py check` → no issues;
`python manage.py test apps` → **Ran 101 tests … OK** (102.7 s). The suite is still one module,
`apps/core/tests.py`: services and seeding, newsletter double opt-in, the campaign engine, the admin
email API, the landlord portal's access rules, 17 tests for the recommendation queue, and 10 tests
for rent reminders. The campaign tests run on a throw-away database with Django's in-memory email
backend — nothing in the suite can reach a real mailbox, and `db.sqlite3` is not touched by them.

The Vercel pass (2026-10-24) ran that suite again after `apps/core/testing.py` was changed to isolate
storage, because `MEDIA_ROOT` alone stopped being enough once `default` became an S3 backend: the same
101 tests, **OK**, with the bucket contents counted on both sides of the run — `mant-public-media` 54
objects before and 54 after, `mant-private-media` 22 before and 22 after, and no test-shaped key in
either. `makemigrations --check` → *No changes detected*, which covers the two storage migrations. The
new production guards were exercised with a throwaway 50-character key and a fake PostgreSQL config:
`DJANGO_DEBUG=False` on SQLite, and `postgresql` with `DB_PASSWORD` forced empty, each raise
`ImproperlyConfigured` at boot instead of serving traffic, and the complete fake config reports
`CONN_MAX_AGE 0`, `CONN_HEALTH_CHECKS True`, `DISABLE_SERVER_SIDE_CURSORS True`,
`SECURE_SSL_REDIRECT False`, `API_DOCS_ENABLED False`. `ASGI_APPLICATION` is gone, so Vercel's builder
takes the WSGI entrypoint. On the frontend, `/api/properties/` and `/api/company/` were confirmed to
return absolute `…supabase.co/storage/v1/object/public/mant-public-media/…` URLs, `src/utils/media.js`
was fixed to stop stripping that origin (it was rewriting them to same-origin paths, which is why the
listing page's images now resolve: 8 of 9 with `naturalWidth > 0`, 0 broken, 0 requested from the page's
own origin), `vercel.json` carries Vercel's documented SPA rewrite, and the three credential values in
`backend/.env.supabase` were compared by count against the pushed tree and every commit diff — 0
matches, and neither `db.sqlite3` nor `backend/media/` was ever committed.
**Nothing was deployed.** No Vercel project exists, so every claim about Vercel's own behaviour comes
from its documentation and stays marked **VERIFY** in `VERCEL_DEPLOYMENT.md`.

The shared-hosting pass (2026-10-22) was verified the same way, locally and against the running dev
servers. `manage.py check --deploy` under `DJANGO_DEBUG=False` with a generated key: **81 findings,
of which 79 are `drf_spectacular` schema-annotation warnings** and two are the deliberate `security`
ones (`W004` HSTS off, `W008` SSL redirect off — see `BACKEND_FOLLOWUPS.md` 21).
`makemigrations --check --dry-run` → *No changes detected*. `collectstatic` → 154 files. Importing
`passenger_wsgi` the way Passenger does → `WSGIHandler`, and with `DEBUG=False` the resolved URL map
still has `/api/health/`, `/django-admin/` and `/api/receipts/{id}/download/` while `/api/docs/` and
`/api/schema/` return 404; in development both still serve. Running `check` with `DJANGO_DEBUG=False`
and no key raises `ImproperlyConfigured` instead of starting. Through the Vite proxy on a live dev
server: `/`, `/properties`, `/api/health/` and `/api/docs/` all still 200.
**Nothing was deployed, and Namecheap's own documentation could not be read from this machine** (both
article URLs were blocked), so every hosting-account statement in `DEPLOYMENT.md` is marked **VERIFY**
and its final table carries a NOT VERIFIED row for remote behaviour.

The brochure wording pass was verified against the running dev server over HTTP: `/api/services/`
returns the four published offers with their `icon` keys and slugs
(`property-management`, `real-estate-management`, `lobbying-and-advocacy`, `debt-recovery`), the
withdrawn `land-documentation` slug returns 404 rather than a half-rendered page, and `/api/company/`
carries all three published phone numbers with the Cham Towers address. No blog post or email
template linked an old service slug, so nothing internal broke; links shared outside the site would
need updating.

Every surface that names a listing or a service now links somewhere real. Admin and staff tables
(dashboard, leases, invoices, payments, receipts, enquiries, messaging header) render the property
name through `components/properties/PropertyLink.jsx`, which opens the published listing page in a new
tab and falls back to plain text when the API returns no slug — that required adding `property_slug`
to `LeaseSerializer`, `PaymentSerializer`, `ReceiptSerializer` and `ConversationSerializer`, following
the field `InvoiceSerializer` already exposed. Publicly, the hero and About counters link to filtered
listing searches, the service cards and services index titles link to `/services/<slug>`, Careers
matches its four practice areas by name against `/api/services/` rather than hardcoding slugs, and a
listing page links its own city to `/properties?city=…`. Deliberate exceptions: the tenant portal keeps
property names as text (`InvoiceDetail.jsx` already routes tenants to `/portal/leases`), and property
names inside `<option>` labels in Reports and the invoice modal cannot be links.

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

The recommendation flow was walked through in the browser end to end, on the dev server, as the
people who actually use it. As the landlord Joseph: the portal rail showed "Recommend a property",
the list started empty, the form saved to `/landlord/recommendations/1/edit`, and "Send to the desk"
left the row reading "Submitted to the desk · sent 20 Oct 2026" with the form still openable but
clearly his own copy. As the desk (admin `Sarah Nakato`): `/manage/recommendations` listed the row
under "Waiting on the desk 1", "Due diligence" moved it to "In due diligence 1" and emptied the first
tab, and the decision modal showed every answer — owner, phone, offer, kind, bed/bath, size, address,
plot reference, expectation with its period, ownership, occupancy, papers, viewing contact, the note
and the description he wrote. Verifying it with a note published the listing at once:
`GET /api/properties/?search=Naalya` returned it as id 12 / `MB-P00012`, SALE, AVAILABLE,
`is_published: true`, owner Joseph, UGX 260,000,000, and
`/properties/two-bedroom-maisonette-naalya` rendered it publicly with the honest "no photography
uploaded yet" placeholder rather than a borrowed picture. A second recommendation (submitted by the
other owner, Aisha) was turned down from the same modal: an empty reason came back from the server as
"This field may not be blank." against the field, and a real reason left Aisha's portal showing
"Declined", the desk's note under "The desk wrote:", every input disabled, a disabled Save, `PATCH`
refused with 400 and `GET /api/landlord/recommendations/1/` (Joseph's row) answered 404. Two crashes
surfaced during this pass and were fixed: both new tables were passing their row renderer as
children instead of `renderRow`, which blanked the page.

The services editor was walked through in the browser as the desk, on the dev server, with a temporary
sixth record that was deleted at the end of the pass. Creating it from `/manage/services/new` produced
`/services/editor-smoke-test` on the public site, and the copy typed into the form rendered exactly as
its counters predicted — one `## ` heading, one two-item `- ` list, two paragraphs, the summary in the
band, two points under "What it covers" and the shield badge. Unpublishing took it out of
`GET /api/services/` and made its public address answer 404, while `/manage/services/6/preview` still
rendered it with the "Preview of a draft" note in the band. Saving the wording and picking a picture
are two calls, and both were exercised: the PUT stored the rewritten summary and position, then the
multipart PATCH attached `editor-upload-check.png`, answered 200 and served `image/png` from
`/media/services/2026/10/`. That second call is why `uploadServiceImage()` uses PATCH — the same
request sent as POST to the detail route answers 405. Publish/Unpublish and the arrows were clicked
rather than assumed; the swap left `debt-recovery` at position 9, which was set back to 5, and the
temporary row plus its uploaded file were removed, so the table is the same five published services at
orders 1–5 with their original artwork. Console stayed clean apart from the two React Router
future-flag warnings.

The reminder work was checked twice: read-only over HTTP, then in a real browser as the desk — and
in the browser the dialog was opened and cancelled, never confirmed, because confirming writes a
real `Message` into a real tenant's thread plus a `RentReminder` row.

*Over HTTP:* signing in as `admin@mantbridges.com` returned 200 and
`GET /api/invoices/?overdue=true` returned **13 invoices in arrears** — the first page of 12
serialized a dialable `whatsapp_number` for every row (e.g. `'+256 700 815 336'` → `256700815336`),
with **0 undialable rows on that page**. `GET /api/reminders/?invoice=…` returned `200 []` (none
raised, as expected); the same list answered 401 with no token, and 403 for a landlord token and for
a tenant token. `normalise_msisdn()` was walked through its accepted and rejected shapes in a shell
before the endpoints were built.

*In the browser* (`/manage/reminders`, dev server, signed in as Sarah Nakato): the four header
figures come back as `13 · UGX 57,945,000 still owing · UGX 69,635,000 billed · UGX 11,690,000
recovered`, the list defaults to "Due date: old first" and pages 12 + 1, and each row carries the
tenant's phone, the invoice reference and period, days late, what is owing, how many times it was
chased ("never chased", or `1 time · last 15 Oct 2026`) and a `+256700815336` chip. Pressing
**Remind** opened the dialog naming `MB-INV-2026-00027`, Rhoda Kyomuhendo, Bugolobi Business Park
Office Suite, UGX 6,765,000, due 07 Mar 2026, "229 days past the due date", addressed to
+256700815336 — then **Cancel**. The same dialog opens from `/manage/invoices/27` beside "Send a rent
reminder", whose aside renders the Reminder log's empty state, and `GET /api/reminders/?invoice=27`
still answered `count: 0` afterwards: the walk wrote nothing. Console stayed clean apart from the two
React Router v7 future-flag warnings.

**Still unverified on these screens:** the dialog's second step (the exact words, "Copy the words"
and the `wa.me` address) and a populated Reminder log, because both need a reminder actually raised;
and the "No usable number" row, because every tenant on this install has a dialable phone. Those
three paths are covered by the 10 reminder tests — the refusal of a settled invoice, the
tenant/landlord 403s, the idempotent `opened/` trace and the "no delivery vocabulary" guard — not by
clicks. One behaviour worth knowing: "Amount: high to low" on the arrears list orders by the amount
**billed**, not by what is owing, because `Invoice.balance` is computed and the API cannot order on
it; the page therefore defaults to oldest due date first, which is the queue the desk works down.

**Not verified:** the brochure wording and the new badge/arc motifs seen as a picture — the in-app
browser in this session renders a 543×426 viewport and one full-page capture was refused
(`NATIVE_BROWSER_VIEWPORT_UNAVAILABLE`), so those surfaces were read from accessibility snapshots and
from the classes being present in `dist/assets/index-*.css`, not from a desktop screenshot; the
campaign screens clicked through in a browser as an ADMIN (the render path, the modals and the
queue/cancel affordances are covered by tests and by a clean build, not by a screenshot); a real campaign run of
`send_email_campaign` against live data, because there are no confirmed subscribers on this install;
desktop-width rendering of the newsletter band (the automation browser sat at a 543×426 viewport, so
only the stacked mobile layout was screenshotted and measured); delivery of a real email —
`EMAIL_BACKEND` here is the console backend, so no message has ever reached an inbox; the company
logo upload (it would overwrite the real file); the three services screens seen as a picture at
desktop width (the same viewport refusal, so they were read from the DOM and from computed styles);
and any production deployment steps.

**Placeholder assets:** `frontend/public/images/{kampala,landlord,contracting}.jpg` are
AI-generated stand-ins, not Mant Bridges photography. Replace them before launch.
