# Deploying Mant_web to Namecheap shared hosting (cPanel)

> **Superseded for hosting decisions — kept for its audit.** Written on 2026-10-22, when the plan was
> SQLite plus uploads on local disk, served by Passenger. Since then uploads moved to Supabase Storage
> (`backend/apps/core/storage_backends.py`) and the Vercel route was prepared in
> [VERCEL_DEPLOYMENT.md](VERCEL_DEPLOYMENT.md). Read that file for anything about where the app runs.
>
> Three things here are now obsolete: the **SQLite** database decision (a Vercel deployment requires
> `DB_ENGINE=postgresql`, and `settings.py` refuses to boot in production without it), the
> **`backend/media/`** upload directory (public artwork and receipt PDFs are bucket objects now, so the
> Apache `/media/` rule and the `<FilesMatch>` block protecting it no longer guard the real files), and
> **Passenger** itself.
>
> Still accurate and worth using: sections on the settings guard, `check --deploy`, the JWT/`localStorage`
> limitations, the login-throttle gap, and the environment-variable list — those describe the code, not
> the host. Nothing has been removed.

Written for this project as it stands on the local Windows machine, from the inspection done on
2026-10-22. Every path, version and command below was read out of the repository or run locally;
anything that depends on the hosting account is marked **VERIFY** and left as a placeholder.

**Read section 2 before you start.** I could not read Namecheap's own documentation from this
machine (both article URLs were blocked), so no statement here about what their plans offer is
confirmed. Nothing in this file has been executed on a remote host.

---

## 1. The architecture being deployed

| Piece | What it is | Where it goes on the host |
| --- | --- | --- |
| Backend | Django 5.2.18 + Django REST Framework 3.18.3, 7 apps (`core`, `accounts`, `properties`, `blog`, `leases`, `billing`, `messaging`), 109 API routes, Django admin at `/django-admin/` | the cPanel *Application root*, e.g. `/home/<cpanel-user>/mant_web/backend` |
| Database | SQLite, one file: `backend/db.sqlite3` (736 KB today) | stays next to `manage.py`; must not be web-reachable |
| Uploads | `backend/media/` (12 MB today): property photos, blog covers, service images, company logo, receipt PDFs, chat attachments | the directory mapped to `/media/` |
| Django static | `backend/staticfiles/` (154 files: admin CSS/JS) | the directory mapped to `/static/` |
| Frontend | React 18.3.1 built by Vite 5.4.21 into `frontend/dist/` (2.7 MB: `index.html`, `assets/`, `favicon.svg`, `.htaccess`) | the document root of the site, e.g. `/home/<cpanel-user>/public_html` |
| Serving | Passenger WSGI through `backend/passenger_wsgi.py` -> `config.wsgi:application` | set up in cPanel -> *Setup Python App* |

There is no server-side rendering and no Django template for the site: the browser loads the React
bundle and that bundle calls `/api/...`. Two things therefore have to work on the host — Passenger
must serve the API, and Apache must serve the built SPA and fall back to `index.html`.

## 2. Compatibility findings

**Found by inspection, safe to rely on:**

- **PASS — WSGI only.** `config/wsgi.py` exposes `application`, imports cleanly with
  `DJANGO_DEBUG=False`, and resolves to `django.core.handlers.wsgi.WSGIHandler`.
- **PASS — no persistent processes.** A full-tree search for `celery`, `redis`, `channels`,
  `websocket`, `gunicorn`, `uvicorn`, `daphne`, `gevent`, `apscheduler` found nothing in the
  application code. `config/asgi.py` exists but is stock Django and nothing imports it, so the
  "ASGI is not supported on shared hosting" limitation does not apply here.
- **PASS — no long-running requests.** `deliver_campaign()` is called only by
  `python manage.py send_email_campaign`, never from a view, so no HTTP request sends a bulk of
  email. The other scheduled work is `generate_invoices` and `mark_overdue`, both management
  commands.
- **PASS — no system binaries or compile-time dependencies.** Every pinned package ships wheels for
  Linux; Pillow and reportlab are the only heavy ones and both are pure wheel installs. Reportlab
  uses the built-in PDF fonts, so no system font files.
- **PASS — static files.** `STATIC_URL` / `STATIC_ROOT` are already configured and
  `collectstatic` succeeds (154 files).
