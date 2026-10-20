from functools import partial

from django.db.models import F, Sum
from django.http import FileResponse
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import Role, User
from apps.accounts.permissions import IsAdminOrTenant, IsAdminRole, IsLandlordRole
from apps.billing.filters import InvoiceFilter, PaymentFilter, ReceiptFilter
from apps.billing.models import ZERO, Invoice, Payment, Receipt
from apps.billing.serializers import (
    InvoiceSerializer,
    ManageInvoiceSerializer,
    PaymentSerializer,
    ReceiptSerializer,
    RejectPaymentSerializer,
    VoidReceiptSerializer,
)
from apps.billing.services import (
    generate_invoices_for_lease,
    landlord_overview,
    late_fee_for,
    rent_analytics,
    scope_for,
    tenant_statement,
)
from apps.core.helpers import format_money
from apps.core.services.documents import render_invoice_pdf
from apps.leases.models import Lease
from apps.messaging.services import get_or_create_conversation, post_message
from apps.properties.models import Property

OUTSTANDING = F("total") - F("amount_paid")
PDF_CONTENT_TYPE = "application/pdf"


def _months_param(request, default=6):
    try:
        months = int(request.query_params.get("months") or default)
    except (TypeError, ValueError):
        months = default
    return max(1, min(months, 24))


