"""Campaign audiences and batched delivery.

Two rules shape everything here. An address is only ever included because the person behind
it asked for mail — a newsletter confirmation or an explicit marketing opt-in — and a status
of ``ACCEPTED`` means the mail server took the message, which is not proof that it reached an
inbox.
"""
import time
from dataclasses import dataclass, field

from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.db import transaction
from django.template.loader import render_to_string
from django.utils import timezone

from apps.accounts.models import Role, User
from apps.core.models import Company, EmailCampaign, EmailCampaignRecipient, NewsletterSubscription
from apps.core.services.newsletter import normalize_email, unsubscribe_token

MAX_ATTEMPTS = 3

# Addresses in these states may not be mailed, whatever another table says about them.
BLOCKED_STATUSES = [
    NewsletterSubscription.Status.UNSUBSCRIBED,
    NewsletterSubscription.Status.SUPPRESSED,
    NewsletterSubscription.Status.BOUNCED,
]


@dataclass
class AudiencePreview:
    recipients: list = field(default_factory=list)
    excluded_suppressed: int = 0
    duplicates: int = 0
    unknown_audiences: list = field(default_factory=list)

    @property
    def eligible(self):
        return len(self.recipients)


def _candidates(audience):
    """Yield ``(email, display_name, source)`` for one audience key, consent included."""
    if audience == EmailCampaign.Audience.NEWSLETTER_SUBSCRIBERS:
        for row in NewsletterSubscription.objects.subscribed().order_by("email"):
            yield row.email, row.first_name, EmailCampaignRecipient.Source.SUBSCRIBER
    elif audience == EmailCampaign.Audience.OPTED_IN_USERS:
        query = User.objects.filter(is_active=True, marketing_opt_in=True)
        for row in query.order_by("email"):
            yield row.email, row.full_name, EmailCampaignRecipient.Source.USER
    elif audience in (EmailCampaign.Audience.LANDLORDS, EmailCampaign.Audience.TENANTS):
        role = Role.LANDLORD if audience == EmailCampaign.Audience.LANDLORDS else Role.TENANT
        query = User.objects.filter(is_active=True, marketing_opt_in=True, role=role)
        for row in query.order_by("email"):
            yield row.email, row.full_name, EmailCampaignRecipient.Source.USER


def resolve_audiences(audiences):
    """Deduplicate by normalised address and drop anything suppressed."""
    preview = AudiencePreview()
    suppressed = set(
        NewsletterSubscription.objects.filter(status__in=BLOCKED_STATUSES)
        .values_list("email", flat=True)
    )
    seen = set()
    for audience in audiences or []:
        if audience not in EmailCampaign.Audience.values:
            preview.unknown_audiences.append(audience)
            continue
        for email, display_name, source in _candidates(audience):
            address = normalize_email(email)
            if not address:
                continue
            if address in suppressed:
                preview.excluded_suppressed += 1
                continue
            if address in seen:
                preview.duplicates += 1
                continue
            seen.add(address)
            preview.recipients.append({"email": address, "display_name": display_name, "source": source})
    preview.recipients.sort(key=lambda row: row["email"])
    return preview


def unsubscribe_url(email):
    return f"{settings.PUBLIC_SITE_URL.rstrip('/')}/newsletter/unsubscribe?token={unsubscribe_token(email)}"


def _paragraphs(body):
    return [block.strip() for block in (body or "").split("\n\n") if block.strip()]


def _footer(company):
    return ", ".join(part for part in (company.address, company.city, company.country) if part)


def _base_context(campaign, company=None):
    company = company or Company.load()
    return {
        "campaign": campaign,
        "company": company,
        "company_name": company.name,
        "address_line": _footer(company),
        "paragraphs": _paragraphs(campaign.body),
        "subject": campaign.subject,
        "site_url": settings.PUBLIC_SITE_URL.rstrip("/"),
    }


def build_message(campaign, recipient, company=None):
    """One message to one address. Recipients never appear in each other's headers."""
    context = _base_context(campaign, company)
    context.update(
        {
            "recipient": recipient,
            "first_name": recipient.display_name or "",
            "unsubscribe_url": unsubscribe_url(recipient.email),
        }
    )
    text_body = render_to_string("email/campaign_email.txt", context)
    html_body = render_to_string("email/campaign_email.html", context)
    message = EmailMultiAlternatives(
        subject=campaign.subject,
        body=text_body,
        from_email=settings.DEFAULT_FROM_EMAIL,
        to=[recipient.email],
    )
    message.attach_alternative(html_body, "text/html")
    return message


def send_test(campaign, address):
    """Send the campaign to one address an administrator supplies. Touches no recipient rows."""
    recipient = EmailCampaignRecipient(
        campaign=campaign, email=normalize_email(address), display_name="",
        source=EmailCampaignRecipient.Source.SUBSCRIBER,
    )
    message = build_message(campaign, recipient)
    message.subject = f"[TEST] {campaign.subject}"
    message.send(fail_silently=False)
    return message


