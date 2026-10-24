from decimal import Decimal
from functools import partial
from apps.core.storage_backends import SupabasePrivateFilesStorage

from django.conf import settings
from django.core.files.base import ContentFile
from django.db import models
from django.utils import timezone

from apps.core.helpers import format_money, next_document_number, to_decimal
from apps.core.models import Company, TimeStampedModel
from apps.core.services.documents import render_receipt_pdf

ZERO = Decimal("0.00")

# The `property` ForeignKey in Invoice and Receipt shadows the builtin decorator in the class body.
_property = property


def money_formatter(currency):
    return partial(format_money, currency_symbol=currency or "UGX")


class Invoice(TimeStampedModel):
    """A rent demand for one billing period of one lease."""

    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        UNPAID = "UNPAID", "Unpaid"
        PARTIAL = "PARTIAL", "Partially paid"
        PAID = "PAID", "Paid"
        OVERDUE = "OVERDUE", "Overdue"
        CANCELLED = "CANCELLED", "Cancelled"

    number = models.CharField(max_length=30, unique=True, blank=True)
    lease = models.ForeignKey("leases.Lease", on_delete=models.CASCADE,
                              related_name="invoices")
    property = models.ForeignKey("properties.Property", on_delete=models.PROTECT,
                                 related_name="invoices")
    tenant = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT,
                               related_name="invoices")
    landlord = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT,
                                 related_name="landlord_invoices")

    period_start = models.DateField()
    period_end = models.DateField()
    issue_date = models.DateField(default=timezone.localdate)
    due_date = models.DateField(db_index=True)

    rent_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    service_charge = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    utility_charge = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    other_charge = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    other_charge_label = models.CharField(max_length=120, blank=True, default="Other charge")
    discount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    tax_percent = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    tax_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0, editable=False)
    late_fee = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total = models.DecimalField(max_digits=14, decimal_places=2, default=0, editable=False)
    amount_paid = models.DecimalField(max_digits=14, decimal_places=2, default=0, editable=False)
    currency = models.CharField(max_length=10, default="UGX")

    status = models.CharField(max_length=12, choices=Status.choices,
                              default=Status.UNPAID, db_index=True)
    notes = models.TextField(blank=True, default="")
    reminder_count = models.PositiveIntegerField(default=0)
    last_reminder_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ("-due_date", "-id")
        indexes = [
            models.Index(fields=["status", "due_date"]),
            models.Index(fields=["tenant", "status"]),
            models.Index(fields=["landlord", "status"]),
        ]

    def __str__(self):
        return f"{self.number} ({self.get_status_display()})"

    def clean(self):
        from django.core.exceptions import ValidationError

        errors = {}
        if self.period_start and self.period_end and self.period_end < self.period_start:
            errors["period_end"] = "The period end cannot precede the period start."
        if self.due_date and self.period_end and self.due_date < self.period_start:
            errors["due_date"] = "The due date falls before the billing period."
        if errors:
            raise ValidationError(errors)

    # --- money ---------------------------------------------------------
    @_property
    def subtotal(self):
        gross = (
            to_decimal(self.rent_amount)
            + to_decimal(self.service_charge)
            + to_decimal(self.utility_charge)
            + to_decimal(self.other_charge)
            - to_decimal(self.discount)
        )
        return gross if gross > ZERO else ZERO

    @_property
    def balance(self):
        return to_decimal(self.total) - to_decimal(self.amount_paid)

    @_property
    def is_past_due(self):
        return bool(self.due_date) and self.due_date < timezone.localdate()

    @_property
    def days_overdue(self):
        if not self.is_past_due:
            return 0
        return (timezone.localdate() - self.due_date).days

    @_property
    def is_overdue(self):
        return self.balance > ZERO and self.is_past_due

    @_property
    def effective_status(self):
        """Status as it stands right now, independent of the daily overdue sweep."""
        if self.status in (Invoice.Status.CANCELLED, Invoice.Status.DRAFT):
            return self.status
        if self.balance <= ZERO:
            return Invoice.Status.PAID
        if self.is_past_due:
            return Invoice.Status.OVERDUE
        if self.amount_paid > ZERO:
            return Invoice.Status.PARTIAL
        return Invoice.Status.UNPAID

    @_property
    def period_label(self):
        return f"{self.period_start:%d %b %Y} - {self.period_end:%d %b %Y}"

    def sync_amount_paid(self):
        """amount_paid is always the sum of confirmed payments for this invoice."""
        paid = self.payments.filter(status=Payment.Status.CONFIRMED).aggregate(
            total=models.Sum("amount")
        )["total"]
        self.amount_paid = to_decimal(paid or 0)
        return self.amount_paid

    def recalculate(self, commit=True):
        if self.pk is not None:
            self.sync_amount_paid()
        self.tax_amount = (
            self.subtotal * to_decimal(self.tax_percent) / Decimal("100")
        ).quantize(Decimal("0.01"))
        self.total = self.subtotal + to_decimal(self.tax_amount) + to_decimal(self.late_fee)
        if self.status not in (Invoice.Status.CANCELLED, Invoice.Status.DRAFT):
            self.status = self.effective_status
        if commit:
            self.save()
        return self.total

    def save(self, *args, **kwargs):
        if not self.number:
            self.number = next_document_number(
                Company.load().invoice_prefix, Invoice, field="number"
            )
        if not self.currency:
            self.currency = self.lease.currency if self.lease_id else "UGX"
        self.recalculate(commit=False)
        super().save(*args, **kwargs)

    def mark_reminder_sent(self):
        self.reminder_count += 1
        self.last_reminder_at = timezone.now()
        Invoice.objects.filter(pk=self.pk).update(
            reminder_count=self.reminder_count, last_reminder_at=self.last_reminder_at
        )

    def line_items(self):
        money = money_formatter(self.currency)
        items = [{
            "description": "Rent",
            "period": self.period_label,
            "amount": money(self.rent_amount),
        }]
        if to_decimal(self.service_charge) > ZERO:
            items.append({"description": "Service charge", "period": self.period_label,
                          "amount": money(self.service_charge)})
        if to_decimal(self.utility_charge) > ZERO:
            items.append({"description": "Utilities", "period": self.period_label,
                          "amount": money(self.utility_charge)})
        if to_decimal(self.other_charge) > ZERO:
            items.append({"description": self.other_charge_label or "Other charge",
                          "period": self.period_label, "amount": money(self.other_charge)})
        if to_decimal(self.discount) > ZERO:
            items.append({"description": "Discount", "period": "",
                          "amount": f"- {money(self.discount)}"})
        if to_decimal(self.tax_amount) > ZERO:
            items.append({"description": f"Tax ({to_decimal(self.tax_percent)}%)",
                          "period": "", "amount": money(self.tax_amount)})
        if to_decimal(self.late_fee) > ZERO:
            items.append({"description": "Late payment fee", "period": "",
                          "amount": money(self.late_fee)})
        return items

    def build_document_data(self):
        company = Company.load()
        money = money_formatter(self.currency)
        tenant = self.tenant
        prop = self.property
        lease = self.lease

        meta_groups = [
            ("Billed to", [
                ("Tenant", tenant.full_name),
                ("Phone", tenant.phone),
                ("Email", tenant.email),
            ]),
            ("Invoice", [
                ("Invoice number", self.number),
                ("Issue date", f"{self.issue_date:%d %b %Y}"),
                ("Due date", f"{self.due_date:%d %b %Y}"),
                ("Billing period", self.period_label),
            ]),
        ]
        if prop:
            meta_groups.append(("Property", [
                ("Listing", prop.title),
                ("Reference", prop.reference),
                ("Address", prop.address),
                ("Location", prop.city_district),
            ]))
        if lease:
            meta_groups.append(("Lease", [
                ("Lease number", lease.number),
                ("Term", f"{lease.start_date:%d %b %Y} to {lease.end_date:%d %b %Y}"),
                ("Landlord", lease.landlord.full_name),
            ]))

        instructions = []
        if company.bank_name and company.bank_account_number:
            instructions.append(
                f"Bank: {company.bank_name} | Account name: {company.bank_account_name} | "
                f"Account number: {company.bank_account_number}"
            )
        if company.mobile_money_number:
            instructions.append(f"Mobile money: {company.mobile_money_number}")
        if company.payment_instructions:
            instructions.append(company.payment_instructions)
        instructions.append(f"Always quote invoice number {self.number} when paying.")

        status = self.effective_status
        return {
            "number": self.number,
            "company": company,
            "doc_title": "Rent Demand Notice" if status == Invoice.Status.OVERDUE
            else "Rent Invoice",
            "status": status,
            "status_text": Invoice.Status(status).label,
            "meta_groups": meta_groups,
            "line_items": self.line_items(),
            "totals": [
                ("Subtotal", money(self.subtotal), False),
                ("Amount paid", money(self.amount_paid), False),
                ("TOTAL DUE", money(self.balance), True),
            ],
            "payment_instructions": instructions,
            "notes": self.notes or "Payment is due on or before the due date shown above. "
                                    "Late payments attract a fee as per the tenancy agreement.",
        }


