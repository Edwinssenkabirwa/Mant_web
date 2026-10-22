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
tenants already linked to their own leases. Since the landlord portal cutover the lease screen is
not offered to owners at all — the desk records every tenancy — so this gap now only matters if
landlord lease authoring is brought back.

**Proposed (choose one and tell me which):**
- `GET /api/manage/tenants/` scoped to `LANDLORD`, returning a minimal public profile
  (id, full_name, phone, email) for accounts that have agreed to be discoverable, or
- let a landlord invite a tenant: `POST /api/manage/tenant-invites/` creating a pending
  TENANT account that the invitee completes via a tokenised link.

The second option is the safer one: it avoids exposing the whole tenant register to every
landlord on the platform.

**Related:** `POST /api/manage/properties/` requires `owner` for an ADMIN. Landlords no longer
create property rows from the UI at all; the recommendation flow is the intended route in.

## 5. Landlord read access to enquiries (medium)

**Current state:** the enquiry inbox is `IsAdminRole` only (`/api/manage/enquiries/`). A landlord
cannot see who asked about their own building, and `/manage/*` is closed to the landlord role in
both the router and Django, so the inbox simply does not exist for owners.

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

`python manage.py send_email_campaign --limit 200` belongs on the same scheduler, every few minutes
rather than nightly — a queued campaign should not sit until tomorrow. It claims campaigns atomically
and resumes where the last run stopped, so an overlapping or repeated run is harmless; see item 16
for what still wants a real queue instead.

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
plus a `Notification` model if in-app bell behaviour is wanted. The newsletter engine
(`apps/core/services/newsletter.py`) is the shared delivery path this should build on.

---

## 16. Email delivery truth, distribution and preferences (high, next)

**Built now:** `EmailCampaign` + `EmailCampaignRecipient` (migration `core.0004`),
`apps/core/services/campaigns.py`, `manage.py send_email_campaign`, the HTML/text templates under
`apps/core/templates/email/`, the admin API at `/api/manage/email/{subscribers,campaigns}/` and the
two screens at `/manage/email/{campaigns,subscribers}`. Audiences resolve server-side, deduplicate by
normalised address, and suppression beats every other table at queue time *and* again at send time.
Bulk mail no longer happens inside a request: HTTP freezes the audience, the command sends it in
slices and re-claims idempotently. Recipient statuses stop at `ACCEPTED`, never "delivered".

**Still missing:**

1. **A real queue.** `send_email_campaign` from cron is the stopgap — good enough for a few thousand
   messages, wrong for a list that grows: no provider rate limiting, no per-provider concurrency, and
   a run that dies mid-slice must be restarted by the schedule. Move the same
   `deliver_campaign(campaign, limit=…)` slice behind Celery/Django-Q2 and keep the command as the
   manual override.
2. **Provider webhooks for bounce, complaint and delivery.** Verify the signature, apply idempotently
   by message/recipient id, then flip `NewsletterSubscription` to `BOUNCED` on a hard bounce and add a
   `COMPLAINED` status so a complaint suppresses the address everywhere. Until then the vocabulary
   stops at *accepted by provider* — that is deliberate, not a gap to paper over.
3. **Blog-to-newsletter distribution.** Publish → campaign is still manual. Needs a `Post` signal or a
   `distribute_post` command that builds a campaign from the post body, uses the canonical public URL
   (`PUBLIC_SITE_URL` + slug), and respects the same audience/suppression resolution.
4. **Transactional alerts for real events.** Overdue invoice, payment recorded but unconfirmed, new
   enquiry, unread message — currently none of these email anybody. Reuse
   `apps/core/services/campaigns.py`'s template + unsubscribe conventions, but keep operational mail
   outside the marketing opt-out.
5. **A preferences page** (`/account/email-preferences`) so a person controls their own consent:
   `User.marketing_opt_in` is set in `/django-admin/` today, which is only honest while staff act on
   a request the user made. Include the immediate unsubscribe URL and a per-audience toggle.
6. **Rate limiting at the provider boundary** — per-hour send cap, and a kill switch that pauses a
   campaign without cancelling it.