@transaction.atomic
def queue_campaign(campaign):
    """Freeze the audience and mark the campaign queued. Returns False if already queued."""
    claimed = EmailCampaign.objects.filter(pk=campaign.pk, status=EmailCampaign.Status.DRAFT).update(
        status=EmailCampaign.Status.QUEUED, queued_at=timezone.now(), updated_at=timezone.now()
    )
    if not claimed:
        return False
    campaign.refresh_from_db()
    preview = resolve_audiences(campaign.audiences)
    EmailCampaignRecipient.objects.bulk_create(
        [
            EmailCampaignRecipient(
                campaign=campaign, email=row["email"], display_name=row["display_name"],
                source=row["source"],
            )
            for row in preview.recipients
        ],
        ignore_conflicts=True,
    )
    campaign.excluded_count = preview.excluded_suppressed
    campaign.recipient_count = len(preview.recipients)
    campaign.save(update_fields=["excluded_count", "recipient_count", "updated_at"])
    return True


def cancel_campaign(campaign):
    """Stop anything not already sent. Sent messages cannot be recalled."""
    updated = EmailCampaign.objects.filter(
        pk=campaign.pk, status__in=[EmailCampaign.Status.DRAFT, EmailCampaign.Status.QUEUED]
    ).update(status=EmailCampaign.Status.CANCELLED, completed_at=timezone.now(), updated_at=timezone.now())
    campaign.refresh_from_db()
    return bool(updated)


def _claim(campaign):
    updated = EmailCampaign.objects.filter(
        pk=campaign.pk, status=EmailCampaign.Status.QUEUED
    ).update(status=EmailCampaign.Status.SENDING, started_at=timezone.now(), updated_at=timezone.now())
    return bool(updated)


def deliver_campaign(campaign, limit=200, max_attempts=MAX_ATTEMPTS, delay=0.0):
    """Send a slice of a queued campaign. Safe to run repeatedly from a scheduler.

    Eligibility is re-checked at send time, so anyone who unsubscribed after the campaign
    was queued is skipped rather than mailed.
    """
    if campaign.status == EmailCampaign.Status.QUEUED and not _claim(campaign):
        return {"claimed": False, "sent": 0, "failed": 0, "skipped": 0, "remaining": 0}
    campaign.refresh_from_db()
    if campaign.status != EmailCampaign.Status.SENDING:
        return {"claimed": False, "sent": 0, "failed": 0, "skipped": 0, "remaining": 0}

    suppressed = set(
        NewsletterSubscription.objects.filter(status__in=BLOCKED_STATUSES)
        .values_list("email", flat=True)
    )
    pending = list(
        campaign.recipients.filter(status=EmailCampaignRecipient.Status.PENDING).order_by("id")[:limit]
    )
    sent = failed = skipped = 0
    company = Company.load()

    for recipient in pending:
        if recipient.email in suppressed:
            recipient.status = EmailCampaignRecipient.Status.SKIPPED
            recipient.error = "Address unsubscribed or was suppressed before sending"
            recipient.save(update_fields=["status", "error"])
            skipped += 1
            continue
        try:
            build_message(campaign, recipient, company=company).send(fail_silently=False)
        except Exception as error:  # a provider outage is a retry, not a lost campaign
            recipient.attempts += 1
            recipient.error = str(error)[:255]
            if recipient.attempts >= max_attempts:
                recipient.status = EmailCampaignRecipient.Status.FAILED
                failed += 1
            else:
                recipient.status = EmailCampaignRecipient.Status.PENDING
            recipient.save(update_fields=["attempts", "error", "status"])
        else:
            recipient.status = EmailCampaignRecipient.Status.ACCEPTED
            recipient.sent_at = timezone.now()
            recipient.error = ""
            recipient.save(update_fields=["status", "sent_at", "error"])
            sent += 1
        if delay:
            time.sleep(delay)

    remaining = campaign.recipients.filter(status=EmailCampaignRecipient.Status.PENDING).count()
    campaign.accepted_count = campaign.recipients.filter(
        status=EmailCampaignRecipient.Status.ACCEPTED
    ).count()
    campaign.failed_count = campaign.recipients.filter(status=EmailCampaignRecipient.Status.FAILED).count()
    campaign.skipped_count = campaign.recipients.filter(
        status=EmailCampaignRecipient.Status.SKIPPED
    ).count()
    if remaining == 0:
        campaign.status = EmailCampaign.Status.COMPLETED
        campaign.completed_at = timezone.now()
        campaign.save(
            update_fields=[
                "accepted_count", "failed_count", "skipped_count", "status", "completed_at", "updated_at",
            ]
        )
    else:
        campaign.save(update_fields=["accepted_count", "failed_count", "skipped_count", "updated_at"])

    return {
        "claimed": True,
        "sent": sent,
        "failed": failed,
        "skipped": skipped,
        "remaining": remaining,
    }


def render_preview(campaign):
    """The exact HTML an administrator would receive, for the compose screen."""
    context = _base_context(campaign)
    context.update(
        {
            "recipient": None,
            "first_name": "",
            "unsubscribe_url": unsubscribe_url("preview@example.invalid"),
        }
    )
    return render_to_string("email/campaign_email.html", context)