class RentReminder(TimeStampedModel):
    """One reminder the desk raised on one invoice, and the channel it went out on.

    The statuses stop short of the tenant by design. ``WRITTEN`` means a message exists in this
    application's own inbox. ``LINK_READY`` and ``OPENED`` describe the desk's screen: WhatsApp
    returns nothing to this server, so no row here can ever claim the message was delivered,
    read or even sent. ``NO_NUMBER`` is recorded when the tenant's phone could not be read as a
    dialable number — the inbox copy still goes out.
    """

    class Channel(models.TextChoices):
        INBOX = "INBOX", "Platform inbox"
        WHATSAPP = "WHATSAPP", "WhatsApp click-to-chat"

    class Status(models.TextChoices):
        WRITTEN = "WRITTEN", "Written to the tenant's inbox"
        LINK_READY = "LINK_READY", "Chat handed to the desk"
        OPENED = "OPENED", "Chat opened by the desk"
        NO_NUMBER = "NO_NUMBER", "No usable WhatsApp number"

    invoice = models.ForeignKey(Invoice, on_delete=models.CASCADE, related_name="reminders")
    channel = models.CharField(max_length=10, choices=Channel.choices, default=Channel.INBOX,
                               db_index=True)
    status = models.CharField(max_length=11, choices=Status.choices, default=Status.WRITTEN,
                              db_index=True)
    body = models.TextField(help_text="The exact words the desk was given.")
    phone = models.CharField(
        max_length=40, blank=True, default="",
        help_text="Digits the chat was addressed to, as E.164 without the plus. Blank when no "
                  "number could be read.",
    )
    opened_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                                   null=True, blank=True, related_name="rent_reminders")

    class Meta:
        ordering = ("-created_at", "-id")
        indexes = [models.Index(fields=["invoice", "channel"])]

    def __str__(self):
        return f"{self.invoice_id} {self.channel} ({self.status})"