class InvoiceViewSet(viewsets.ModelViewSet):
    """Rent invoices. Administrators see all, tenants their own. A landlord's own position is
    reported by /api/landlord/overview/, which carries totals rather than tenant documents."""

    permission_classes = [IsAuthenticated, IsAdminOrTenant]
    serializer_class = InvoiceSerializer
    filterset_class = InvoiceFilter
    ordering_fields = ["due_date", "period_start", "total", "amount_paid", "created_at",
                       "status"]
    ordering = ["-due_date", "-id"]

    def get_queryset(self):
        user = self.request.user
        queryset = Invoice.objects.select_related(
            "lease", "property", "tenant", "landlord"
        ).prefetch_related("payments")
        if user.role == Role.ADMIN:
            return queryset
        return queryset.filter(tenant=user)

    def get_serializer_class(self):
        if self.action in ("create", "update", "partial_update"):
            return ManageInvoiceSerializer
        return InvoiceSerializer

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy", "remind",
                           "apply_late_fee", "generate"):
            return [IsAuthenticated(), IsAdminRole()]
        return super().get_permissions()

    @action(detail=True, methods=["get"])
    def pdf(self, request, pk=None):
        invoice = self.get_object()
        buffer = render_invoice_pdf(invoice.build_document_data())
        return FileResponse(buffer, as_attachment=True, filename=f"{invoice.number}.pdf",
                            content_type=PDF_CONTENT_TYPE)

    @action(detail=True, methods=["post"], url_path="apply-late-fee")
    def apply_late_fee(self, request, pk=None):
        invoice = self.get_object()
        fee = late_fee_for(invoice)
        if fee <= ZERO:
            return Response(
                {"detail": "No late fee is due on this invoice yet."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        invoice.late_fee = fee
        invoice.save()
        return Response(InvoiceSerializer(invoice, context={"request": request}).data)

    @action(detail=True, methods=["post"])
    def remind(self, request, pk=None):
        """Send the tenant a rent reminder through the platform inbox."""
        invoice = self.get_object()
        money = partial(format_money, currency_symbol=invoice.currency)
        conversation = get_or_create_conversation(
            participants=[invoice.tenant, request.user],
            subject=f"Rent reminder - {invoice.number}",
            created_by=request.user,
            property_obj=invoice.property,
            lease=invoice.lease,
        )
        body = (
            f"Dear {invoice.tenant.short_name},\n\n"
            f"This is a reminder from Mant Bridges LTD regarding invoice {invoice.number} "
            f"for {invoice.property.title}, covering {invoice.period_label}.\n\n"
            f"Amount charged: {money(invoice.total)}\n"
            f"Received to date: {money(invoice.amount_paid)}\n"
            f"Outstanding balance: {money(invoice.balance)}\n"
            f"Due date: {invoice.due_date:%d %b %Y}"
            + (f" ({invoice.days_overdue} days overdue)" if invoice.is_overdue else "")
            + "\n\nPlease pay at your earliest convenience and quote the invoice number. "
              "If you have already paid, send us the transaction reference so we can "
              "reconcile your account and issue your receipt.\n\n"
              "Regards,\nMant Bridges LTD"
        )
        post_message(conversation, request.user, body)
        invoice.mark_reminder_sent()
        return Response({
            "detail": "Reminder sent to the tenant.",
            "conversation_id": conversation.pk,
            "invoice_number": invoice.number,
            "reminder_count": invoice.reminder_count,
        })

    @action(detail=False, methods=["post"])
    def generate(self, request):
        """Bring invoicing up to date for every active tenancy in scope."""
        leases = Lease.objects.filter(status=Lease.Status.ACTIVE)
        if request.user.role != Role.ADMIN:
            leases = leases.filter(landlord=request.user)
        created = []
        for lease in leases:
            created.extend(generate_invoices_for_lease(lease))
        return Response({
            "count": len(created),
            "invoice_numbers": [invoice.number for invoice in created],
            "detail": (
                f"{len(created)} invoice(s) generated."
                if created else "All active tenancies are already invoiced to date."
            ),
        })

    @action(detail=False, methods=["get"])
    def summary(self, request):
        today = timezone.localdate()
        queryset = self.filter_queryset(self.get_queryset()).exclude(
            status=Invoice.Status.CANCELLED
        )
        outstanding = queryset.filter(total__gt=F("amount_paid"))
        return Response({
            "count": queryset.count(),
            "total": queryset.aggregate(value=Sum("total"))["value"] or ZERO,
            "collected": queryset.aggregate(value=Sum("amount_paid"))["value"] or ZERO,
            "outstanding_total": outstanding.aggregate(value=Sum(OUTSTANDING))["value"] or ZERO,
            "outstanding_count": outstanding.count(),
            "overdue_count": outstanding.filter(due_date__lt=today).count(),
            "due_this_month": queryset.filter(
                due_date__year=today.year, due_date__month=today.month
            ).count(),
        })


class PaymentViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, IsAdminOrTenant]
    serializer_class = PaymentSerializer
    filterset_class = PaymentFilter
    ordering_fields = ["paid_on", "amount", "created_at", "status"]
    ordering = ["-paid_on", "-id"]

    def get_queryset(self):
        user = self.request.user
        queryset = Payment.objects.select_related(
            "invoice", "invoice__property", "lease", "tenant", "recorded_by", "confirmed_by",
            "receipt",
        )
        if user.role == Role.ADMIN:
            return queryset
        return queryset.filter(tenant=user)

    def get_permissions(self):
        # Tenants may report a payment they have made; only the office confirms, rejects or edits.
        if self.action in ("confirm", "reject", "update", "partial_update", "destroy"):
            return [IsAuthenticated(), IsAdminRole()]
        return super().get_permissions()

    @action(detail=True, methods=["post"])
    def confirm(self, request, pk=None):
        payment = self.get_object()
        if payment.status == Payment.Status.CONFIRMED:
            return Response({"detail": "This payment is already confirmed."},
                            status=status.HTTP_400_BAD_REQUEST)
        payment.confirm(user=request.user)
        payment.refresh_from_db()
        data = self.get_serializer(payment).data
        receipt = getattr(payment, "receipt", None)
        data["receipt"] = (
            ReceiptSerializer(receipt, context={"request": request}).data if receipt else None
        )
        return Response(data)

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        payment = self.get_object()
        if payment.status == Payment.Status.REJECTED:
            return Response({"detail": "This payment has already been rejected."},
                            status=status.HTTP_400_BAD_REQUEST)
        form = RejectPaymentSerializer(data=request.data)
        form.is_valid(raise_exception=True)
        payment.reject(user=request.user, reason=form.validated_data.get("reason", ""))
        return Response(self.get_serializer(payment).data)

    @action(detail=False, methods=["get"])
    def summary(self, request):
        queryset = self.filter_queryset(self.get_queryset())
        confirmed = queryset.filter(status=Payment.Status.CONFIRMED)
        return Response({
            "count": queryset.count(),
            "confirmed_total": confirmed.aggregate(value=Sum("amount"))["value"] or ZERO,
            "confirmed_count": confirmed.count(),
            "pending_count": queryset.filter(status=Payment.Status.PENDING).count(),
            "pending_total": queryset.filter(status=Payment.Status.PENDING).aggregate(
                value=Sum("amount")
            )["value"] or ZERO,
            "rejected_count": queryset.filter(status=Payment.Status.REJECTED).count(),
            "this_month": confirmed.filter(
                paid_on__year=timezone.localdate().year,
                paid_on__month=timezone.localdate().month,
            ).aggregate(value=Sum("amount"))["value"] or ZERO,
        })


class ReceiptViewSet(viewsets.ReadOnlyModelViewSet):
    """Receipts are issued to the tenant who paid. A landlord's own documents from the rent desk
    are the reports an administrator generates for him, not these."""

    permission_classes = [IsAuthenticated, IsAdminOrTenant]
    serializer_class = ReceiptSerializer
    filterset_class = ReceiptFilter
    ordering_fields = ["paid_on", "amount", "created_at"]
    ordering = ["-paid_on", "-id"]

    def get_queryset(self):
        user = self.request.user
        queryset = Receipt.objects.select_related(
            "payment", "payment__invoice", "tenant", "property", "lease", "issued_by"
        )
        if user.role == Role.ADMIN:
            return queryset
        return queryset.filter(tenant=user)

    @action(detail=True, methods=["get"])
    def download(self, request, pk=None):
        receipt = self.get_object()
        receipt.ensure_pdf()
        return FileResponse(receipt.pdf.open("rb"), as_attachment=True,
                            filename=f"{receipt.number}.pdf", content_type=PDF_CONTENT_TYPE)

    @action(detail=True, methods=["post"],
            permission_classes=[IsAuthenticated, IsAdminRole])
    def void(self, request, pk=None):
        receipt = self.get_object()
        if receipt.is_void:
            return Response({"detail": "This receipt has already been voided."},
                            status=status.HTTP_400_BAD_REQUEST)
        form = VoidReceiptSerializer(data=request.data)
        form.is_valid(raise_exception=True)
        reason = form.validated_data.get("reason", "") or "No reason given."
        receipt.void(reason=reason, user=request.user)
        payment = receipt.payment
        if payment.status == Payment.Status.CONFIRMED:
            # A void receipt must never leave a confirmed payment behind it.
            payment.reject(user=request.user,
                           reason=f"Receipt {receipt.number} voided: {reason}")
        return Response(ReceiptSerializer(receipt, context={"request": request}).data)


class AnalyticsView(APIView):
    """Dashboard numbers for the office and for tenants. Landlords have their own read-only
    summary at /api/landlord/overview/."""

    permission_classes = [IsAuthenticated, IsAdminOrTenant]

    def get(self, request):
        user = request.user
        invoices, payments, leases = scope_for(user)
        data = rent_analytics(invoices, payments, leases, months=_months_param(request))
        data["role"] = user.role

        if user.role == Role.ADMIN:
            data["portfolio"] = {
                "properties": Property.objects.count(),
                "published": Property.objects.filter(is_published=True).count(),
                "available": Property.objects.available().count(),
                "occupied": Property.objects.filter(status=Property.Status.OCCUPIED).count(),
                "landlords": User.objects.filter(role=Role.LANDLORD).count(),
                "tenants": User.objects.filter(role=Role.TENANT).count(),
                "receipts": Receipt.objects.filter(is_void=False).count(),
            }
        else:
            today = timezone.localdate()
            next_invoice = invoices.filter(
                total__gt=F("amount_paid")
            ).exclude(status=Invoice.Status.CANCELLED).order_by("due_date").first()
            data["my_account"] = {
                "active_lease": leases.filter(status=Lease.Status.ACTIVE).count(),
                "next_due": {
                    "number": next_invoice.number,
                    "due_date": next_invoice.due_date,
                    "balance": next_invoice.balance,
                    "property": next_invoice.property.title,
                } if next_invoice else None,
                "receipts": Receipt.objects.filter(tenant=user, is_void=False).count(),
                "days_to_expiry_lease": min(
                    [
                        (lease.end_date - today).days
                        for lease in leases.filter(status=Lease.Status.ACTIVE)
                        if lease.end_date
                    ],
                    default=None,
                ),
            }
        return Response(data)


class StatementView(APIView):
    """Running ledger of charges and payments for the requesting user's scope."""

    permission_classes = [IsAuthenticated, IsAdminOrTenant]

    def get(self, request):
        invoices, payments, _ = scope_for(request.user)
        lease_id = request.query_params.get("lease")
        tenant_id = request.query_params.get("tenant")

        if lease_id:
            invoices = invoices.filter(lease_id=lease_id)
            payments = payments.filter(lease_id=lease_id)
        if tenant_id and request.user.role == Role.ADMIN:
            invoices = invoices.filter(tenant_id=tenant_id)
            payments = payments.filter(tenant_id=tenant_id)

        invoices = invoices.select_related("property", "lease", "tenant")
        payments = (
            payments.filter(status=Payment.Status.CONFIRMED)
            .select_related("receipt", "tenant")
        )
        currency = request.query_params.get("currency") or "UGX"
        data = tenant_statement(invoices, payments, currency=currency)
        data["filters"] = {"lease": lease_id, "tenant": tenant_id}
        return Response(data)


class LandlordOverviewView(APIView):
    """The landlord portal's whole API surface: the collection trend on his own properties and
    their occupancy. Aggregates only — no invoice, payment or receipt names a tenant to him."""

    permission_classes = [IsAuthenticated, IsLandlordRole]

    def get(self, request):
        return Response(landlord_overview(request.user, months=_months_param(request)))
