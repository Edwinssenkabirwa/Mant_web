# Deploying Mant Bridges to Vercel

Written from the repository as it stands on the local Windows machine on 2026-10-24. Every file
path, version, setting and test result below was read out of this repository or run here; anything
that depends on Vercel or Supabase accounts is marked **VERIFY** and left as a placeholder. Nothing
in this file has been deployed. No commit, push, migration or deployment was performed while
writing it.

`DEPLOYMENT.md` still holds the Namecheap/cPanel guide. It has not been deleted, but its database
and media assumptions are now obsolete — read the notice at the top of that file before using it.

I performed no commit, push, migration or deployment. During this pass the repository was committed and
pushed by you (`a6d69c7 "Deployable V1"`, which swept up the Supabase storage work and part of this
pass's settings changes), and `git status` at the time of writing lists what is still uncommitted — see
sections 4 and 10.

---

## 1. The confirmed architecture

| Piece | What it is | Where it goes |
| --- | --- | --- |
| Frontend | React 18.3.1 built by Vite 5.4.21 from `frontend/` into `frontend/dist/` | **Vercel project 1**, Root Directory `frontend` |
| Backend | Django 5.2.18 + DRF 3.18.3, 7 apps, 109 `/api` routes, admin at `/django-admin/` | **Vercel project 2**, Root Directory `backend` — becomes one Vercel Function |
| Database | Supabase PostgreSQL (project `fxqkfwgpkvpnkegtlvmj`), reached through its pooler host | Supabase; unchanged, not moved |
| Public uploads | Property, service, blog and company artwork in bucket `mant-public-media` | Supabase Storage; URLs handed out by Django, served by Supabase |
| Private uploads | Receipt PDFs and chat attachments in bucket `mant-private-media`, signed URLs with a 300-second expiry | Supabase Storage; never public |
| Entrypoint | `backend/config/wsgi.py` → `config.wsgi:application` | Vercel's zero-configuration Django builder |
| Django static | `manage.py collectstatic` into `backend/staticfiles/` (154 admin files) | Vercel runs collectstatic itself and serves the result from its CDN at `/static/` |

Two Vercel projects, because one Vercel project has one Root Directory and this repository holds two
applications. The browser therefore calls the API on a **different origin** than the page, which is
what `CORS_ALLOWED_ORIGINS` and `VITE_API_BASE_URL` exist for.

**The database is the one thing in this table that is not yet true.** Right now the app boots on
SQLite, because [backend/config/settings.py:17-18](file:///C:/Users/Mant%20Bridges/Desktop/mant_web/backend/config/settings.py#L17-L18)
loads `backend/.env` first (which sets `DB_ENGINE=sqlite`) and then `backend/.env.supabase` with
`override=False`, so the PostgreSQL settings in that second file can never win. Media already goes to
Supabase, the data does not. Verified locally: `DATABASES["default"]["ENGINE"]` reports
`django.db.backends.sqlite3`.

This does not affect the Vercel deployment itself — neither file is deployed (both are gitignored),
so on Vercel the environment comes only from the project settings you fill in. It does affect every
test you run from this machine, and it means your production data has not been moved to Supabase yet.
See section 8.

### What Vercel's Django builder does with this repository

Confirmed from [Deploy a Django app on Vercel](https://vercel.com/docs/frameworks/full-stack/django)
(page last updated 2026-07-24):

- It finds the app by locating `manage.py`, then executes it to read `DJANGO_SETTINGS_MODULE` and the
  entrypoint from `WSGI_APPLICATION` or `ASGI_APPLICATION`.
- **"When both `ASGI_APPLICATION` and `WSGI_APPLICATION` are set in your Django settings, Vercel uses
  the ASGI entrypoint."** `ASGI_APPLICATION` has therefore been removed from `settings.py`. Nothing in
  this project installs channels, daphne or uvicorn, and the ASGI path is one this app has never been
  exercised on. `backend/config/asgi.py` is left in place but unadvertised.
- It runs `collectstatic` during the build by itself when `STATIC_ROOT` is set — `STATIC_ROOT` is
  `backend/staticfiles` — and serves the files at `STATIC_URL` from the CDN. Do not call
  collectstatic in a build script.
- It detects `django-storages` and, when it does, "runs `collectstatic` with your original settings".
  Our `STORAGES["staticfiles"]` is plain `StaticFilesStorage`, so collected admin files land in
  `staticfiles/` for the CDN and only `default` (uploads) talks to S3. **VERIFY** against the build
  log of the first deployment: the admin stylesheet must come back from `/static/admin/...` on the
  Vercel origin, not from Supabase.
- The whole Django app becomes **one Vercel Function**, on Fluid compute by default.
- No `api/index.py`, no WSGI wrapper and no `vercel.json` are required for the backend: the layout
  matches what the zero-configuration builder expects once the Root Directory is `backend`.

## 2. Environment variables

`backend/.env` and `backend/.env.supabase` are gitignored and are **not** deployed. Everything below
is set in the Vercel dashboard. The two templates are
[backend/.env.example](file:///C:/Users/Mant%20Bridges/Desktop/mant_web/backend/.env.example) and
[frontend/.env.example](file:///C:/Users/Mant%20Bridges/Desktop/mant_web/frontend/.env.example).
Placeholders are written as `<...>`; nothing here is a real value.

### Vercel project 2 — the Django backend

These reach the function's `os.environ` at request time. They are never in the browser.

| Variable | Value to set | Required | Notes |
| --- | --- | --- | --- |
| `DJANGO_DEBUG` | `False` | yes | Vercel boots with it already off — leaving it unset no longer gives you debug pages, it refuses to start |
| `DJANGO_SECRET_KEY` | a 50-character random string | yes | `python -c "from django.core.management.utils import get_random_secret_key as k; print(k())"` |
| `DJANGO_ALLOWED_HOSTS` | `mantbridges.com,www.mantbridges.com` | for your own domains | no scheme, no trailing slash. Vercel's own `*.vercel.app` hosts are added automatically — see limitation 10 |
| `DB_ENGINE` | `postgresql` | yes | `DJANGO_DEBUG=False` with anything else now raises `ImproperlyConfigured` at boot |
| `DB_NAME` | Supabase database name, usually `postgres` | yes | |
| `DB_USER` | Supabase database user, usually `postgres` | yes | |
| `DB_PASSWORD` | the database password you set in Supabase | yes | never put it in a file that is committed |
| `DB_HOST` | `<ref>.pooler.supabase.com` for the pooler, `<ref>-direct...` for IPv4 direct | yes | from Supabase → Project Settings → Database → Connection string |
| `DB_PORT` | `5432` for session pooling, `6543` for transaction pooling | yes | |
| `DJANGO_DB_DISABLE_SERVER_SIDE_CURSORS` | leave unset (default `True`) | no | transaction pooling cannot hold a server-side cursor; set `False` only on a session-mode pooler you have tested |
| `DJANGO_DB_CONN_MAX_AGE` | leave unset (default `0`) | no | a frozen-between-requests function should open its own connection |
| `SUPABASE_S3_ACCESS_KEY_ID` | the Supabase Storage S3 access key | yes | without it the app will not start: storage is built when the models are read |
| `SUPABASE_S3_SECRET_ACCESS_KEY` | the matching secret key | yes | |
| `SUPABASE_S3_REGION` | `eu-west-1` unless the project is elsewhere | no | defaults to `eu-west-1` in `storage_backends.py` |
| `CORS_ALLOWED_ORIGINS` | `https://<frontend-project>.vercel.app` | yes | comma-separated; add `http://localhost:5173` only on a development instance |
| `PUBLIC_SITE_URL` | `https://<frontend-project>.vercel.app` | yes | newsletter and confirmation links are built from it |
| `EMAIL_BACKEND` | `django.core.mail.backends.smtp.EmailBackend` (or your provider's backend) | for email | the default is the console backend, which delivers nothing to an inbox |
| `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD`, `EMAIL_USE_TLS`, `DEFAULT_FROM_EMAIL` | from the email provider | for email | |
| `DJANGO_MAX_UPLOAD_MB` | `4` | recommended | Vercel rejects a request body over 4.5 MB before Django sees it; the default is 15 |
| `DJANGO_API_DOCS` | leave unset | no | `/api/schema/` and `/api/docs/` are off whenever `DEBUG=False`; turn on only to debug remotely |
| `CSRF_TRUSTED_ORIGINS` | leave unset unless something sends cookies | no | the SPA authorises with a Bearer header, not cookies |
| `CORS_ALLOW_CREDENTIALS` | leave unset | no | must stay off while tokens live in `localStorage` |
| `DJANGO_TRUSTED_SSL_HEADER` | leave unset | no | Vercel terminates TLS itself and the app is behind its own proxy; set only if you confirm a forwarded header is needed |
| `DJANGO_SECURE_SSL_REDIRECT` | `True` once https answers on both domains | no | defaults off in production |
| `DJANGO_SECURE_HSTS_SECONDS` | `0` until https is proven, then `31536000` | no | HSTS is cached by browsers for the whole period and cannot be walked back |
| `DJANGO_TIME_ZONE` | `Africa/Kampala` | no | already the default |
| `LOG_LEVEL` | `INFO` | no | Vercel shows function logs; there is no log file |

### Vercel project 1 — the React frontend

Anything prefixed `VITE_` is inlined into the JavaScript bundle. **A person who opens the site can
read all of it.** Never put a database password, an S3 secret or a token here.

| Variable | Value to set | Required | Notes |
| --- | --- | --- | --- |
| `VITE_API_BASE_URL` | `https://<backend-project>.vercel.app/api` | yes | read at build time, so changing it means rebuilding the frontend |
| `VITE_MEDIA_BASE_URL` | leave unset | no | only used for a relative `/media/...` path; every URL Django now hands out is absolute, so it is unnecessary with Supabase Storage |

`VITE_BACKEND_URL` is read by `vite.config.js` from the shell, not from this table — it is the
development proxy's target (`http://127.0.0.1:8000`) and has no effect on a deployed site.

## 3. Project settings to enter in the dashboard

### Project 1 — frontend

| Setting | Value |
| --- | --- |
| Git Repository | your `Mant_web` repository, default branch |
| Root Directory | `frontend` |
| Framework Preset | Vite |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Install Command | leave default (`npm install`) |
| Node version | whatever the dashboard offers that is 18 or newer — the local build ran on Node 24.18.0 |

`frontend/vercel.json` has been added, and it contains exactly one thing — the single-page-app
rewrite, because Vercel's own Vite documentation says deep linking "won't work out of the box" for a
Vite SPA:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

Static files are matched before a rewrite, so `/assets/*` still resolves; **VERIFY** by reloading
`/properties/<a-slug>` on the first preview and confirming the CSS and images both come back.
`frontend/public/.htaccess` is copied into `dist/` by the build and does nothing on Vercel — Apache
never sees it. Leave it for now: the cPanel route in `DEPLOYMENT.md` still needs it.

### Project 2 — backend

| Setting | Value |
| --- | --- |
| Git Repository | the same repository |
| Root Directory | `backend` |
| Framework Preset | Django (or leave Automatic) |
| Build Command | empty — Vercel installs `requirements.txt` and runs collectstatic itself |
| Output Directory | empty |
| Dev Command | `python manage.py runserver` if you use `vercel dev` (CLI 50.38.0 or newer) |

Dependencies come from `backend/requirements.txt`, which is at the root of that project once the Root
Directory is `backend`, so discovery is not a problem. Python: Vercel supports 3.12 (its default),
3.13 and 3.14, chosen from `pyproject.toml`'s `requires-python`, a `.python-version` file or
`Pipfile.lock`. This repository has none of the three, so a build lands on **3.12** unless you add a
file — which is compatible with every pinned dependency (`django-filter` needs 3.11 or newer). The
local virtualenv is 3.14.0, so if you want the two to match, create `backend/.python-version`
containing `3.14` and redeploy. Either is defensible; 3.12 is the version Vercel defaults to and has
never been run here, 3.14 is the version the 101 tests pass on and has never run on Vercel.

To give the function more than the default runtime, add to `backend/vercel.json` — the key is the
entrypoint file, prefixed by the subdirectory only if `manage.py` sits in one, which it does not once
the Root Directory is `backend`:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "functions": {
    "config/wsgi.py": { "maxDuration": 60 }
  }
}
```

No `backend/vercel.json` exists today; add it only if a request genuinely needs more than the default
duration. `maxDuration` above 15 seconds is a Pro-plan capability — **VERIFY** against your plan.

## 4. Connecting the repository

1. **The Supabase storage work is already in Git.** It landed as `a6d69c7 "Deployable V1"` and that
   commit is on `origin/main` (`github.com/Edwinssenkabirwa/Mant_web`), so `manage.py`,
   `backend/apps/core/storage_backends.py`, both new migrations and the model edits will reach Vercel
   on the first build. Checked here, and true: no credential literal from `backend/.env.supabase`
   appears in the pushed tree or in any commit's diff. What else went up with it is section 8.11 —
   eight `*.before_*.bak` files, `backend/requirements-temp.txt` and two one-off media-migration
   scripts are now in the repository and
   would be packed into the function bundle.
2. Vercel → Add New → Project → Import Git Repository → pick `Mant_web`.
3. Import it **twice**. Set Root Directory `frontend` on one project and `backend` on the other. Give
   them distinguishable names, e.g. `mant-bridges-web` and `mant-bridges-api`.
4. Add the environment variables from section 2 to each project, for Production **and** Preview.
5. Vercel deploys on every push to the default branch. Preview deployments get a per-commit domain, and
   the API accepts its own Vercel hostname without being told (limitation 10). The frontend origin is a
   different project with a different domain, so `CORS_ALLOWED_ORIGINS` still needs each one that has to
   call the API — a preview frontend talking to the production API is exactly the case that 403s on a
   preflight.
6. **Expect a red build if the variables are not in the dashboard yet.** `DJANGO_DEBUG` now defaults to
   `False` whenever `VERCEL` is set, and the fail-fast guards in `settings.py` raise at import — which
   the build hits when it runs collectstatic. A backend project with no `DJANGO_SECRET_KEY` therefore
   fails with `ImproperlyConfigured: DJANGO_SECRET_KEY must be a long random value while
   DJANGO_DEBUG=False…`, and one with a key but no database fails with `DJANGO_DEBUG=False requires
   DB_ENGINE=postgresql with DB_NAME, DB_USER, DB_HOST and DB_PORT…`. Both are the intended outcome:
   a half-configured deployment used to boot quietly, serve development pages, and call an empty
   throwaway SQLite file your database. Type the variables in, click *Redeploy*, and the message goes
   away. All four boot paths were exercised locally (section 11).

## 5. Supabase PostgreSQL

Nothing in this task moved data. The database, its rows and its buckets stay where they are; no
migration was run against it, and no object was written, copied or deleted.

To reach it from the function, take the **Connection string** from Supabase → Project Settings →
Database → *URI* → the `Pooling`/`Session` variant, and split it into `DB_NAME`, `DB_USER`,
`DB_PASSWORD`, `DB_HOST`, `DB_PORT` rather than pasting the whole URI: this project's settings read
those five names, and adding a `DATABASE_URL` parser would mean changing and re-testing the code that
reads them.

- A Vercel function's outbound address is not fixed. Supabase's **transaction** pooler (port 6543) is
  the one built for many short-lived connections; the `-direct` host needs an IP allowlist you cannot
  maintain from serverless. Use the pooler, and leave `DISABLE_SERVER_SIDE_CURSORS` at its new default
  of `True`.
- `CONN_MAX_AGE` now defaults to `0` in the PostgreSQL branch of `settings.py`, and
  `CONN_HEALTH_CHECKS` is on, so a connection recycled into a frozen container is checked before use.
- **VERIFY** the connection from a real deployment: `/api/properties/` must return the same seven
  published listings the local SQLite file returns. If it returns an empty list, the function is
  pointing at an empty PostgreSQL database — the data has not been moved, which is section 8.
- Never let a build run `migrate`. Vercel has no setting that stops it from executing a build script
  you wrote, so the rule is simply: put no migration in `buildCommand`, in `[tool.vercel.scripts]
  build` or in `settings.py`. Run migrations by hand, in a terminal that has pulled the same
  environment the function uses:

  ```bash
  vercel pull --environment=production --project=<backend-project>   # writes backend/.env.local
  set -a; . ./backend/.env.local; set +a
  python backend/manage.py migrate --plan      # read-only: what would run
  python backend/manage.py migrate             # the real thing, only when you mean it
  ```

  `backend/.env.local` must stay gitignored, and note that `settings.py` does not load it — hence the
  `set -a` line. `.env.local` is already covered by the `.env.*` rule in `.gitignore`.

- The two new migration files (`billing/0003_alter_receipt_pdf.py`,
  `messaging/0002_alter_message_attachment.py`) exist because the storage backend moved, and they only
  change the `storage=` attribute recorded in each migration state. `manage.py makemigrations --check`
  reports **No changes detected** against them, so they are consistent with the models. They must be
  committed with the rest, or the first `migrate` on production will fail on an unknown storage class.

## 6. Supabase Storage: public images, private documents

Both backends live in [backend/apps/core/storage_backends.py](file:///C:/Users/Mant%20Bridges/Desktop/mant_web/backend/apps/core/storage_backends.py).
Nothing in this task changed the buckets, their policies or their contents.

| Bucket | Contents | How a URL is produced | Who can read it |
| --- | --- | --- | --- |
| `mant-public-media` | property and service photography, blog covers, the company logo | an absolute public object URL, `https://<ref>.supabase.co/storage/v1/object/public/mant-public-media/<key>` | anyone with the URL — treat it as a published web image |
| `mant-private-media` | receipt PDFs, chat attachments | a Signature Version 4 presigned GET, `querystring_expire = 300` seconds | only a request that Django decided to answer |

What I confirmed by reading and running code here:

- `signature_version = "s3v4"` on both classes, as required.
- `Receipt.pdf` (`billing/models.py:424`) and `Message.attachment` (`messaging/models.py:71`) are the
  only two fields bound to the private storage instance; everything else is `default` = public.
- The private bucket has `querystring_auth = True`, so it is not handing out public URLs.
- **Receipt downloads do not depend on a signed URL at all.** `billing/views.py:305` `download` streams
  `receipt.pdf.open("rb")` through a `FileResponse`, which works against S3 storage and keeps
  authorization in Django's permission layer — that is the route the SPA uses
  (`frontend/src/api/billing.js:130`). A signed `pdf_url` is still serialized onto the receipt record,
  so it should be treated as a short-lived public path to that one object for five minutes.
- `Receipt.pdf.open()` and `FileResponse` need no local disk. Neither does invoice or receipt PDF
  generation, which builds in memory with `BytesIO` and base-14 fonts.
- The one thing in this area that cannot work on Vercel is the letterhead logo cache —
  see section 8.

Private files stay private only while an authenticated Django view decides who sees them. Do not
render a private signed URL into a public page, and do not make `mant-private-media` public to fix a
download.

## 7. Testing after the first deployment

Use a test account you create for this, not a live tenant's. `MantDemo@2026` is the local demo
password and should not exist on production.

| # | Check | Expected |
| --- | --- | --- |
| 1 | `https://<backend>/api/properties/` in a plain browser tab | JSON, `count` equal to the published listings; not a 400 (400 = `DJANGO_ALLOWED_HOSTS`), not a 500 (500 = database or storage variables) |
| 2 | `https://<backend>/api/schema/` | 404 — the route map is off with `DEBUG=False` |
| 3 | `https://<frontend>/` | page paints; property photography loads from `*.supabase.co`, not from `<frontend>/storage/...` |
| 4 | Reload a nested route (`/properties/<slug>`, `/portal/invoices`) | the page still renders; this is the `vercel.json` rewrite |
| 5 | Django admin `/django-admin/`, then look at the page's own CSS | styles load from `/static/admin/...` on the Vercel origin — this is collectstatic and the CDN |
| 6 | Log in on the frontend as desk staff | JWT pair returned, dashboard renders; check DevTools → Network for a CORS failure before blaming the API |
| 7 | Login with a wrong password three times | 401 each time, still unlimited — there is no login throttle, see section 8 |
| 8 | Access a token-protected endpoint after the access token expires | the SPA refreshes with the stored refresh token and the call succeeds |
| 9 | Upload a property photograph under 4 MB through the admin | the object appears in `mant-public-media` and the card shows it; over 4 MB must fail with the form's own message, not a platform error |
| 10 | Create an invoice, take a payment, download the receipt | PDF streams through `/api/.../download/` to the authorized tenant only; retry the same URL as an anonymous visitor and expect 401/403 |
| 11 | Send a chat message with an attachment, then reopen the thread | the attachment URL is a signed one that stops working after about 300 seconds |
| 12 | Subscribe a test address to the newsletter, confirm through the emailed link | if no email arrives, `EMAIL_BACKEND` is still the console backend — see section 8 |
| 13 | `/api/enquiries/` POST from a public page | 201 and a row on the desk's enquiries screen |

## 8. Known platform limitations and unresolved issues

Ordered by how much they will bite.

1. **Your production database is not the database the app uses today.** `DJANGO_DEBUG=False` now
   refuses to boot on SQLite, and Supabase PostgreSQL holds none of the property, user, payment, lease
   and blog rows that are in `backend/db.sqlite3`. Moving them is a decision of its own — a dump and
   restore, or the `backend/migrate_supabase_media.py`-style scripts already sitting untracked in the
   repository, which I have not read past their filenames and have not run. Until that is done, a
   Vercel deployment starts from an empty Supabase database: no accounts to log in with, no listings.
2. **No scheduled work runs here.** `generate_invoices`, `mark_overdue` and `send_email_campaign`
   (`backend/apps/*/management/commands/`) need a scheduler; a Vercel Function only runs when something
   requests it. Vercel Cron can call an HTTP endpoint on a schedule, but there is no endpoint that runs
   those commands, and building one means new permission work — deliberately not done in this pass. The
   rent-reminder feature in `apps/billing/reminders.py` is the same class of problem. Vercel documents
   Celery and Dramatiq integrations for genuine queues. Until something schedules them, invoices are
   not generated automatically, arrears are not marked overdue, and campaigns sit in the queue.
3. **Email is not wired.** `EMAIL_BACKEND` defaults to the console backend, which writes mail to the
   function's log and delivers nothing to an inbox. Set a provider's SMTP backend and credentials
   before testing newsletter confirmations, and remember that a campaign batch that outlives
   `maxDuration` will be cut off mid-run.
4. **Uploads larger than 4.5 MB cannot reach Django.** `DJANGO_MAX_UPLOAD_MB=4` makes the app reject
   them with its own message instead. The real fix for bigger files is a presigned direct-to-bucket
   upload, which is new API surface and was explicitly left out of this pass.
5. **The letterhead logo silently degrades.** `apps/core/services/documents.py:101` and `:127` read
   `FieldFile.path` and write a cached JPEG *next to the upload on local disk*. Under S3 storage
   `.path` raises, so `_logo_path` returns `None` and the invoice and receipt print the company name as
   text instead of the logo; on Vercel there is no writable persistent disk to cache to anyway.
   Documents still generate and download. Fixing it means resizing in memory — the option you chose to
   defer, so nothing was changed. The existing tests still pass because they run against the isolated
   temporary filesystem, where the local branch is available.
6. **There is no rate limiting on login.** `LoginView` (`apps/accounts/views.py:52`) is plain
   SimpleJWT. DRF throttles are counted per process, and serverless processes are short-lived and
   numerous, so even if one were added it would be weaker here than on a persistent host — a real
   answer sits with the edge (Vercel WAF/route rules) or in the database-backed attempt counter.
   Password reset likewise has no abuse protection of its own.
7. **Tokens live in `localStorage` and cannot be revoked.** `ROTATE_REFRESH_TOKENS` is on but
   `BLACKLIST_AFTER_ROTATION` is off and `token_blacklist` is not installed, so a stolen token stays
   valid for its whole lifetime (12 hours access, 14 days refresh) and logging out does not invalidate
   anything server-side. This is unchanged from the previous guides; Vercel does not make it better.
8. **`backend/media/` is dead weight in production.** Nothing writes there any more, and
   `config/urls.py` only serves it when `DEBUG=True`. Do not treat it as a source of uploads, and do
   not delete it yet: it is where the current receipt PDFs and photography physically live on this
   machine.
9. **The bundle is one Function.** Standard limit 500 MB; `backend/media/` and `staticfiles/` must not
   be pulled into it. `Large Functions` reach 5 GB in public beta if it ever matters.
10. **`*.vercel.app` hosts are trusted; anything else is yours to declare.** Every preview gets a new
    hostname, and Django answers 400 with `DisallowedHost` to a Host it does not recognise — which is
    what happened to the first deployment on `mant-web-33te.vercel.app`. `config/settings.py` now reads
    `VERCEL_URL` and `VERCEL_PROJECT_PRODUCTION_URL` when the `VERCEL` platform marker is present and
    appends both to `ALLOWED_HOSTS`. Those two variables are written by Vercel into the process
    environment, never copied from the request, so this cannot be talked into answering for someone
    else's domain, and no leading-dot `.vercel.app` entry is needed. Custom domains and any other
    origin still come from `DJANGO_ALLOWED_HOSTS`. Local runs are untouched: without `VERCEL` the list
    stays `localhost,127.0.0.1`. The fix only takes effect once it is in the built commit.
    The same block of `settings.py` also stopped `DJANGO_DEBUG` defaulting to `True` on Vercel, which
    closes the more serious half of that first deployment: it was rendering Django's technical error
    pages and had `/api/docs/` switched on because nothing told it otherwise. Now a Vercel boot without
    the variables raises at import instead — see section 4.6.
11. **Repo hygiene, now that it is in Git.** `a6d69c7` committed seven `*.before_storage.bak` files,
    `backend/config/settings.py.before_supabase_production.bak`, `backend/requirements-temp.txt`,
    `backend/migrate_supabase_media.py` and `backend/run_media_migration.py` alongside the real source.
    They contain no credential — verified against the values in `backend/.env.supabase` — but they are
    dead weight in the function bundle, `requirements-temp.txt` risks being read as a second dependency
    file, and a reviewer cannot tell which `models.py` is live. Remove them from the repository (or
    gitignore and move them out of `backend/`) before the first deployment; `supabase_migration_settings.py`
    and `test_supabase_connection.py` stayed ignored. `storage_backends.py` also carries a header
    comment naming a bucket (`mant-private-files`) that does not exist; the code uses
    `mant-private-media`.

## 9. Rollback and recovery

- **Instant, and safe: the code.** Vercel → Project → Deployments → pick the previous deployment →
  *Promote*. Both projects roll back separately, so a frontend rollback does not undo an API rollback.
  Keep the last known-good production deployment of each in mind before you deploy a change.
- **Not covered by a rollback: the database and the buckets.** A previous deployment cannot put back
  rows that a later migration changed or a bad request overwrote. So, before the first production
  `migrate`: take a Supabase database backup (or a `pg_dump` of the pooler connection), and note that
  `backend/db.sqlite3.backup` and `backend/local_data_export.json` already exist locally and are
  gitignored — they are your only copy of the current data until it is moved.
- **Never** run `migrate --fake`, `migrate <app> zero`, `flush`, or any command that drops tables
  against Supabase. The new untracked migrations are additive (they only record storage attributes)
  and nothing in this pass added a data-destroying migration.
- If a deployment starts 500-ing on boot, read it in this order: the fail-fast messages added to
  `settings.py` are deliberate and name the missing variable (`DJANGO_SECRET_KEY`, then
  `DB_ENGINE`/`DB_*`, then the Supabase storage keys). A crash loop that says
  `Missing Supabase Storage environment variables` is the storage keys, not the database.
- If every path answers **400 `DisallowedHost`** — including `/api/health/`, before any routing happens
  — the Host header is not in `ALLOWED_HOSTS`. A `*.vercel.app` host means the built commit predates the
  `VERCEL_URL` block (limitation 10); any other host means `DJANGO_ALLOWED_HOSTS` needs it.
- If images stop rendering after an environment change, check `VITE_API_BASE_URL` was rebuilt —
  it is read at build time, so a changed value with no rebuild keeps calling the old origin.
- If private downloads start returning 403, the signed URL expired (300 seconds) or the S3 key/secret
  changed; the download endpoint itself is unaffected by expiry, so re-issue from the API rather than
  lengthening the expiry.

## 10. What only you can do

1. Decide and execute the data move from `backend/db.sqlite3` into Supabase PostgreSQL — the reason
   the app cannot go live on Vercel today (section 8.1).
2. ~~Commit and push the remaining work from this pass.~~ Done on 2026-10-24, at your instruction: the
   settings guards and test storage isolation are in `a6d69c7`, the SPA rewrite, the `mediaUrl` fix and
   the first version of these guides are in `550d447`, and the `VERCEL_URL` host trust plus the
   `DJANGO_DEBUG` fail-closed default went up in the commit after that, along with this file's updates.
   Vercel rebuilt on that push — which is when section 4.6 stops being theory.
3. Create the two Vercel projects and type the environment variables into the dashboard — secrets
   never go into this repository.
4. Generate `DJANGO_SECRET_KEY`, and read the Supabase password and S3 keys out of Supabase itself.
5. Buy/point the `mantbridges.com` DNS at Vercel, then set `DJANGO_ALLOWED_HOSTS`,
   `CORS_ALLOWED_ORIGINS` and `PUBLIC_SITE_URL` to the real domains and redeploy.
6. Choose and configure the email provider; nothing sends from this app until that is done.
7. Decide what schedules `generate_invoices`, `mark_overdue` and campaign sending — Vercel Cron with
   a protected endpoint, a persistent host, or a queue product.
8. Run the section 7 checklist against the live deployment. I cannot deploy from here and have not
   tested any Vercel runtime behaviour.
9. Approve or reject the untracked Supabase work before it becomes the thing you deploy.

## 11. What was verified, and what was not

Ran on this machine, 2026-10-24:

| Check | Result |
| --- | --- |
| `python manage.py test apps` | **Ran 101 tests — OK**, three times: 102.7 s, then 104.8 s after the `settings.py` guards, then 111.4 s after `DEBUG` stopped defaulting to `True` on Vercel |
| Supabase bucket object count before / between / after those two runs | 54 public + 22 private every time; no test-shaped key in either bucket |
| `python manage.py check` | System check identified no issues (0 silenced) |
| `python manage.py makemigrations --check` | No changes detected |
| `DJANGO_DEBUG=False` with the local SQLite default | refuses to boot: `DJANGO_DEBUG=False requires DB_ENGINE=postgresql …` |
| `DJANGO_DEBUG=False` on PostgreSQL with one value blank | refuses to boot: `PostgreSQL is selected but DB_PASSWORD is empty …` |
| `DJANGO_DEBUG=False` with a complete fake PostgreSQL config | boots; `CONN_MAX_AGE 0`, `CONN_HEALTH_CHECKS True`, `DISABLE_SERVER_SIDE_CURSORS True`, `SECURE_SSL_REDIRECT False`, `API_DOCS_ENABLED False` |
| `/api/properties/` and `/api/company/` on the local dev server | absolute `https://…supabase.co/storage/v1/object/public/mant-public-media/…` URLs |
| `npm run build` | 2097 modules transformed, `index.js` 634.22 kB (gzip 178.17 kB), `index.css` 46.39 kB, built in 5.10s |
| Property listing page in a browser (local dev) | 8 of 9 images with `naturalWidth > 0`, 0 broken, 0 requested from the page's own origin |
| Git tracking of secrets | `backend/.env` and `backend/.env.supabase` match ignore rules and appear in no commit; `git ls-files` shows only `backend/.env.example`; `frontend/.env.local` matches the `.env.*` rule |
| The three live credential values compared against the pushed tree and every commit diff | 0 files and 0 commits contain any of them — checked by count, never printed |
| `backend/db.sqlite3` and `backend/media/` in Git | never committed: `git log --all` for both paths returns nothing, and `git ls-files` lists no media object |
| `ALLOWED_HOSTS` and `DEBUG` on a simulated Vercel boot (`VERCEL=1`, `VERCEL_URL`, `VERCEL_PROJECT_PRODUCTION_URL`, `DJANGO_DEBUG=0`, throwaway 50-char key, fake PostgreSQL config) | `['localhost', '127.0.0.1', 'mant-web-33te.vercel.app', 'mant-web.vercel.app']`; `GET /api/health/` sent with that Host → **200** `{"status":"ok","service":"mant-bridges-api"}`; `GET /api/docs/` → **404** (`API_DOCS_ENABLED False`); `DEBUG False` |
| Vercel boot with **nothing** typed into the dashboard (same emulation, no key, `DB_ENGINE=sqlite`) | refuses to import settings: `ImproperlyConfigured: DJANGO_SECRET_KEY must be a long random value while DJANGO_DEBUG=False …`; with a valid key and still no PostgreSQL config it goes one guard further: `DJANGO_DEBUG=False requires DB_ENGINE=postgresql with DB_NAME, DB_USER, DB_HOST and DB_PORT …` |
| Local run, no `VERCEL` marker | unchanged: `DEBUG True`, `ALLOWED_HOSTS ['localhost', '127.0.0.1']` |
| The repository's remote | `https://github.com/Edwinssenkabirwa/Mant_web`, `main` level with `origin/main` at `550d447`. Whether that repository is private or public was not checked and is **VERIFY** — every environment variable you add to Vercel stays out of it either way |
| `ASGI_APPLICATION` | no longer set; nothing imports channels, daphne or uvicorn |

Not verified, and not claimed:

- **Vercel's runtime, beyond what one failing deployment showed.** No project or deployment was created
  from this machine. You created the first one yourself, and what came back was
  `DisallowedHost at /` for `mant-web-33te.vercel.app` — a Django **technical** page, which is only
  rendered when `DEBUG=True`, and from `/var/task/_vendor/django/…` on Python 3.12.14, which confirms the
  bundle layout described in section 1. My own probes of that deployment returned 400 on `/`,
  `/api/health/` and `/api/properties/` — the Host check rejects before routing, so nothing else about it
  was observable. That single data point also means the backend project booted **without**
  `DJANGO_DEBUG=False` or the `DB_*` values: the defaults applied, so it selected SQLite inside the
  function image. Every other statement about Vercel's behaviour is quoted from its documentation, cited
  below, and each **VERIFY** item in sections 1, 3 and 7 is still open.
- The Namecheap/cPanel claims in `DEPLOYMENT.md` remain unverified — Namecheap's knowledge-base URLs
  were blocked from this machine when that guide was written.
- Which of the two new buckets each existing object belongs to was counted, not inspected
  file-by-file.
- No request was made with real customer data; the read-only checks above used the public listing
  endpoints and the local development database.

Sources for the Vercel behaviour described in this file:
[Deploy a Django app on Vercel](https://vercel.com/docs/frameworks/full-stack/django) (static assets,
entrypoint selection, the single Function, `functions` keys, limits),
[Vite on Vercel](https://vercel.com/docs/frameworks/frontend/vite) (the SPA rewrite quote),
[Set the Python version for your Vercel project](https://vercel.com/docs/functions/runtimes/python/python-version)
(3.12 default, 3.13, 3.14),
[Vercel Functions limits](https://vercel.com/docs/functions/limitations) (bundle size, body size),
[Configuring function duration](https://vercel.com/docs/functions/configuring-functions/duration),
[Bypassing the 4.5 MB body limit](https://vercel.com/kb/guide/how-to-bypass-vercel-body-size-limit-serverless-functions).
