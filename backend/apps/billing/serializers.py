from django.utils import timezone
from rest_framework import serializers

from apps.accounts.models import Role
from apps.accounts.serializers import UserBriefSerializer
from apps.billing.models import Invoice, Payment, Receipt, RentReminder
from apps.billing.reminders import normalise_msisdn
from apps.core.helpers import format_money, to_decimal


class InvoiceBriefSerializer(serializers.ModelSerializer):
    period_label = serializers.CharField(read_only=True)
    balance = serializers.DecimalField(max_digits=16, decimal_places=2, read_only=True)

    class Meta:
        model = Invoice
        fields = ["id", "number", "period_label", "period_start", "period_end", "due_date",
                  "total", "amount_paid", "balance", "status", "currency"]


class PaymentBriefSerializer(serializers.ModelSerializer):
    method_display = serializers.CharField(source="get_method_display", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        model = Payment
        fields = ["id", "number", "amount", "currency", "method", "method_display",
                  "reference", "paid_on", "status", "status_display"]


class InvoiceSerializer(serializers.ModelSerializer):
    tenant_detail = UserBriefSerializer(source="tenant", read_only=True)
    tenant_name = serializers.CharField(source="tenant.full_name", read_only=True)
    landlord_name = serializers.CharField(source="landlord.full_name", read_only=True)
    property_title = serializers.CharField(source="property.title", read_only=True)
    property_reference = serializers.CharField(source="property.reference", read_only=True)
    property_slug = serializers.CharField(source="property.slug", read_only=True)
    lease_number = serializers.CharField(source="lease.number", read_only=True)

    subtotal = serializers.DecimalField(max_digits=16, decimal_places=2, read_only=True)
    balance = serializers.DecimalField(max_digits=16, decimal_places=2, read_only=True)
    days_overdue = serializers.IntegerField(read_only=True)
    is_overdue = serializers.BooleanField(read_only=True)
    period_label = serializers.CharField(read_only=True)
    effective_status = serializers.CharField(read_only=True)
    effective_status_display = serializers.SerializerMethodField()
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    # The tenant's number already dialable as-is, or "" when it is missing or unreadable. The
    # desk's arrears list reads this to know before it clicks; nothing here repairs a number.
    whatsapp_number = serializers.SerializerMethodField()

    total_display = serializers.SerializerMethodField()
    balance_display = serializers.SerializerMethodField()
    amount_paid_display = serializers.SerializerMethodField()

    payments = PaymentBriefSerializer(many=True, read_only=True)

    class Meta:
        model = Invoice
        fields = [
            "id", "number", "lease", "lease_number", "property", "property_title",
            "property_reference", "property_slug", "tenant", "tenant_detail", "tenant_name",
            "landlord", "landlord_name",
            "period_start", "period_end", "period_label", "issue_date", "due_date",
            "rent_amount", "service_charge", "utility_charge", "other_charge",
            "other_charge_label", "discount", "tax_percent", "tax_amount", "late_fee",
            "subtotal", "total", "amount_paid", "balance", "currency",
            "total_display", "balance_display", "amount_paid_display",
            "status", "status_display", "effective_status", "effective_status_display",
            "days_overdue", "is_overdue", "notes", "reminder_count", "last_reminder_at",
            "whatsapp_number", "payments", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "number", "created_at", "updated_at"]

    def get_effective_status_display(self, obj):
        return Invoice.Status(obj.effective_status).label

    def get_whatsapp_number(self, obj):
        return normalise_msisdn(obj.tenant.phone) or ""

    def get_total_display(self, obj):
        return format_money(obj.total, obj.currency)

    def get_balance_display(self, obj):
        return format_money(obj.balance, obj.currency)

    def get_amount_paid_display(self, obj):
        return format_money(obj.amount_paid, obj.currency)


class ManageInvoiceSerializer(serializers.ModelSerializer):
    """Create or amend an invoice. Totals are always computed server side."""

    lease_number = serializers.CharField(source="lease.number", read_only=True)
    tenant_name = serializers.CharField(source="tenant.full_name", read_only=True)
    property_title = serializers.CharField(source="property.title", read_only=True)
    total = serializers.DecimalField(max_digits=16, decimal_places=2, read_only=True)
    amount_paid = serializers.DecimalField(max_digits=16, decimal_places=2, read_only=True)
    tax_amount = serializers.DecimalField(max_digits=16, decimal_places=2, read_only=True)
    balance = serializers.DecimalField(max_digits=16, decimal_places=2, read_only=True)

    class Meta:
        model = Invoice
        fields = [
            "id", "number", "lease", "lease_number", "property", "property_title",
            "tenant", "tenant_name", "landlord", "period_start", "period_end",
            "issue_date", "due_date", "rent_amount", "service_charge", "utility_charge",
            "other_charge", "other_charge_label", "discount", "tax_percent", "tax_amount",
            "late_fee", "total", "amount_paid", "balance", "currency", "status", "notes",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "number", "property", "tenant", "landlord", "tax_amount",
                            "total", "amount_paid", "currency", "created_at", "updated_at"]
        extra_kwargs = {
            "notes": {"required": False, "allow_blank": True},
            "issue_date": {"required": False},
        }

    def validate(self, attrs):
        lease = attrs.get("lease", getattr(self.instance, "lease", None))
        start = attrs.get("period_start", getattr(self.instance, "period_start", None))
        end = attrs.get("period_end", getattr(self.instance, "period_end", None))
        due = attrs.get("due_date", getattr(self.instance, "due_date", None))

        if lease is None:
            raise serializers.ValidationError({"lease": "Select the tenancy this invoice belongs to."})
        if start and end and end < start:
            raise serializers.ValidationError(
                {"period_end": "The period end cannot precede the period start."}
            )
        if due and start and due < start:
            raise serializers.ValidationError(
                {"due_date": "The due date cannot fall before the billing period starts."}
            )
        if start:
            duplicate = Invoice.objects.filter(lease=lease, period_start=start).exclude(
                status=Invoice.Status.CANCELLED
            )
            if self.instance:
                duplicate = duplicate.exclude(pk=self.instance.pk)
            if duplicate.exists():
                raise serializers.ValidationError(
                    {"period_start": "This billing period has already been invoiced."}
                )
        return attrs

    def validate_status(self, value):
        if self.instance and self.instance.status == Invoice.Status.PAID and value != Invoice.Status.PAID:
            if self.instance.amount_paid > 0:
                raise serializers.ValidationError(
                    "Remove or reject the recorded payments before reopening a paid invoice."
                )
        return value

    def create(self, validated_data):
        lease = validated_data["lease"]
        validated_data.setdefault("property", lease.property)
        validated_data.setdefault("tenant", lease.tenant)
        validated_data.setdefault("landlord", lease.landlord)
        validated_data.setdefault("currency", lease.currency)
        if not validated_data.get("due_date"):
            validated_data["due_date"] = validated_data["period_end"]
        return super().create(validated_data)


class RentReminderSerializer(serializers.ModelSerializer):
    """The desk's trail of reminders. Read-only: a reminder is created by sending it."""

    channel_display = serializers.CharField(source="get_channel_display", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    invoice_number = serializers.CharField(source="invoice.number", read_only=True)
    tenant_name = serializers.CharField(source="invoice.tenant.full_name", read_only=True)
    created_by_name = serializers.CharField(source="created_by.full_name", read_only=True,
                                           default="")

    class Meta:
        model = RentReminder
        fields = ["id", "invoice", "invoice_number", "tenant_name", "channel", "channel_display",
                  "status", "status_display", "phone", "body", "opened_at", "created_by_name",
                  "created_at"]


class PaymentSerializer(serializers.ModelSerializer):
    invoice_detail = InvoiceBriefSerializer(source="invoice", read_only=True)
    tenant_detail = UserBriefSerializer(source="tenant", read_only=True)
    tenant_name = serializers.CharField(source="tenant.full_name", read_only=True)
    lease_number = serializers.CharField(source="lease.number", read_only=True, default="")
    property_title = serializers.CharField(source="invoice.property.title", read_only=True,
                                           default="")
    property_slug = serializers.CharField(source="invoice.property.slug", read_only=True,
                                          default="")
    recorded_by_name = serializers.CharField(source="recorded_by.full_name", read_only=True,
                                             default="")
    confirmed_by_name = serializers.CharField(source="confirmed_by.full_name", read_only=True,
                                              default="")
    method_display = serializers.CharField(source="get_method_display", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    amount_display = serializers.SerializerMethodField()
    receipt_number = serializers.CharField(read_only=True)

    class Meta:
        model = Payment
        fields = [
            "id", "number", "invoice", "invoice_detail", "lease", "lease_number",
            "property_title", "property_slug", "tenant", "tenant_detail", "tenant_name", "payer_name",
            "amount", "amount_display", "currency", "method", "method_display",
            "reference", "paid_on", "status", "status_display", "notes",
            "rejection_reason", "recorded_by", "recorded_by_name", "confirmed_by_name",
            "confirmed_at", "receipt_number", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "number", "recorded_by", "created_at", "updated_at"]
        extra_kwargs = {
            "lease": {"required": False, "allow_null": True},
            "invoice": {"required": False, "allow_null": True},
            "notes": {"required": False, "allow_blank": True},
            "payer_name": {"required": False, "allow_blank": True},
        }

    def get_amount_display(self, obj):
        return format_money(obj.amount, obj.currency)

    def validate_amount(self, value):
        if value is None or to_decimal(value) <= 0:
            raise serializers.ValidationError("The payment amount must be greater than zero.")
        return value

    def validate(self, attrs):
        request = self.context.get("request")
        user = getattr(request, "user", None)
        invoice = attrs.get("invoice", getattr(self.instance, "invoice", None))
        amount = to_decimal(attrs.get("amount", getattr(self.instance, "amount", 0)))

        if invoice is not None:
            if invoice.status == Invoice.Status.CANCELLED:
                raise serializers.ValidationError(
                    {"invoice": "This invoice has been cancelled and cannot receive payments."}
                )
            already_paid = to_decimal(invoice.amount_paid)
            if self.instance and self.instance.status == Payment.Status.CONFIRMED:
                already_paid -= to_decimal(self.instance.amount)
            if already_paid + amount > to_decimal(invoice.total):
                raise serializers.ValidationError({
                    "amount": (
                        f"The payment exceeds the outstanding balance of "
                        f"{format_money(invoice.balance, invoice.currency)}."
                    )
                })
            attrs.setdefault("lease", invoice.lease)
            if user is None or user.role != Role.TENANT:
                attrs.setdefault("tenant", invoice.tenant)

        if attrs.get("tenant") is None and getattr(self.instance, "tenant_id", None) is None:
            raise serializers.ValidationError({
                "tenant": "Select the tenant paying, or attach the payment to an invoice."
            })

        if user is not None and user.role == Role.TENANT:
            attrs["tenant"] = user
            attrs["status"] = Payment.Status.PENDING
            if invoice is not None and invoice.tenant_id != user.pk:
                raise serializers.ValidationError(
                    {"invoice": "This invoice does not belong to your account."}
                )
            if invoice is None:
                raise serializers.ValidationError(
                    {"invoice": "Select the invoice you are paying."}
                )
        return attrs

    def create(self, validated_data):
        request = self.context.get("request")
        user = getattr(request, "user", None)
        validated_data["recorded_by"] = user
        status_value = validated_data.get("status", Payment.Status.PENDING)
        if status_value == Payment.Status.CONFIRMED:
            validated_data["confirmed_by"] = user
            validated_data["confirmed_at"] = timezone.now()
        if not validated_data.get("currency"):
            invoice = validated_data.get("invoice")
            validated_data["currency"] = invoice.currency if invoice else "UGX"
        return super().create(validated_data)

    def update(self, instance, validated_data):
        user = getattr(self.context.get("request"), "user", None)
        new_status = validated_data.get("status", instance.status)
        if new_status == Payment.Status.CONFIRMED and instance.status != Payment.Status.CONFIRMED:
            validated_data["confirmed_by"] = user
            validated_data["confirmed_at"] = timezone.now()
            validated_data["rejection_reason"] = ""
        return super().update(instance, validated_data)


class ReceiptSerializer(serializers.ModelSerializer):
    pdf_url = serializers.SerializerMethodField()
    tenant_name = serializers.CharField(source="tenant.full_name", read_only=True)
    property_title = serializers.CharField(source="property.title", read_only=True, default="")
    property_slug = serializers.CharField(source="property.slug", read_only=True, default="")
    lease_number = serializers.CharField(source="lease.number", read_only=True, default="")
    payment_number = serializers.CharField(source="payment.number", read_only=True)
    method_display = serializers.CharField(source="get_method_display", read_only=True)
    issued_by_name = serializers.CharField(source="issued_by.full_name", read_only=True,
                                           default="")
    amount_display = serializers.SerializerMethodField()
    invoice_number = serializers.CharField(source="payment.invoice.number", read_only=True,
                                           default="")

    class Meta:
        model = Receipt
        fields = [
            "id", "number", "payment", "payment_number", "invoice_number", "lease",
            "lease_number", "property", "property_title", "property_slug", "tenant", "tenant_name",
            "amount", "amount_display", "currency", "method", "method_display",
            "reference", "paid_on", "issued_by_name", "pdf_url", "notes",
            "is_void", "void_reason", "voided_at", "created_at",
        ]
        read_only_fields = [
            "id", "number", "payment", "lease", "property", "tenant", "amount",
            "currency", "method", "reference", "paid_on", "notes", "is_void",
            "void_reason", "voided_at", "created_at",
        ]

    def get_amount_display(self, obj):
        return format_money(obj.amount, obj.currency)

    def get_pdf_url(self, obj):
        if not obj.pdf:
            return None
        request = self.context.get("request")
        url = obj.pdf.url
        return request.build_absolute_uri(url) if request else url


class VoidReceiptSerializer(serializers.Serializer):
    reason = serializers.CharField(max_length=255, required=False, allow_blank=True)


class RejectPaymentSerializer(serializers.Serializer):
    reason = serializers.CharField(max_length=255, required=False, allow_blank=True)