- **PASS — no hard-coded localhost in the bundle.** The API base URL is
  `import.meta.env.VITE_API_BASE_URL || '/api'` and `frontend/src/utils/media.js` reduces any
  absolute media URL to a pathname before re-prefixing it. Nothing in `src/` contains `127.0.0.1`
  or `localhost`.

**Limitations that need a decision or a second phase:**

1. **Receipts and chat attachments live in the public media tree.** Verified live locally: an
   unauthenticated `GET /media/receipts/2026/10/receipts/2025/03/MB-RCP-2026-00017.pdf` returns
   `200 application/pdf`, and the filename is a sequential receipt number, so the next one is a
   guess away. On shared hosting Apache serves `/media/` directly, so this is worse in production
   than the API alone would suggest. The API path is correct — `/api/receipts/{id}/download/`
   scopes the queryset to the tenant or the office — but the file URL is a second door.
   *Least disruptive answer today:* the deny rule in section 13 (`backend/apache.sample.htaccess`
   block 2). *Real fix:* `BACKEND_FOLLOWUPS.md` 19 — documents get their own storage root outside
   `MEDIA_ROOT`. Not done in this pass.
2. **JWTs sit in `localStorage` and logout does not revoke them.** No `token_blacklist` app is
   installed while `ROTATE_REFRESH_TOKENS` is on. Access tokens stay valid for 12 hours, refresh
   for 14 days. Shared hosting cannot fix this; it is an application change.
3. **`POST /api/auth/login/` has no throttle**, so password guessing is unlimited. Throttling is
   configured only on the three public newsletter endpoints.
4. **`GET /api/company/` is public and returns the bank account and mobile-money numbers.**
5. **SQLite** is fine at this size but takes a write lock per statement. With the desk, landlords
   and tenants all writing at once you may see `database is locked`. Accepted for this deployment
   (section 11); the engine switch already exists via `DB_ENGINE`.
6. **Email needs an SMTP provider.** The default backend prints to the console and reports in
   `/api/manage/email/campaigns/stats/` that nothing was delivered. On the host it must point at a
   real SMTP server (section 16), and bulk sending is a cron job, not a button in a request.
7. **WhatsApp reminders are click-to-chat.** Nothing is sent by the server, so no provider, API key
   or background worker is needed — and nothing is delivered or confirmed either. Keep the wording
   as it is.

**Not verified, and I will not guess at it:** the Python versions your plan offers, whether
PostgreSQL/MySQL is available, whether *Setup Python App* is enabled on it, cron availability and
its minimum interval, the memory/CPU limits, the maximum upload size, the exact Passenger log path,
and whether `.htaccess` is honoured inside a Passenger-routed directory. Read each one off your own
cPanel before filling in the placeholders.

## 3. Versions required

| | Needed | Used locally for the checks in this file |
| --- | --- | --- |
| Python (on the host) | **3.11 or newer.** `django-filter==26.2` declares `Requires-Python >=3.11`; Django 5.2 declares `>=3.10`. If cPanel only offers 3.10, pin `django-filter<26` and re-run the tests | — (local venv is 3.15.0, which cannot be uploaded; the virtualenv is created on the host) |
| Node.js (your PC only) | 18 or newer — the React build runs locally, never on the host | v24.22.0, npm 11.19.1 |
| Django | 5.2.18 (pinned) | 5.2.18 |
| Database | SQLite via Python's built-in `sqlite3`; no server, no driver | 736 KB file |
| Browser bundle | ES2020+ (Vite default target) | Vite 5.4.21, React 18.3.1 |

## 4. Environment variables

All of them are read from `backend/.env`, which `config/settings.py` loads from the directory next
to `manage.py`. Copy `backend/.env.example` to `backend/.env` on the host and fill this in.
**Never put the real `.env` in the repository** — `.gitignore` already excludes it.