class Payment(TimeStampedModel):
    """Money received from a tenant. Confirmed payments allocate to an invoice."""

    class Method(models.TextChoices):
        CASH = "CASH", "Cash"
        BANK_TRANSFER = "BANK_TRANSFER", "Bank transfer"
        MOBILE_MONEY = "MOBILE_MONEY", "Mobile money"
        CARD = "CARD", "Card"
        CHEQUE = "CHEQUE", "Cheque"
        OTHER = "OTHER", "Other"

    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending confirmation"
        CONFIRMED = "CONFIRMED", "Confirmed"
        REJECTED = "REJECTED", "Rejected"

    number = models.CharField(max_length=30, unique=True, blank=True)
    invoice = models.ForeignKey(Invoice, on_delete=models.SET_NULL, null=True, blank=True,
                                related_name="payments")
    lease = models.ForeignKey("leases.Lease", on_delete=models.SET_NULL, null=True, blank=True,
                              related_name="payments")
    tenant = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT,
                               related_name="payments")
    payer_name = models.CharField(max_length=150, blank=True, default="")
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    currency = models.CharField(max_length=10, default="UGX")
    method = models.CharField(max_length=20, choices=Method.choices,
                              default=Method.MOBILE_MONEY)
    reference = models.CharField(
        max_length=120, blank=True, default="",
        help_text="Bank reference, mobile money transaction id or cheque number.",
    )
    paid_on = models.DateField(default=timezone.localdate, db_index=True)
    status = models.CharField(max_length=12, choices=Status.choices,
                              default=Status.PENDING, db_index=True)
    notes = models.TextField(blank=True, default="")
    rejection_reason = models.CharField(max_length=255, blank=True, default="")

    recorded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                                    null=True, blank=True, related_name="payments_recorded")
    confirmed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                                     null=True, blank=True, related_name="payments_confirmed")
    confirmed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ("-paid_on", "-id")
        indexes = [models.Index(fields=["status", "paid_on"])]

    def __str__(self):
        return f"{self.number} - {format_money(self.amount, self.currency)}"

    def save(self, *args, **kwargs):
        if not self.number:
            self.number = next_document_number(
                Company.load().payment_prefix, Payment, field="number"
            )
        if not self.payer_name:
            self.payer_name = self.tenant.full_name if self.tenant_id else ""
        if self.lease_id is None and self.invoice_id:
            self.lease_id = self.invoice.lease_id
        if not self.currency:
            self.currency = self.invoice.currency if self.invoice_id else "UGX"
        super().save(*args, **kwargs)

    @_property
    def is_confirmed(self):
        return self.status == Payment.Status.CONFIRMED

    @_property
    def receipt_number(self):
        receipt = getattr(self, "receipt", None)
        return receipt.number if receipt else None

    def confirm(self, user=None):
        self.status = Payment.Status.CONFIRMED
        self.confirmed_by = user
        self.confirmed_at = timezone.now()
        self.rejection_reason = ""
        self.save()
        return self

    def reject(self, user=None, reason=""):
        self.status = Payment.Status.REJECTED
        self.confirmed_by = user
        self.confirmed_at = timezone.now()
        self.rejection_reason = reason
        self.save()
        return self


