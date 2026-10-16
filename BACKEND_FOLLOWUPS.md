# Backend follow-ups

Every item here is a feature the React frontend either omits, labels as unavailable, or
currently works around. Nothing on this list is wired up in the UI as if it functioned.

Order reflects what users hit first, not effort.

---

## 1. Password reset (high)

**Current state:** `POST /api/auth/*` has no reset endpoints. The login page states plainly
that reset is unavailable and tells the user to contact the desk. Users who lose a password
must be reset by an administrator via `PATCH /api/users/{id}/` or the Django admin.

**Proposed:**
- `POST /api/auth/password-reset/` — `{ email }`, `AllowAny`, always returns 202 (never reveals
  whether the address exists).
- `POST /api/auth/password-reset/confirm/` — `{ uid, token, new_password }`.
- `GET /api/auth/password-reset/check/` (optional, for the React form to pre-validate a token).

**Implementation notes:** reuse Django's `PasswordResetTokenGenerator` with a custom uid token
class; `EMAIL_BACKEND` is already env-driven (`console` in dev, SMTP in production). Rate-limit
the request endpoint per IP and per email. Frontend then replaces the static notice on
`pages/auth/Login.jsx` with a link plus two routes, `/reset-password` and
`/reset-password/confirm`.

## 2. Token revocation on logout (high, security)

**Current state:** logout clears `mb.access`, `mb.refresh`, `mb.user` from `localStorage` only.
`SIMPLE_JWT` sets `BLACKLIST_AFTER_ROTATION: False` and `blacklist` is not in `INSTALLED_APPS`,
so an access token stays valid for its full 12 hours and a refresh token for 14 days after
"sign out". Stolen or shared tokens cannot be revoked server-side.

**Proposed:**
- Add `rest_framework_simplejwt.token_blacklist` to `INSTALLED_APPS`, set
  `ROTATE_REFRESH_TOKENS: True` + `BLACKLIST_AFTER_ROTATION: True`.
- `POST /api/auth/logout/` — blacklist the incoming refresh token; call it from
  `AuthContext.logout()` before clearing local state.
- Shorten `ACCESS_TOKEN_LIFETIME` (15–30 minutes) once refresh rotation is in place; the client
  already refreshes transparently on 401 in `api/client.js`.

## 3. Email / identity verification (medium)

**Current state:** `/api/auth/verify/` is SimpleJWT's `TokenVerifyView` (it checks a token, not a
person's email), registration marks the account active immediately, and
`pages/auth/Register.jsx` discloses this.
National ID and TIN are stored on `accounts.User` but never verified.

**Proposed:** `POST /api/auth/verify-email/`, `POST /api/auth/resend-verification/`, plus a
`verified_at` field on `User` and an `is_verified` flag exposed in `user_payload()`. The frontend
would then show a verification banner in the dashboards and gate invoice/payment actions if the
business requires it.

## 4. Landlord access to a tenant list (medium — blocks a real workflow)

**Current state:** creating or editing a lease needs a tenant, resolved from
`GET /api/leases/options/`. For an ADMIN that returns all tenants; a LANDLORD only receives the
tenants already linked to their own leases. A landlord taking on a brand-new tenant therefore
cannot complete the lease form — the UI shows an explanatory `Callout` instead of a broken picker.

**Proposed (choose one and tell me which):**
- `GET /api/manage/tenants/` scoped to `LANDLORD`, returning a minimal public profile
  (id, full_name, phone, email) for accounts that have agreed to be discoverable, or
- let a landlord invite a tenant: `POST /api/manage/tenant-invites/` creating a pending
  TENANT account that the invitee completes via a tokenised link.

The second option is the safer one: it avoids exposing the whole tenant register to every
landlord on the platform.

**Related:** `POST /api/manage/properties/` requires `owner` for an ADMIN. Landlords get their
own account injected. If invites exist, the owner field should follow the same rule.

## 5. Landlord read access to enquiries (medium)

