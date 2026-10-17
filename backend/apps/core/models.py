from django.conf import settings
from django.db import models

from apps.core.helpers import unique_slug


class TimeStampedModel(models.Model):
    """Adds created/updated tracking to every model that inherits it."""

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class Company(TimeStampedModel):
    """Single-row profile for Mant Bridges LTD.

    Holds branding, document numbering prefixes and the default late-fee policy
    applied when a lease does not define its own.
    """

    FLAT = "FLAT"
    PERCENT = "PERCENT"
    NONE = "NONE"
    LATE_FEE_CHOICES = (
        (NONE, "No late fee"),
        (FLAT, "Flat amount"),
        (PERCENT, "Percentage of rent"),
    )

    name = models.CharField(max_length=150, default="Mant Bridges LTD")
    legal_name = models.CharField(max_length=200, blank=True, default="")
    tagline = models.CharField(
        max_length=255, blank=True, default="Connecting people to property they can trust."
    )
    about = models.TextField(blank=True, default="")
    email = models.EmailField(default="info@mantbridges.com")
    phone = models.CharField(max_length=40, blank=True, default="")
    alt_phone = models.CharField(max_length=40, blank=True, default="")
    address = models.CharField(max_length=255, blank=True, default="")
    city = models.CharField(max_length=120, blank=True, default="")
    country = models.CharField(max_length=120, default="Uganda")
    website = models.URLField(blank=True, default="")
    logo = models.ImageField(upload_to="company/", blank=True, null=True)

    facebook = models.URLField(blank=True, default="")
    twitter = models.URLField(blank=True, default="")
    instagram = models.URLField(blank=True, default="")
    linkedin = models.URLField(blank=True, default="")

    currency = models.CharField(max_length=10, default="UGX")
    currency_symbol = models.CharField(max_length=10, default="UGX")

    invoice_prefix = models.CharField(max_length=12, default="MB-INV")
    receipt_prefix = models.CharField(max_length=12, default="MB-RCP")
    lease_prefix = models.CharField(max_length=12, default="MB-LSE")
    payment_prefix = models.CharField(max_length=12, default="MB-PAY")

    grace_period_days = models.PositiveIntegerField(default=5)
    late_fee_type = models.CharField(max_length=10, choices=LATE_FEE_CHOICES, default=NONE)
    late_fee_flat = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    late_fee_percent = models.DecimalField(max_digits=5, decimal_places=2, default=0)

    bank_name = models.CharField(max_length=120, blank=True, default="")
    bank_account_name = models.CharField(max_length=150, blank=True, default="")
    bank_account_number = models.CharField(max_length=60, blank=True, default="")
    bank_branch = models.CharField(max_length=120, blank=True, default="")
    mobile_money_number = models.CharField(max_length=40, blank=True, default="")
    payment_instructions = models.TextField(blank=True, default="")

    class Meta:
        verbose_name = "Company profile"
        verbose_name_plural = "Company profile"

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        # Enforce the single-row pattern so there is always exactly one profile.
        self.pk = 1
        super().save(*args, **kwargs)

    @classmethod
    def load(cls):
        company, _ = cls.objects.get_or_create(pk=1)
        return company

    @property
    def late_fee_policy(self):
        return {
            "grace_period_days": self.grace_period_days,
            "late_fee_type": self.late_fee_type,
            "late_fee_flat": str(self.late_fee_flat),
            "late_fee_percent": str(self.late_fee_percent),
        }


class ServiceQuerySet(models.QuerySet):
    def published(self):
        return self.filter(is_published=True)


class ServiceManager(models.Manager):
    def get_queryset(self):
        return ServiceQuerySet(self.model, using=self._db)

    def published(self):
        return self.get_queryset().published()


class Service(TimeStampedModel):
    """A service the company offers, written and published by administrators."""

    class Category(models.TextChoices):
        PROPERTY_MANAGEMENT = "PROPERTY_MANAGEMENT", "Rent collection and property management"
        DEBT_RECOVERY = "DEBT_RECOVERY", "Debt recovery"
        CONTRACTING = "CONTRACTING", "Contracting and lobbying"
        LAND_DOCUMENTATION = "LAND_DOCUMENTATION", "Land documentation"
        BUYING_SELLING = "BUYING_SELLING", "Real estate: purchase and sale"
        OTHER = "OTHER", "Other"

    name = models.CharField(max_length=160)
    slug = models.SlugField(max_length=180, unique=True, blank=True)
    category = models.CharField(
        max_length=30, choices=Category.choices, default=Category.OTHER, blank=True
    )
    summary = models.CharField(
        max_length=300, blank=True, default="",
        help_text="Short description shown on cards and at the top of the page.",
    )
    description = models.TextField(
        blank=True, default="",
        help_text="Detailed description. Separate paragraphs with a blank line.",
    )
    highlights = models.JSONField(
        default=list, blank=True,
        help_text="Bullet points listing what the service covers.",
    )
    limitations = models.TextField(
        blank=True, default="",
        help_text="What the service does not cover, or cannot guarantee.",
    )
    image = models.ImageField(upload_to="services/%Y/%m/", blank=True, null=True)
    image_alt = models.CharField(max_length=200, blank=True, default="")
    order = models.PositiveIntegerField(default=0)
    is_published = models.BooleanField(default=False, db_index=True)

    objects = ServiceManager()

    class Meta:
        ordering = ("order", "name")
        verbose_name = "Service"
        verbose_name_plural = "Services"

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = unique_slug(Service, self.name, instance=self)
        super().save(*args, **kwargs)

    @property
    def paragraphs(self):
        return [chunk.strip() for chunk in self.description.split("\n\n") if chunk.strip()]

    @property
    def short_summary(self):
        if self.summary:
            return self.summary
        plain = " ".join(self.description.split())
        return (plain[:200] + "...") if len(plain) > 200 else plain


