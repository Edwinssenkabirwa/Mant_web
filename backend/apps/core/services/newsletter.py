"""Double opt-in newsletter sign-ups: normalisation, tokens and the emails they trigger.

Confirmation links carry a random, expiring, single-use token whose hash is the only thing
stored. Unsubscribe links are an HMAC of the address so they stay valid across later emails
without keeping a recoverable token in the database.
"""
import hashlib
import hmac
import secrets

from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string
from django.utils import timezone

from apps.core.models import Company, NewsletterSubscription

# Outcomes of a public sign-up attempt. The API always answers with the same body,
# so the caller cannot tell which of these happened.
PENDING = "pending"
ALREADY_SUBSCRIBED = "already_subscribed"
BLOCKED = "blocked"

TOKEN_LENGTH = 48
_UNSUBSCRIBE_SALT = "mant-bridges-newsletter-unsubscribe:v1"


def normalize_email(value):
    return (value or "").strip().lower()[:254]


def _digest(token):
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def unsubscribe_token(email):
    """Stable, unguessable link for one address; derived from SECRET_KEY, never stored raw."""
    message = f"{_UNSUBSCRIBE_SALT}:{normalize_email(email)}".encode("utf-8")
    return hmac.new(settings.SECRET_KEY.encode("utf-8"), message, hashlib.sha256).hexdigest()


def _ensure_unsubscribe_hash(subscription):
    if subscription.unsubscribe_token_hash:
        return
    subscription.unsubscribe_token_hash = _digest(unsubscribe_token(subscription.email))
    subscription.save(update_fields=["unsubscribe_token_hash", "updated_at"])


def _issue_confirmation_token(subscription):
    raw = secrets.token_urlsafe(TOKEN_LENGTH)
    subscription.confirm_token_hash = _digest(raw)
    subscription.confirm_token_created_at = timezone.now()
    subscription.save(update_fields=["confirm_token_hash", "confirm_token_created_at", "updated_at"])
    return raw


def _site_url(path):
    return f"{settings.PUBLIC_SITE_URL.rstrip('/')}{path}"


def _context(subscription, confirm_url):
    company = Company.load()
    address = ", ".join(
        part for part in (company.address, company.city, company.country) if part
    )
    return {
        "company": company,
        "company_name": company.name,
        "subscription": subscription,
        "first_name": subscription.first_name,
        "confirm_url": confirm_url,
        "unsubscribe_url": _site_url(
            f"/newsletter/unsubscribe?token={unsubscribe_token(subscription.email)}"
        ),
        "site_url": _site_url("/"),
        "address_line": address,
        "expires_in_hours": settings.NEWSLETTER_CONFIRM_HOURS,
    }


def subscribe(email, first_name="", source="website"):
    """Record a sign-up. Returns ``(outcome, subscription)``; ``PENDING`` means mail is owed."""
    email = normalize_email(email)
    cleaned_first_name = (first_name or "").strip()[:120]
    cleaned_source = (source or "").strip()[:60] or "website"

    existing = NewsletterSubscription.objects.filter(email=email).first()
    if existing is None:
        subscription = NewsletterSubscription.objects.create(
            email=email,
            first_name=cleaned_first_name,
            source=cleaned_source,
            status=NewsletterSubscription.Status.PENDING_CONFIRMATION,
            consent_given_at=timezone.now(),
        )
        return PENDING, subscription

    status = existing.status
    if status == NewsletterSubscription.Status.SUBSCRIBED:
        return ALREADY_SUBSCRIBED, existing
    if status in (
        NewsletterSubscription.Status.SUPPRESSED,
        NewsletterSubscription.Status.BOUNCED,
    ):
        # A hard bounce or an administrator suppression is not undone by a web form.
        return BLOCKED, existing
    if status == NewsletterSubscription.Status.UNSUBSCRIBED:
        # Only an explicit sign-up followed by a fresh confirmation click re-activates
        # a previous unsubscribe, so the opt-out is never silently overridden.
        existing.status = NewsletterSubscription.Status.PENDING_CONFIRMATION
        existing.consent_given_at = timezone.now()
        existing.unsubscribed_at = None
        if cleaned_first_name:
            existing.first_name = cleaned_first_name
        existing.source = cleaned_source
        existing.save(
            update_fields=[
                "status", "consent_given_at", "unsubscribed_at",
                "first_name", "source", "updated_at",
            ]
        )
        return PENDING, existing

    return PENDING, existing


def send_confirmation_email(subscription):
    """Email an expiring confirmation link. Returns the raw token only for tests/debugging."""
    _ensure_unsubscribe_hash(subscription)
    raw_token = _issue_confirmation_token(subscription)
    context = _context(subscription, _site_url(f"/newsletter/confirm?token={raw_token}"))

    subject = render_to_string("newsletter/confirm_subject.txt", context).strip()
    text_body = render_to_string("newsletter/confirm_email.txt", context)
    html_body = render_to_string("newsletter/confirm_email.html", context)

    message = EmailMultiAlternatives(
        subject=subject,
        body=text_body,
        from_email=settings.DEFAULT_FROM_EMAIL,
        to=[subscription.email],
    )
    message.attach_alternative(html_body, "text/html")
    message.send(fail_silently=False)
    return raw_token


def confirm(raw_token):
    """Activate a pending subscription. Returns ``(state, subscription)``.

    States: ``confirmed``, ``already_confirmed``, ``expired``, ``invalid``.
    """
    token = (raw_token or "").strip()[:256]
    if not token:
        return "invalid", None

    subscription = NewsletterSubscription.objects.filter(confirm_token_hash=_digest(token)).first()
    if subscription is None:
        return "invalid", None
    if subscription.status == NewsletterSubscription.Status.SUBSCRIBED:
        return "already_confirmed", subscription
    if subscription.status != NewsletterSubscription.Status.PENDING_CONFIRMATION:
        return "invalid", subscription

    created = subscription.confirm_token_created_at
    deadline = created + timezone.timedelta(hours=settings.NEWSLETTER_CONFIRM_HOURS) if created else None
    if deadline is None or timezone.now() > deadline:
        subscription.confirm_token_hash = ""
        subscription.confirm_token_created_at = None
        subscription.save(update_fields=["confirm_token_hash", "confirm_token_created_at", "updated_at"])
        return "expired", subscription

    subscription.status = NewsletterSubscription.Status.SUBSCRIBED
    subscription.confirmed_at = timezone.now()
    # Single use: dropping the hash makes a replayed link inert.
    subscription.confirm_token_hash = ""
    subscription.confirm_token_created_at = None
    subscription.save(
        update_fields=["status", "confirmed_at", "confirm_token_hash", "confirm_token_created_at", "updated_at"]
    )
    return "confirmed", subscription


def unsubscribe(raw_token):
    """Honour an unsubscribe link without requiring a login."""
    token = (raw_token or "").strip()[:256]
    if not token:
        return "invalid", None

    subscription = NewsletterSubscription.objects.filter(unsubscribe_token_hash=_digest(token)).first()
    if subscription is None:
        return "invalid", None
    if subscription.status == NewsletterSubscription.Status.UNSUBSCRIBED:
        return "already_unsubscribed", subscription

    subscription.status = NewsletterSubscription.Status.UNSUBSCRIBED
    subscription.unsubscribed_at = timezone.now()
    subscription.confirm_token_hash = ""
    subscription.confirm_token_created_at = None
    subscription.save(
        update_fields=["status", "unsubscribed_at", "confirm_token_hash", "confirm_token_created_at", "updated_at"]
    )
    return "unsubscribed", subscription