**Current state:** the enquiry inbox is `IsAdminRole` only (`/api/manage/enquiries/`). A landlord
cannot see who asked about their own building. `pages/manage/Enquiries.jsx` is therefore mounted
under an ADMIN-only route and the landlord sidebar omits it.

**Proposed:** keep the endpoint admin-only but add `GET /api/manage/enquiries/mine/` filtered to
`property__owner=request.user`, or relax the viewset queryset the same way
`ManagedPropertyViewSet` already scopes by owner. Landlords should not be able to PATCH statuses
belonging to another owner's property — enforce with the existing object-permission pattern
(`IsPropertyOwnerOrAdmin`).

## 6. Careers: vacancies and applications (medium)

**Current state:** `/careers` renders role *categories* and the hiring process in copy, plus the
existing enquiry form. It deliberately shows "No advertised vacancies right now" and states that
the site does not track applications. There is no fake application form.

**Proposed:**
- `apps.core.models.Vacancy` — title, department, description, closing_date, is_open, created_at.
- `apps.core.models.Application` — vacancy, name, email, phone, cv (FileField), note, status.
- `GET /api/vacancies/` (`AllowAny`, only `is_open`), `POST /api/vacancies/{id}/apply/`
  (`AllowAny`, with throttling and captcha/reCAPTCHA if public),
  `GET|PATCH /api/manage/vacancies/` (admin).
- Frontend then replaces the empty state on `pages/public/Careers.jsx` with the live list and a
  real application modal.

## 7. Unit management (medium — data-model gap)

**Current state:** `Property` is one row per building/house with `bedrooms`, `bathrooms`,
`parking`, `price`. A multi-unit building cannot have per-unit rent, per-unit occupancy or
per-unit invoices; the tenant is attached through the lease instead. `/manage/*` has no unit screen
because the backend has no unit model.

**Proposed:** `apps.properties.models.Unit` (property, number, floor, size, rent_override,
status) with `Lease.unit` FK (nullable during migration). Then `GET|POST /api/manage/units/`,
and a Units panel inside the property edit form. Until this exists, "one property = one tenancy"
is the operating assumption and should be stated to the business.

## 8. Viewing bookings (medium)

**Current state:** there is no booking model. Enquiries have a `property` FK and a free-text
message, and the UI on `/contact` and each property page says a viewing is only confirmed when an
agent replies — no calendar, no "booked" badge.

**Proposed:** `apps.properties.models.Viewing` (property, enquiry, tenant, agent, scheduled_at,
status: REQUESTED/CONFIRMED/DECLINED/DONE, notes) with
`POST /api/viewings/` (authenticated or public-with-captcha),
`PATCH /api/manage/viewings/{id}/`. Frontend adds a "Viewings" panel to the property detail and
a `Request a viewing` date picker on the public listing.

## 9. Maintenance tickets (medium)

**Current state:** tenants raise maintenance through the messaging inbox (`category` includes
`MAINTENANCE`), which works but has no status, assignee, or ageing. The tenant sidebar and the
message composer expose the category because the backend supports it.

**Proposed:** `apps.leases.models.MaintenanceTicket` (lease, reporter, description, category,
priority, status, assigned_to, resolved_at, photo) + `GET|POST /api/tickets/`,
`PATCH /api/manage/tickets/{id}/`. A dedicated portal page then replaces the "use messages"
path, and the dashboard can show open ticket counts.

## 10. Lease and statement PDF (low–medium)

**Current state:** `GET /api/invoices/{id}/pdf/` and `GET /api/receipts/{id}/download/` return
real PDFs (verified: 200, `%PDF` magic bytes). Leases have no document endpoint, so
`/manage/leases/{id}` offers no download; the statement is an on-screen table only.

**Proposed:** `GET /api/leases/{id}/pdf/` and `GET /api/leases/{id}/statement.pdf/` mirroring the
invoice renderer. Frontend adds two buttons — no other change needed.