```ini
# --- required ---------------------------------------------------------------
DJANGO_SECRET_KEY=<generate on the host: python -c "from django.core.management.utils import get_random_secret_key as k; print(k())">
DJANGO_DEBUG=False
DJANGO_ALLOWED_HOSTS=<yourdomain.com>,www.<yourdomain.com>,api.<yourdomain.com>
DJANGO_TIME_ZONE=Africa/Kampala
LOG_LEVEL=INFO

# --- database (SQLite, as decided) ------------------------------------------
DB_ENGINE=sqlite

# --- email ------------------------------------------------------------------
EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend
EMAIL_HOST=<smtp host from your mail account>
EMAIL_PORT=587
EMAIL_HOST_USER=<full mailbox address>
EMAIL_HOST_PASSWORD=<mailbox password or app password>
EMAIL_USE_TLS=True
DEFAULT_FROM_EMAIL="Mant Bridges LTD" <no-reply@<yourdomain.com>>

# --- links inside emails ----------------------------------------------------
PUBLIC_SITE_URL=https://<yourdomain.com>
NEWSLETTER_CONFIRM_HOURS=72
NEWSLETTER_SUBSCRIBE_RATE=20/min
NEWSLETTER_TOKEN_RATE=60/min

# --- production switches, all OFF until you have proved you need them -------
# Only if the SPA and API are on different origins AND something sends cookies:
#CSRF_TRUSTED_ORIGINS=https://<yourdomain.com>
# Only after confirming which header the front end forwards:
#DJANGO_TRUSTED_SSL_HEADER=HTTP_X_FORWARDED_PROTO,on
# Only to debug the API remotely. Defaults to off when DEBUG=False.
#DJANGO_API_DOCS=True
# Only once https is known good. HSTS cannot be recalled once browsers cache it.
#DJANGO_SECURE_SSL_REDIRECT=True
#DJANGO_SECURE_HSTS_SECONDS=31536000
# The SPA sends a Bearer header, not cookies. Leave unset.
#CORS_ALLOW_CREDENTIALS=False
```

`DJANGO_ALLOWED_HOSTS` is not optional: with `DJANGO_DEBUG=False` and the wrong host header every
request answers `400`. And since this pass, a missing or short `DJANGO_SECRET_KEY` while
`DEBUG=False` makes Django **refuse to start** instead of quietly booting on the development key —
if the app fails to start after you upload, that is the first line of the error to read.

For the frontend, two optional build-time variables (they are baked into the bundle, so set them
before `npm run build`, never after):

```bash
# frontend/.env.production  — create only if the API is on another origin
VITE_API_BASE_URL=https://api.<yourdomain.com>/api
VITE_MEDIA_BASE_URL=https://api.<yourdomain.com>/media
```

With the single-domain layout in section 14 you need neither.

## 5. Back up before you touch anything

Do this before the first upload and again before every later one.

1. Local copy: zip the whole `mant_web` folder **excluding** `backend/.venv` and
   `frontend/node_modules`. The database and uploads are inside it (`backend/db.sqlite3`,
   `backend/media/`) and are the only copies of your real records until the host has them.
2. Download `backend/db.sqlite3` over FTP/SFTP and keep it timestamped, e.g.
   `backup/db-2026-10-22.sqlite3`. While the dev server is running the file can be mid-write — stop
   the server first, or take the safe route:
   ```
   cd backend && .venv\Scripts\python.exe manage.py dbshell
   .backup 'C:/backup/db-snapshot.sqlite3'
   ```
3. Download `backend/media/` in full (12 MB today). It is in `.gitignore`, so git holds no copy.
4. Once the site is live, repeat 2 and 3 against the **host** each time, before you deploy.

## 6. Build the React app locally

On Windows, in Git Bash:

```bash
cd /c/Users/Mant Bridges/Desktop/mant_web/frontend
npm ci          # installs exactly what package-lock.json says
npm run build
```

Last run here: `2097 modules transformed`, `dist/assets/index-DPaYTLwV.css 46.39 kB`,
`dist/assets/index-ZS_4ChFG.js 634.24 kB`, `built in 11.64 s`.

If the API is on a separate origin, create `frontend/.env.production` (section 4) **before** the
build, then confirm it landed:

```bash
grep -o "https://api[^\"']*" dist/assets/*.js | head
```

`dist/` now contains `index.html`, `assets/`, `favicon.svg` and `.htaccess` (the SPA fallback came
from `frontend/public/` and is copied automatically).

Nothing about the local workflow changes: `npm run dev` still proxies `/api` and `/media` to
`http://127.0.0.1:8000`, and `VITE_BACKEND_URL` still moves that target.

## 7. Upload the backend

**Create the directory first**, then upload with FileZilla (SFTP, not plain FTP).

Upload from `backend/`:

```
apps/            config/         manage.py
requirements.txt passenger_wsgi.py
.env.example     seed_images/    media/          db.sqlite3
```

Then, on the server, copy `.env.example` to `.env` and edit it (section 4). Uploading a local
`.env` is the other way to do it, but the local one has `DJANGO_DEBUG=True` and
`ALLOWED_HOSTS=localhost` in it — if you upload it, edit it on the server immediately.