**Production email setup:** a transactional provider with a verified sender on a domain that has
SPF, DKIM and DMARC records; `DEFAULT_FROM_EMAIL`, `PUBLIC_SITE_URL` and the `EMAIL_*` variables in
`backend/.env`. Do not claim real delivery until a message has been received at Gmail, Yahoo and
Outlook addresses from that configuration. `/api/manage/email/campaigns/stats/` reports the live
backend so the UI can say so plainly until then.

## 17. Documents an owner can hold (medium — the landlord portal reports numbers only)

**Built now:** `GET /api/landlord/overview/` (`apps/billing/services.landlord_overview`) answers the
owner's portal with aggregates of his own book — invoiced, collected, outstanding, overdue, the
monthly trend and per-property occupancy — and the rent book itself (`/api/invoices/`,
`/api/payments/`, `/api/receipts/`, `/api/leases/`, `/api/analytics/`, `/api/statements/`) now refuses
the LANDLORD role with 403 through `IsAdminOrTenant`. Receipts are tenant-facing documents ("Received
from: …"), so nothing in the system yet documents a payout *to* an owner.

**Still missing:**

1. **An owner statement/report the office generates** — collection by property and month, plus what
   has been released to him. It must be server-rendered, authorization-checked per owner, and served
   through a view, never a bare media URL.
2. **A payout record model.** `Receipt` cannot be reused: it names the tenant and is created by
   `billing/signals.sync_receipt` on every confirmed payment. An owner-facing document needs its own
   model (owner, period, amount released, method, reference, prepared_by) and its own PDF.
3. **The wording on the portal** currently points an owner to messages for any document; update
   `pages/landlord/Overview.jsx` when 1 and 2 exist.

## 18. Property recommendations (medium — what the desk still does by hand)

**Built now:** `PropertyRecommendation` (`apps/properties/models.py`, migration
`properties.0003`) carries the owner's form through `DRAFT → SUBMITTED → IN_REVIEW → VERIFIED /
DECLINED`. Owners write and send it at `/api/landlord/recommendations/` (`IsLandlordRole`, queryset
scoped to `recommender=request.user`); the desk works the queue at
`/api/manage/recommendations/` (`IsAdminRole`) with `review/`, `verify/`, `decline/` and `stats/`.
`apps/properties/services.py` is the only place a listing is created from a recommendation:
`verify_recommendation()` writes the `Property` in one transaction, owned by the recommender,
published immediately, and refuses to run twice. Landlords have no write path to
`/api/manage/properties/` or the image endpoint at all (`IsAdminRole` on create/update/delete).
`apps/accounts/signals.py` opens a blank DRAFT with every landlord account and a NEW `Enquiry` with
every tenant account.

**Still missing:**

1. **`Enquiry` has no `user` foreign key.** The tenant-account enquiry is matched to its person by
   e-mail address only, so it cannot be listed as "their brief" in the portal or re-opened when the
   person edits their details. Adding the FK needs a data pass over existing rows.
2. **The queue screen exposes the decision fields only.** `PATCH /api/manage/recommendations/:id/`
   accepts every field (and `/django-admin/` shows them), so a typo in an owner's title or price can
   be corrected there — but there is no inline editor in `/manage/recommendations`.
3. **Nobody is told when a decision lands.** The owner reads `admin_note` in his portal; no e-mail or
   WhatsApp goes out. That belongs with the alert service in item 16.
4. **Existing landlord accounts have no draft form.** The signal fires on account creation only, so
   owners registered before it (including the demo users) start with an empty list. A one-off
   `manage.py` backfill would fix it; it was not run because it writes rows into real accounts.
5. **A declined recommendation cannot be re-opened by the desk.** The owner's form locks on decision
   and the next attempt is a new recommendation. `verify/` on a DECLINED row is refused, by design.
6. **Verification publishes immediately** — there is no "verified, hold for the owner's signature"
   state, and no second listing for a property recommended "for sale and to rent"; the desk picks one
   listing type per verification.

## 19. Private PDFs sit in public media (medium, security)

**Confirmed live, not inferred:** with the dev server running, an unauthenticated

```
GET /media/receipts/2026/10/receipts/2026/10/MB-RCP-2026-00022_SR1ENXH.pdf
```

answers `200 application/pdf`. The file is a real payment receipt for a named tenant.

**Why:** `Receipt.generate_pdf()` writes into `MEDIA_ROOT`, and `config/urls.py` appends
`static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)` whenever `DEBUG` is on — so every
document under `media/` is reachable by URL, with no role check, for anyone who knows or guesses
the path. The API path is correct (`/api/receipts/{id}/download/` scopes the queryset to the
tenant or the office), but it is not the only door.

**The fix:** keep documents out of the media tree. Give `Receipt.pdf` its own storage rooted at a
`DOCUMENT_ROOT` outside `MEDIA_ROOT` (and outside any static file server), so the authenticated
view is the only way out. Existing rows under `media/receipts/` need moving, and the property
photos must stay where they are — those are meant to be public.

---

## 20. Rent reminders (built as click-to-chat — what still needs a provider)

**Built now:** `apps/billing/reminders.py` renders the words once (`reminder_text`) and is the only
place a reminder is composed. `POST /api/invoices/{id}/remind/` writes them into the tenant's inbox
thread; `POST /api/invoices/{id}/whatsapp-reminder/` writes the same copy and returns a server-built
`https://wa.me/<E.164>?text=…` link. `normalise_msisdn()` accepts the shapes the register actually
contains and returns `None` rather than guessing, in which case the endpoint answers `link: null`
and the inbox reminder still exists. `RentReminder` (`billing.0002`) records channel, status, body,
the digits used and who raised it, `GET /api/reminders/` is admin-only, and `/manage/reminders` plus
the Reminder log on the invoice screen read from it. Statuses stop at `WRITTEN`, `LINK_READY`,
`OPENED`, `NO_NUMBER`.