## 11. Scheduling the rent sweep (low, but operationally important)

**Current state:** the logic already exists and is correct —
`python manage.py generate_invoices` (idempotent; `--lease`, `--until`, `--months`) and
`python manage.py mark_overdue` (`--as-of`), which calls
`apps.billing.services.daily_maintenance()` to expire finished leases, mark invoices overdue and
apply late fees. Per-invoice `POST /api/invoices/{id}/apply-late-fee/` and
`POST /api/invoices/{id}/remind/` also work, and the desk uses them from the UI.
What is missing is **a scheduler**: nothing runs the two commands on a nightly/monthly cadence,
so overdue flags and late fees only move when someone presses a button or opens a shell.
Reporting stays accurate regardless, because `effective_status` is computed at read time.

**Proposed:** schedule `mark_overdue` nightly and `generate_invoices` monthly (cron on Linux,
Task Scheduler on Windows, or Celery beat / `django-cron` if you prefer in-app). Both paths must
stay idempotent — a double run would double-charge a tenant. Also decide whether the sweep should
raise reminder messages automatically for newly overdue invoices; today reminders are a manual,
auditable action, which is defensible but should be a choice rather than an accident.

## 12. Split company settings by owner (low)

**Current state:** `PATCH /api/company/` is admin-only, and `GET /api/company/` is public and
returns bank account number, mobile-money number, invoice/receipt/lease/payment prefixes,
`grace_period_days` and late-fee policy. The tenant portal legitimately needs the payment
instructions; prefixes and fee policy do not need to be public.

**Proposed:** add a `?scope=public` (or a dedicated `/api/company/payment-details/`) response
containing only name, contact, address, currency, bank/mobile-money instructions. Keep full
profile behind `IsAdminRole`. Frontend then drops nothing — `api/client.js` already sends the
token where required — but I would remove the prefix fields from the public payload.

## 13. Login throttling and session hygiene (low, security)

**Current state:** `POST /api/auth/login/` has no throttle; unlimited guesses per account.
`REST_FRAMEWORK` defines no `DEFAULT_THROTTLE_RATES`.

**Proposed:** add `SCOPED_THROTTLE` classes on login/register/enquiry-create (e.g.
`django.core.cache` based, 10/min per IP), and consider a `last_login_failed` audit field.

## 14. Pagination ergonomics (low, DX)

**Current state:** `PAGE_SIZE = 12` with no `page_size_query_param`, so any dropdown that needs a
complete set must page through it. The frontend solves this with
`collect(getter, params, cap)` in `api/paginate.js`, capped at 15 pages.

**Proposed:** `"PAGE_SIZE": 12` plus `page_size_query_param = "page_size"` and
`max_page_size = 200`, and a separate compact serializer for option lists. Once done, the
`collect()` calls can be replaced by a single `?page_size=200` request.

## 15. Attachment handling in messages (low)

**Current state:** `Message.attachment` is stored and served; the composer uploads it and the
thread renders a download link. There are no email or SMS notifications, so nothing pulls a
reader in — the inbox page says so.

**Proposed:** notification fan-out (email at minimum, using the existing `EMAIL_*` settings),
plus a `Notification` model if in-app bell behaviour is wanted.

---

### Also worth noting, without UI impact today

- `DEBUG`, `SECRET_KEY` and SQLite all come from `.env`; production needs
  `DJANGO_DEBUG=False`, a generated key, real `ALLOWED_HOSTS`, PostgreSQL, `collectstatic` and a
  media backend (S3/OSS) since `MEDIA_ROOT` is local disk.
- PII (`national_id`, `tin`, hashes never serialized, `password` write-only) is already excluded
  from public serializers; keep it that way if `/api/manage/tenants/` is added.
- `Property.save()` and `sync_property_status()` flip AVAILABLE↔OCCUPIED from ACTIVE leases, so
  any new lease/tenant flow must not fight that automation.