class NewsletterQuerySet(models.QuerySet):
    def subscribed(self):
        """Addresses that completed double opt-in and have not opted back out."""
        return self.filter(status=NewsletterSubscription.Status.SUBSCRIBED)


class NewsletterManager(models.Manager):
    def get_queryset(self):
        return NewsletterQuerySet(self.model, using=self._db)

    def subscribed(self):
        return self.get_queryset().subscribed()


class NewsletterSubscription(TimeStampedModel):
    """A public newsletter address, confirmed by its owner before any mail is sent.

    Only hashes of the emailed tokens are kept, and a previous unsubscribe or
    suppression is never silently overwritten by a fresh subscription request.
    """

    class Status(models.TextChoices):
        PENDING_CONFIRMATION = "PENDING_CONFIRMATION", "Pending confirmation"
        SUBSCRIBED = "SUBSCRIBED", "Subscribed"
        UNSUBSCRIBED = "UNSUBSCRIBED", "Unsubscribed"
        SUPPRESSED = "SUPPRESSED", "Suppressed"
        BOUNCED = "BOUNCED", "Bounced"

    email = models.EmailField(max_length=254, unique=True)
    first_name = models.CharField(max_length=120, blank=True, default="")
    status = models.CharField(
        max_length=22, choices=Status.choices,
        default=Status.PENDING_CONFIRMATION, db_index=True,
    )
    source = models.CharField(max_length=60, blank=True, default="website")
    consent_given_at = models.DateTimeField(null=True, blank=True)
    confirmed_at = models.DateTimeField(null=True, blank=True)
    unsubscribed_at = models.DateTimeField(null=True, blank=True)
    confirm_token_hash = models.CharField(max_length=64, blank=True, default="", db_index=True)
    confirm_token_created_at = models.DateTimeField(null=True, blank=True)
    unsubscribe_token_hash = models.CharField(max_length=64, blank=True, default="", db_index=True)
    notes = models.CharField(max_length=255, blank=True, default="")

    objects = NewsletterManager()

    class Meta:
        ordering = ("-created_at",)
        verbose_name = "Newsletter subscription"
        verbose_name_plural = "Newsletter subscriptions"

    def __str__(self):
        return self.email

    @property
    def receives_mail(self):
        return self.status == self.Status.SUBSCRIBED


class EmailCampaign(TimeStampedModel):
    """One message, one audience, sent in batches by ``send_email_campaign``.

    Counts are written by the sender, never by the browser: the admin sees how many
    addresses were eligible, how many the mail server accepted, and nothing claims a
    message reached an inbox.
    """

    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        QUEUED = "QUEUED", "Queued for sending"
        SENDING = "SENDING", "Sending"
        COMPLETED = "COMPLETED", "Completed"
        CANCELLED = "CANCELLED", "Cancelled"

    class Audience(models.TextChoices):
        NEWSLETTER_SUBSCRIBERS = "NEWSLETTER_SUBSCRIBERS", "Confirmed newsletter subscribers"
        OPTED_IN_USERS = "OPTED_IN_USERS", "Registered users who opted in"
        LANDLORDS = "LANDLORDS", "Landlords who opted in"
        TENANTS = "TENANTS", "Tenants who opted in"

    name = models.CharField(max_length=120, help_text="Internal label, never emailed.")
    subject = models.CharField(max_length=200)
    body = models.TextField(blank=True, default="", help_text="Plain text; blank lines start a new paragraph.")
    audiences = models.JSONField(default=list, blank=True)
    status = models.CharField(
        max_length=12, choices=Status.choices, default=Status.DRAFT, db_index=True
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
        related_name="email_campaigns",
    )
    queued_at = models.DateTimeField(null=True, blank=True)
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    recipient_count = models.PositiveIntegerField(default=0)
    excluded_count = models.PositiveIntegerField(default=0)
    accepted_count = models.PositiveIntegerField(default=0)
    failed_count = models.PositiveIntegerField(default=0)
    skipped_count = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ("-created_at",)
        verbose_name = "Email campaign"
        verbose_name_plural = "Email campaigns"

    def __str__(self):
        return f"{self.name} ({self.status})"

    @property
    def is_editable(self):
        return self.status == self.Status.DRAFT


class EmailCampaignRecipient(models.Model):
    """One address inside one campaign. ``ACCEPTED`` means the mail server took it."""

    class Status(models.TextChoices):
        PENDING = "PENDING", "Waiting to send"
        ACCEPTED = "ACCEPTED", "Accepted by the mail server"
        FAILED = "FAILED", "Failed after retries"
        SKIPPED = "SKIPPED", "Skipped (no longer eligible)"

    class Source(models.TextChoices):
        SUBSCRIBER = "SUBSCRIBER", "Newsletter subscriber"
        USER = "USER", "Registered user"

    campaign = models.ForeignKey(EmailCampaign, on_delete=models.CASCADE, related_name="recipients")
    email = models.EmailField(max_length=254, db_index=True)
    display_name = models.CharField(max_length=150, blank=True, default="")
    source = models.CharField(max_length=12, choices=Source.choices, default=Source.SUBSCRIBER)
    status = models.CharField(
        max_length=12, choices=Status.choices, default=Status.PENDING, db_index=True
    )
    attempts = models.PositiveIntegerField(default=0)
    error = models.CharField(max_length=255, blank=True, default="")
    sent_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ("id",)
        constraints = [
            models.UniqueConstraint(fields=["campaign", "email"], name="unique_campaign_recipient")
        ]
        verbose_name = "Email campaign recipient"
        verbose_name_plural = "Email campaign recipients"

    def __str__(self):
        return f"{self.email} → {self.campaign_id} ({self.status})"