class Receipt(TimeStampedModel):
    """Issued automatically when a payment is confirmed. The PDF is the legal copy."""

    number = models.CharField(max_length=30, unique=True, blank=True)
    payment = models.OneToOneField(Payment, on_delete=models.CASCADE, related_name="receipt")
    lease = models.ForeignKey("leases.Lease", on_delete=models.SET_NULL, null=True,
                              blank=True, related_name="receipts")
    property = models.ForeignKey("properties.Property", on_delete=models.SET_NULL, null=True,
                                 blank=True, related_name="receipts")
    tenant = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT,
                               related_name="receipts")
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    currency = models.CharField(max_length=10, default="UGX")
    method = models.CharField(max_length=20, choices=Payment.Method.choices,
                              default=Payment.Method.CASH)
    reference = models.CharField(max_length=120, blank=True, default="")
    paid_on = models.DateField()
    issued_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                                  null=True, blank=True, related_name="receipts_issued")
    pdf = models.FileField(
        upload_to="receipts/%Y/%m/",
        storage=SupabasePrivateFilesStorage(),
        blank=True,
        null=True,
    )
    notes = models.TextField(blank=True, default="")
    is_void = models.BooleanField(default=False)
    void_reason = models.CharField(max_length=255, blank=True, default="")
    voided_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ("-paid_on", "-id")

    def __str__(self):
        return self.number

    def save(self, *args, **kwargs):
        if not self.number:
            self.number = next_document_number(
                Company.load().receipt_prefix, Receipt, field="number"
            )
        super().save(*args, **kwargs)

    def void(self, reason="", user=None):
        self.is_void = True
        self.void_reason = reason
        self.voided_at = timezone.now()
        if user is not None and self.issued_by_id is None:
            self.issued_by = user
        self.save()
        self.generate_pdf()
        return self

    def build_document_data(self):
        company = Company.load()
        money = money_formatter(self.currency)
        payment = self.payment
        invoice = payment.invoice if payment else None
        tenant = self.tenant
        prop = self.property or (invoice.property if invoice else None)
        lease = self.lease or (invoice.lease if invoice else None)

        received_from = [
            ("Tenant", tenant.full_name if tenant else payment.payer_name),
            ("Phone", getattr(tenant, "phone", "")),
            ("Email", getattr(tenant, "email", "")),
        ]
        receipt_group = [
            ("Receipt number", self.number),
            ("Date received", f"{self.paid_on:%d %b %Y}"),
            ("Date issued", f"{timezone.localtime(self.created_at):%d %b %Y %H:%M}"),
            ("Payment method", self.get_method_display()),
            ("Transaction reference", self.reference or "n/a"),
            ("Payment number", payment.number if payment else ""),
        ]
        meta_groups = [("Received from", received_from), ("Receipt", receipt_group)]

        if prop:
            meta_groups.append(("Property", [
                ("Listing", prop.title),
                ("Reference", prop.reference),
                ("Address", prop.address),
                ("Location", prop.city_district),
            ]))
        if lease:
            meta_groups.append(("Lease", [
                ("Lease number", lease.number),
                ("Landlord", lease.landlord.full_name),
                ("Term", f"{lease.start_date:%d %b %Y} to {lease.end_date:%d %b %Y}"),
            ]))

        line_items = []
        if invoice:
            line_items = invoice.line_items()
            totals = [
                ("Invoice total", money(invoice.total), False),
                ("Paid before this receipt",
                 money(to_decimal(invoice.amount_paid) - to_decimal(self.amount)), False),
                ("THIS PAYMENT", money(self.amount), True),
                ("Balance after payment", money(invoice.balance), False),
            ]
            receipt_group.append(("Invoice number", invoice.number))
            receipt_group.append(("Billing period", invoice.period_label))
        else:
            line_items = [{
                "description": payment.notes or "Rent payment (no invoice reference)",
                "period": f"{self.paid_on:%d %b %Y}",
                "amount": money(self.amount),
            }]
            totals = [("AMOUNT RECEIVED", money(self.amount), True)]

        details = [
            ("Received by", getattr(payment.confirmed_by, "full_name", "")
             or getattr(payment.recorded_by, "full_name", "") or "Mant Bridges LTD"),
            ("Confirmation date", f"{timezone.localtime(payment.confirmed_at):%d %b %Y %H:%M}"
             if payment.confirmed_at else ""),
            ("Notes", self.notes or payment.notes or ""),
        ]

        notes = (
            "VOID - this receipt has been cancelled. " + self.void_reason
            if self.is_void else
            "Thank you for your payment. Please keep this receipt as proof of payment and "
            "quote the receipt number in any correspondence with Mant Bridges LTD."
        )

        return {
            "number": self.number,
            "company": company,
            "amount_display": money(self.amount),
            "meta_groups": meta_groups,
            "line_items": line_items,
            "totals": totals,
            "payment_details": details,
            "notes": notes,
            "void_text": "Void receipt" if self.is_void else None,
            "signer": getattr(payment.confirmed_by, "full_name", None)
            or getattr(payment.recorded_by, "full_name", None),
        }

    def generate_pdf(self):
        buffer = render_receipt_pdf(self.build_document_data())
        filename = f"receipts/{self.paid_on:%Y/%m}/{self.number}.pdf"
        self.pdf.save(filename, ContentFile(buffer.read()), save=False)
        if self.pk:
            Receipt.objects.filter(pk=self.pk).update(pdf=self.pdf.name)
        return self.pdf

    def ensure_pdf(self):
        if not self.pdf:
            self.generate_pdf()
        return self.pdf