Do **not** upload:

| Skip | Why |
| --- | --- |
| `.venv/` | built on Windows; the interpreter paths are wrong on Linux and it is 100+ MB |
| `__pycache__/`, `*.pyc` | stale bytecode from 3.15 |
| `staticfiles/` | regenerate on the host with `collectstatic` |
| local `.env` as-is | `DJANGO_DEBUG=True` would take the site live in debug mode |
| `frontend/` | not part of the Python app root |

Two checks worth running from the repo before uploading, so nothing secret leaves your machine:

```bash
cd /c/Users/Mant Bridges/Desktop/mant_web
du -sh backend/.venv backend/media backend/db.sqlite3
find backend -name "*.sqlite3" -o -name ".env" | grep -v .venv
```

The only files in that second list should be `backend/.env` (never uploaded) and
`backend/db.sqlite3` (uploaded deliberately, because it is your data).

## 8. Create the Python application in cPanel

cPanel -> **Select App** / *Setup Python App* -> **Create Application**.

| Field | Value |
| --- | --- |
| Application root | `/home/<cpanel-user>/mant_web/backend` — the directory that holds `manage.py` |
| Application URL | `api.<yourdomain.com>` (or the domain itself, section 14) |
| Application startup file | `passenger_wsgi.py` |
| Startup environment / production | `production` |
| Python version | **3.11 or newer** — VERIFY in the dropdown; below 3.11 `django-filter==26.2` will not install |
| Virtualenv | create it from this screen; path is usually `/home/<cpanel-user>/virtenvs/mant_web_...` |

**VERIFY:** whether your plan offers this feature at all, and which Python versions are listed.
If the app root must sit outside the web-accessible tree, that is what you want, not a problem.

After creating it, cPanel shows a "source the virtualenv" command for the terminal. It looks like:

```bash
source /home/<cpanel-user>/virtenvs/<the-path-cPanel-shows>/bin/activate
```

Use the command exactly as cPanel prints it. Everything in sections 9-13 runs inside it.

## 9. Install the Python dependencies

With the virtualenv active:

```bash
cd /home/<cpanel-user>/mant_web/backend
python --version          # must be 3.11+
pip install --upgrade pip
pip install -r requirements.txt
python -c "import django, rest_framework, PIL, reportlab; print(django.get_version())"
```

`5.2.18` should print. If pip reports it cannot find a version matching `django-filter==26.2`, the
interpreter is older than 3.11 — go back and pick a newer one, do not downgrade Django.

## 10. `passenger_wsgi.py` and the WSGI entry point

Already in the repository, and it does not need editing — it is the reason the app root is
`backend/`:

```python
APP_DIR = os.path.dirname(os.path.abspath(__file__))
if APP_DIR not in sys.path:
    sys.path.insert(0, APP_DIR)
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
from config.wsgi import application
```

Two things to know about it:

- Passenger requires the name `application`. `config/wsgi.py` already provides it.
- It must be **in** the Application root, next to `manage.py`, so `config/settings.py` can find
  `.env` (settings looks for it one level above `config/`).

Check it the way Passenger will, from the virtualenv:

```bash
cd /home/<cpanel-user>/mant_web/backend
python -c "import passenger_wsgi; print(passenger_wsgi.application)"
```

A `<django.core.handlers.wsgi.WSGIHandler object ...>` line means the entry point, the settings,
`.env` and every installed app import cleanly. An `ImproperlyConfigured: DJANGO_SECRET_KEY must be
a long random value...` means step 8's `.env` is missing or unreadable — fix that, don't work
around it by turning debug on.

## 11. The production database

SQLite, as decided — one file, no server, no driver, nothing to connect to.

Layout rules:

- `backend/db.sqlite3` sits in the app root. The app root is normally not the document root, so it
  is not web-served; the deny rule in section 13 makes that explicit either way. **VERIFY** by
  requesting `https://api.<yourdomain.com>/db.sqlite3` anonymously — anything other than 403/404 is
  a problem to fix before you put real data there.
- The web process must be able to **write** the file *and its directory* (SQLite creates
  `-journal`/`-wal` beside it). If you see `attempt to write a readonly database`, that is
  directory permission, not file permission.