**Still missing:**

1. **Outbound sending.** There is no WhatsApp Business API call, so a human still presses send on a
   phone. Real automation needs a provider (Meta's Cloud API or a gateway), a credentials-in-`.env`
   change, and a delivery webhook — at which point a `SENT`/`DELIVERED` status becomes defensible.
   Until a provider confirms something, the platform must keep saying "a chat was opened here".
2. **Consent and quiet hours.** Nothing records whether a tenant agreed to be chased on WhatsApp. A
   rent reminder to a personal number is still a message to a person, and the data-protection rules
   that apply to it have not been checked here; a `whatsapp_opt_in` flag on the tenant profile, plus
   a cap on reminders per invoice per week, belongs here before volume grows.
3. **The double copy.** By design an inbox-plus-WhatsApp reminder reaches the tenant twice with the
   same words. If that reads as spam, either the WhatsApp channel should skip the inbox write, or the
   inbox post should be marked internal — that is a product decision, not a bug.
4. **No number hygiene pass.** `normalise_msisdn` refuses to repair, so rows recorded as
   `+256 7XX XXX XXX` with stray punctuation are handled, but a tenant saved as `0704 771` or a
   landline stays `NO_NUMBER` forever until someone edits the profile. A one-off report of tenants
   whose phone will not dial would let the desk fix them; it has not been run because it reads PII
   across the whole register.
5. **Nothing scheduled.** A nightly `mark_overdue` could also queue reminders for freshly overdue
   invoices (item 11), and the reminder trail has no link to the campaign/alert engine in item 16 —
   an email reminder path would reuse the same `reminder_text` with a channel of `EMAIL`.
6. **Landlords never see it.** The trail is `IsAdminRole`, and the owner's portal deliberately reports
   totals only. If an owner is expected to chase his own tenant, that needs its own scoped endpoint —
   and its own consent answer.

---

### Also worth noting, without UI impact today

- `DEBUG`, `SECRET_KEY` and SQLite all come from `.env`; production needs
  `DJANGO_DEBUG=False`, a generated key, real `ALLOWED_HOSTS`, PostgreSQL, `collectstatic` and a
  media backend (S3/OSS) since `MEDIA_ROOT` is local disk.
- PII (`national_id`, `tin`, hashes never serialized, `password` write-only) is already excluded
  from public serializers; keep it that way if `/api/manage/tenants/` is added.
- `Property.save()` and `sync_property_status()` flip AVAILABLE↔OCCUPIED from ACTIVE leases, so
  any new lease/tenant flow must not fight that automation.
