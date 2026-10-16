import calendar

from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.utils import timezone

from apps.core.helpers import next_document_number
from apps.core.models import Company, TimeStampedModel

# The `property` ForeignKey in Lease shadows the builtin decorator in the class body.
_property = property


def add_months(value, months):
    """Calendar-safe month arithmetic (clamps to the last valid day)."""
    month_index = value.month - 1 + months
    year = value.year + month_index // 12
    month = month_index % 12 + 1
    day = min(value.day, calendar.monthrange(year, month)[1])
    return value.replace(year=year, month=month, day=day)


def months_between(start, end):
    return max(0, (end.year - start.year) * 12 + (end.month - start.month) + 1)


class Lease(TimeStampedModel):
    """A tenancy agreement between a landlord and a tenant for one property."""

    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        ACTIVE = "ACTIVE", "Active"
        EXPIRED = "EXPIRED", "Expired"
        TERMINATED = "TERMINATED", "Terminated"

    class BillingFrequency(models.TextChoices):
        MONTHLY = "MONTHLY", "Monthly"
        QUARTERLY = "QUARTERLY", "Quarterly"

    class LateFeePolicy(models.TextChoices):
        INHERIT = "INHERIT", "Company default"
        NONE = "NONE", "No late fee"
        FLAT = "FLAT", "Flat amount"
        PERCENT = "PERCENT", "Percentage of rent"

    number = models.CharField(max_length=30, unique=True, blank=True)
    property = models.ForeignKey("properties.Property", on_delete=models.PROTECT,
                                 related_name="leases")
    tenant = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT,
                               related_name="leases")
    landlord = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT,
                                 related_name="managed_leases")
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                                   null=True, blank=True, related_name="leases_created")

    start_date = models.DateField()
    end_date = models.DateField()
    monthly_rent = models.DecimalField(max_digits=14, decimal_places=2)
    service_charge = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    security_deposit = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    currency = models.CharField(max_length=10, default="UGX")

    billing_frequency = models.CharField(max_length=10, choices=BillingFrequency.choices,
                                         default=BillingFrequency.MONTHLY)
    due_day_of_month = models.PositiveIntegerField(
        default=1, validators=[MinValueValidator(1), MaxValueValidator(28)],
        help_text="Day of the month rent falls due (1-28).",
    )
    grace_period_days = models.PositiveIntegerField(default=5)
    late_fee_type = models.CharField(max_length=10, choices=LateFeePolicy.choices,
                                     default=LateFeePolicy.INHERIT)
    late_fee_flat = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    late_fee_percent = models.DecimalField(max_digits=5, decimal_places=2, default=0)

    status = models.CharField(max_length=12, choices=Status.choices,
                              default=Status.ACTIVE, db_index=True)
    terms = models.TextField(blank=True, default="")
    notes = models.TextField(blank=True, default="")

    class Meta:
        ordering = ("-created_at",)
        indexes = [
            models.Index(fields=["status", "end_date"]),
            models.Index(fields=["tenant", "status"]),
        ]
        verbose_name_plural = "Leases"

    def __str__(self):
        return f"{self.number or 'Lease'} - {self.property.title}"

    def clean(self):
        from django.core.exceptions import ValidationError

        errors = {}
        if self.start_date and self.end_date and self.end_date <= self.start_date:
            errors["end_date"] = "The end date must be after the start date."
        if self.monthly_rent is not None and self.monthly_rent <= 0:
            errors["monthly_rent"] = "Monthly rent must be greater than zero."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        was_new = self.pk is None
        if was_new and not self.number:
            self.number = next_document_number(
                Company.load().lease_prefix, Lease, field="number"
            )
        if self.end_date and self.end_date < timezone.localdate():
            if self.status == Lease.Status.ACTIVE:
                self.status = Lease.Status.EXPIRED
        super().save(*args, **kwargs)
        self.sync_property_status()

    # --- derived data -------------------------------------------------
    @_property
    def term_months(self):
        return months_between(self.start_date, self.end_date)

    @_property
    def months_per_invoice(self):
        return 3 if self.billing_frequency == Lease.BillingFrequency.QUARTERLY else 1

    @_property
    def is_current(self):
        today = timezone.localdate()
        return (
            self.status == Lease.Status.ACTIVE
            and self.start_date <= today <= self.end_date
        )

    @_property
    def days_remaining(self):
        if not self.end_date:
            return None
        return (self.end_date - timezone.localdate()).days

    @_property
    def total_invoiced(self):
        from apps.billing.models import Invoice

        return Invoice.objects.filter(lease=self).exclude(
            status=Invoice.Status.CANCELLED
        ).aggregate(total=models.Sum("total"))["total"] or 0

    @_property
    def total_collected(self):
        from apps.billing.models import Payment

        return Payment.objects.filter(lease=self, status=Payment.Status.CONFIRMED).aggregate(
            total=models.Sum("amount")
        )["total"] or 0

    @_property
    def outstanding_balance(self):
        return (self.total_invoiced or 0) - (self.total_collected or 0)

    @_property
    def late_fee_settings(self):
        """Lease-level overrides, falling back to the company-wide policy."""
        company = Company.load()
        fee_type = self.late_fee_type
        flat = self.late_fee_flat
        percent = self.late_fee_percent
        if fee_type == Lease.LateFeePolicy.INHERIT:
            fee_type = company.late_fee_type
            flat = company.late_fee_flat
            percent = company.late_fee_percent
        return {
            "type": fee_type,
            "flat": flat,
            "percent": percent,
            "grace_period_days": self.grace_period_days
            if self.grace_period_days is not None
            else company.grace_period_days,
        }

    def sync_property_status(self):
        """Keep the public listing status in step with occupancy."""
        from apps.properties.models import Property

        occupied = Lease.objects.filter(
            property_id=self.property_id, status=Lease.Status.ACTIVE
        ).exists()
        current = Property.objects.filter(pk=self.property_id).values_list(
            "status", flat=True
        ).first()
        if current is None:
            return
        if occupied and current == Property.Status.AVAILABLE:
            Property.objects.filter(pk=self.property_id).update(
                status=Property.Status.OCCUPIED
            )
        elif not occupied and current == Property.Status.OCCUPIED:
            Property.objects.filter(pk=self.property_id).update(
                status=Property.Status.AVAILABLE
            )

    def refresh_status(self):
        """Move ACTIVE leases to EXPIRED once the end date has passed."""
        today = timezone.localdate()
        if self.status == Lease.Status.ACTIVE and self.end_date and self.end_date < today:
            self.status = Lease.Status.EXPIRED
            Lease.objects.filter(pk=self.pk).update(status=self.status)
            self.sync_property_status()
            return True
        return False
