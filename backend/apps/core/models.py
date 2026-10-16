from django.db import models


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