- Keep it out of any backup-excluded folder and back it up daily (section 5).
- Concurrency: one writer at a time. Fine for a desk and a handful of landlords; if you start
  seeing `database is locked`, that is the signal to move to a server database, and
  `DB_ENGINE=postgresql` / `DB_ENGINE=mysql` plus a driver in `requirements.txt` is the route.
  `requirements.txt` documents the drivers as commented-out lines precisely so nothing installs by
  accident.

## 12. Migrations — safely, in this order

Migrations are additive: nothing in this pass changed a model, and
`python manage.py makemigrations --check --dry-run` reports *No changes detected*, so the 19
existing migrations are the whole schema.

```bash
cd /home/<cpanel-user>/mant_web/backend

# 1. read-only plan of what would run
python manage.py migrate --plan

# 2. take the backup from section 5, then apply
cp db.sqlite3 /home/<cpanel-user>/backups/pre-migrate.sqlite3
python manage.py migrate

# 3. confirm
python manage.py showmigrations | head -40
```

If `--plan` lists migrations you did not expect, stop and compare against the local machine before
running step 2.

Never run `migrate --fake`, `flush`, `reset_db`, or delete anything under `apps/*/migrations/`.
Never generate a fresh schema on the host and then copy data into it by hand — run the same
migrations against a copy of the uploaded database.

First deployment only: if the uploaded `db.sqlite3` is the real one, `migrate` should say
`No migrations to apply.` for every app. If it wants to create tables from scratch, the file did
not upload — restore the backup and re-upload rather than building an empty database.

## 13. Static files and media on the host

```bash
cd /home/<cpanel-user>/mant_web/backend
python manage.py collectstatic --noinput
# 154 static files copied to '/home/<cpanel-user>/mant_web/backend/staticfiles'
```

That directory holds Django admin's own CSS and JS. If `/django-admin/` loads as unstyled text,
`/static/` is not mapped — check it anonymously:

```bash
curl -I https://api.<yourdomain.com>/static/admin/css/base.css
```

**Media.** `MEDIA_URL = "media/"`, `MEDIA_ROOT = backend/media/`. Under `DEBUG=False`, Django does
not serve media at all — the web server must. Either the host aliases `/media/` to that directory,
or you keep `media/` under the document root and point `MEDIA_ROOT` there in `.env` terms.
**VERIFY** which your plan allows; then prove it with a real property photograph URL from
`/api/properties/` — the image must load in a browser.

Because receipts and chat attachments are stored in that same tree, install the deny rule before
you put real records on the host. Take block 2 of `backend/apache.sample.htaccess`, upload it as
`media/.htaccess`, and check it:

```bash
curl -I "https://api.<yourdomain.com>/media/receipts/2026/10/receipts/2025/03/MB-RCP-2026-00017.pdf"
# want 403 or 404. A 200 means the rule is not being honoured - section 2 limitation 1.
```

Block 1 of the same file goes in the app root and denies `.sqlite3`, `.env`, `.py` and `.log`.
Whether Passenger-routed domains honour `.htaccess` at all is **VERIFY** — the anonymous curl above
is the only proof that counts, and it has not been run anywhere but locally.

## 14. Upload the React build, and choose the URL layout

Two layouts. Pick one; the configuration in sections 4, 8 and 15 follows from it.

**A. One domain, recommended (least moving parts).** The API and the SPA share
`https://<yourdomain.com>`: Passenger answers the domain and Apache serves
`public_html` for everything else.

- If cPanel lets the app domain also serve static files from the document root, this is the ideal
  setup: put `dist/` contents in `public_html`, and no `VITE_*` variables are needed at all,
  because `/api`, `/media` and `/static` are already same-origin paths.
- **VERIFY this before relying on it**, because it decides everything else: request
  `https://<yourdomain.com>/index.html` while the app is bound to that domain. If Passenger swallows
  static requests instead, use layout B.

**B. Two origins (works without any host-specific trick).**

| Host | Serves | How |
| --- | --- | --- |
| `https://<yourdomain.com>` and `www.` | the SPA | `public_html/` = contents of `frontend/dist/` |
| `https://api.<yourdomain.com>` | Django | cPanel Python app, section 8 |

Upload `dist/`'s **contents** (not the folder itself) into `public_html`, so it holds
`index.html`, `assets/`, `favicon.svg`, `.htaccess`. Then rebuild once with
`VITE_API_BASE_URL=https://api.<yourdomain.com>/api` and
`VITE_MEDIA_BASE_URL=https://api.<yourdomain.com>/media`, and on the API host set:

```ini
CORS_ALLOWED_ORIGINS=https://<yourdomain.com>,https://www.<yourdomain.com>
# nothing else needs cookies cross-origin, so CSRF_TRUSTED_ORIGINS stays unset
```

`.htaccess` (from `frontend/public/`) does the SPA fallback and deliberately leaves
`/api`, `/media`, `/static` and `/django-admin` alone — without that exclusion, a JSON call would
come back HTTP 200 containing the React page, which is the hardest failure in this list to
diagnose.

## 15. Domain, HTTPS, CORS and CSRF checklist

- Point the domain and `www.` at the account; request an SSL certificate in cPanel
  (**VERIFY** the menu name — *SSL/TLS Status* / *Let's Encrypt*) and turn on *Force HTTPS* there
  rather than through `DJANGO_SECURE_SSL_REDIRECT`. Doing it at the edge avoids the loop, and
  leaves Django free to answer plain http from inside the proxy.
- Only after https is confirmed working, consider `DJANGO_SECURE_SSL_REDIRECT=True`, then
  `DJANGO_SECURE_HSTS_SECONDS=31536000`. HSTS is browser-cached and cannot be recalled.
- If links inside generated emails or media URLs come back as `http://`, set
  `DJANGO_TRUSTED_SSL_HEADER` — but only to the header your proxy actually forwards, confirmed
  first. Trusting a header an outside client can set is a real vulnerability, not a config
  shortcut.
- `ALLOWED_HOSTS`: bare hostnames, no scheme, no path, comma-separated — the domain, `www.`, and
  the api subdomain.
- `CORS_ALLOWED_ORIGINS`: only for layout B, full `https://` origins.
- `CSRF_TRUSTED_ORIGINS`: leave unset unless a cookie-based flow appears. `django.middleware.csrf`
  stays in the middleware list for the admin, which is same-origin and unaffected.
- `PUBLIC_SITE_URL=https://<yourdomain.com>` — newsletter confirm and unsubscribe links are built
  from it, and with the development default they would email a `127.0.0.1` link to subscribers.

## 16. Media, email, cron and external services

**Email.** Create the mailbox, then fill the SMTP block in section 4 and prove it without touching
the newsletter table:

```bash
python manage.py shell -c "from django.core.mail import send_mail; send_mail('Mant Bridges test','body','no-reply@<yourdomain.com>',['<your own address>'])"
```

**Cron** (cPanel -> *Cron Jobs*; **VERIFY** the minimum interval your plan allows — many shared
plans enforce a hourly minimum). Every command needs the virtualenv's python and the backend
directory:

```cron
# 04:00 - raise this month's rent invoices
0 4 * * *   cd /home/<cpanel-user>/mant_web/backend && /path/to/venv/bin/python manage.py generate_invoices >> ~/logs/mant-cron.log 2>&1
# 05:00 - flip past-due invoices to overdue
0 5 * * *   cd /home/<cpanel-user>/mant_web/backend && /path/to/venv/bin/python manage.py mark_overdue    >> ~/logs/mant-cron.log 2>&1
# every 15 min - send a slice of one campaign; the command records its own progress
*/15 * * * * cd /home/<cpanel-user>/mant_web/backend && /path/to/venv/bin/python manage.py send_email_campaign --limit 50 --delay 0.5 >> ~/logs/mant-campaign.log 2>&1
```

`send_email_campaign` takes a campaign and a `--limit`, so a few thousand subscribers are sent in
batches that each finish inside the request limits, and re-running it resumes rather than
double-sending. That is deliberate: shared hosting prohibits the persistent workers that would
otherwise do this, and there is no reason to need one.

Cron cannot write to `MEDIA_ROOT` as the web user, so if the same job runs as your cPanel user
while Passenger runs as another, check the file ownership after the first run.

**WhatsApp / SMS.** No provider, no credentials, no cron. Reminders are click-to-chat links a human
opens from the desk; the record says `OPENED`, never "delivered". Do not add sending unless you
accept a paid API and its consent rules.

**Nothing else external.** No Redis, no cache server, no object storage, no CDN. If media later
outgrows the account's disk, `VITE_MEDIA_BASE_URL` plus a storage backend is the intended
escape hatch — the frontend already handles the origin swap.

## 17. Restart the app and read the logs

- cPanel's Python app page has a **Restart** button. From the shell, `touch` the app root's
  `restart.txt` if your panel uses it. **VERIFY** which your panel offers.
- Logs, in the order that usually finds the answer:
  - the cPanel Python app screen itself, which prints the current interpreter and virtualenv;
  - `~/logs/<domain>-error.log` or the *Errors* section of cPanel -> **VERIFY** the path;
  - `tail -f ~/stderr.log` for Passenger start-up failures;
  - Django's own output goes to the console handler (`LOG_LEVEL`), which Passenger writes into the
    application log for the account.
- After every change to `.env`, restart. Django reads it once at startup.

## 18. When it does not work

| Symptom | Most likely cause here | What to run |
| --- | --- | --- |
| **500** on every page, "Internal Server Error" with no detail | correct for production — debug is off. The real traceback is in the application log | `python -c "import passenger_wsgi"` from the virtualenv; that surfaces import, settings and `.env` errors in your face |
| 500 naming `ImproperlyConfigured: DJANGO_SECRET_KEY` | `.env` missing, unreadable, or still the example value | `ls -l .env` in the app root; `cat .env` from the virtualenv's directory |
| **400** Bad Request (DisallowedHost) on every page | the host is not in `ALLOWED_HOSTS` | check the exact header: `curl -I -H "Host: <yourdomain.com>" ...`, then fix `.env` and restart |
| **503 / "Application root does not exist"** | wrong Application root, or startup file not `passenger_wsgi.py` | re-read section 8; the root is the directory holding `manage.py` |
| **404** on `/properties/<slug>` after a refresh, but the site loads when clicked from home | `.htaccess` did not upload, or `AllowOverride` is off | `curl -I https://<yourdomain.com>/properties` — a 404 means the fallback is not active; ask the host about `.htaccess` and set the fallback in the Apache Settings menu instead |
| **404** on `/api/...` while the SPA loads | layout mismatch: the API requests are hitting the static host | check which origin the bundle was built with: `grep -o '"/api' dist/assets/*.js`; rebuild with `VITE_API_BASE_URL` if the API is elsewhere |
| **403** on `/django-admin/` or an image directory | a deny rule too broad | the `<FilesMatch>` list in `apache.sample.htaccess` block 1 denies `.py`; make sure it is not applied to the document root that also serves assets |
| JSON calls returning HTML | the `/api` exclusion in `.htaccess` is missing | compare against `frontend/public/.htaccess` and re-upload |
| Admin page loads with **no styling** | `/static/` not mapped to `staticfiles/` | `curl -I .../static/admin/css/base.css`, then `collectstatic` again (section 13) |
| Images broken everywhere | `/media/` not aliased, or `VITE_MEDIA_BASE_URL` baked in wrong | open one image URL from `/api/properties/` directly in a browser |
| CORS error in the browser console (layout B) | the origin string is missing, or has a trailing slash / `www` mismatch | `curl -si -H "Origin: https://<yourdomain.com>" https://api.<yourdomain.com/api/health/ \| grep -i access-control` — expect `access-control-allow-origin` echoed back |
| Login works then dies on refresh (layout B) | the token is fine; the failing thing is a cross-origin media or API call | same CORS check above |
| `OperationalError: attempt to write a readonly database` | the **directory** is not writable by the web user | `ls -ld` on the backend directory; `touch db.sqlite3-journal` as the app to test |
| `database is locked` under use | SQLite write contention | back off to one writer; if it persists, that is the trigger to move database (section 11) |
| Health check | the app is up | `curl -s https://api.<yourdomain.com>/api/health/` should return JSON; the endpoint is public by design |
| Newsletter email links go to `127.0.0.1:5173` | `PUBLIC_SITE_URL` still the development default | set it, restart, send a new confirmation |

## 19. Deploying a later change, safely

The repository is a git working copy (`HEAD` is `6ab20e5`, "final improvements on v1"). Nothing in
this project pushes automatically.

1. Locally: `git status`, commit the change, then run the checks in section 20. If models changed,
   `makemigrations` locally, review the file, and confirm the tests still pass before shipping.
2. Back up the **host's** `db.sqlite3` and `media/` first (section 5). This is the step people skip.
3. Rebuild the frontend if `frontend/` changed: `npm run build`.
4. Upload only what changed: `apps/`, `config/`, `templates/`, `manage.py`, `requirements.txt`,
   `passenger_wsgi.py` for backend work; `dist/` contents for frontend work.
   **Never** overwrite on the host: `db.sqlite3`, `media/`, `.env`, `staticfiles/` (regenerate it
   instead), `seed_images/` unless you added artwork.
5. If `requirements.txt` changed: activate the virtualenv, `pip install -r requirements.txt`.
6. If migrations changed: `python manage.py migrate --plan`, read it, then `python manage.py migrate`.
7. `python manage.py collectstatic --noinput` if any app ships new static files.
8. Restart (section 17), then re-run the smoke list in section 20 against the live host.

Keep the host's `.env` out of git and out of the upload; if you must change it, edit it on the
server so the development values never travel.

## 20. Rollback and restoration

**Fast path — restart only.** Most failed deploys are a bad file, not a bad database. If the app
500s after an upload and no migration ran, restore the previous versions of the files you changed,
restart, done.

**Full restore of the site as it was:**

1. Stop traffic to the broken app by moving `passenger_wsgi.py` aside — the app fails to start, so
   visitors see an error page rather than half-working data. Do this before restoring.
2. Upload the timestamped `db.sqlite3` backup into `backend/`, overwriting the current one.
   `cp db.sqlite3 db.sqlite3.broken-<date>` on the host first, so a bad restore is still recoverable.
3. Restore `media/` from the same snapshot if files went missing. Delete nothing that arrived after
   the backup — move it to a holding folder; uploads are tenant and owner documents.
4. Revert the code to the last known-good state (`git checkout <that commit>` locally, re-upload)
   **including** any migrations it expects. A database from a later migration than the code is the
   classic dead end: prefer restoring the matching older database over running
   `migrate <app> <migration> --fake`.
5. Activate the virtualenv, `pip install -r requirements.txt` if pins changed,
   `collectstatic --noinput`, restart.
6. Prove it: `/api/health/`, log in at `/django-admin/`, load one property photograph, one receipt
   download, one public listing page, and `/properties/<slug>` on a hard refresh.

If a migration was applied and data depends on it, restore the pre-migration database instead of
un-applying the migration. That is why step 5 of section 5 exists.

---

## Status of every check in this file

| Check | Command | Result |
| --- | --- | --- |
| System check | `manage.py check` | **PASS** — "no issues (0 silenced)" |
| Deployment check | `manage.py check --deploy` (`DEBUG=False`) | **PASS with 2 warnings** — `security.W004` (HSTS off, deliberate, section 15) and `security.W008` (SSL redirect off, deliberate). 79 further findings are `drf-spectacular.W001/W002` schema-annotation warnings, not security. With a proper-length key, `W009` clears. |
| Models vs migrations | `makemigrations --check --dry-run` | **PASS** — "No changes detected" |
| WSGI entry point | `python -c "from config.wsgi import application"` under `DEBUG=False` | **PASS** — `WSGIHandler` |
| Fail-fast secret | same command with `DJANGO_SECRET_KEY` unset and `DEBUG=False` | **PASS** — refuses to start with `ImproperlyConfigured` |
| Static collection | `collectstatic --noinput` | **PASS** — 154 files |
| Backend tests | `manage.py test apps.core` | **PASS** — `Ran 101 tests in 113.714s`, `OK` |
| Frontend build | `npm run build` | **PASS** — 2097 modules, CSS 46.39 kB, JS 634.24 kB, 11.64 s |
| Secrets not in the package | `.gitignore` review + `find` for `.env` / `*.sqlite3` | **PASS** — `.env`, `db.sqlite3`, `media/`, `.venv/`, `node_modules/`, `dist/`, `staticfiles/` all excluded |
| No localhost in the bundle | grep of `frontend/src` + the `dist/` grep in section 6 | **PASS** in source; the built bundle still resolves `/api` relative, which is correct for layout A and needs `VITE_API_BASE_URL` for layout B |
| Role permissions preserved | nothing in this pass touched permissions, and 101 tests cover the landlord/tenant scoping | **PASS** locally |
| Private document protection | anonymous `GET` of a receipt PDF | **FAIL (known, documented)** — 200 `application/pdf` locally; the `/media/receipts` deny rule in section 13 is the mitigation and has not been proved on a host |
| Anything on the remote host | — | **NOT VERIFIED** — nothing was deployed, no remote request was made, and Namecheap's own documentation could not be read from this machine |

**This project is not ready to be declared Namecheap-compatible.** It is ready for you to read the
plan off cPanel, fill the placeholders marked **VERIFY**, and follow sections 5-17 once. The three
things I would fix before real tenant data goes on that server are, in order: the private media
tree (section 2 limitation 1), the login throttle (limitation 3), and the public company payload
(limitation 4).
