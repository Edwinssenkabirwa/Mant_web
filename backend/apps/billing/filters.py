import django_filters as filters
from django.db.models import F, Q
from django.utils import timezone

from apps.billing.models import Invoice, Payment, Receipt


class InvoiceFilter(filters.FilterSet):
    q = filters.CharFilter(method="filter_free_text")
    tenant = filters.NumberFilter(field_name="tenant_id")
    landlord = filters.NumberFilter(field_name="landlord_id")
    property = filters.NumberFilter(field_name="property_id")
    lease = filters.NumberFilter(field_name="lease_id")
    status = filters.CharFilter(field_name="status")
    outstanding = filters.BooleanFilter(method="filter_outstanding")
    overdue = filters.BooleanFilter(method="filter_overdue")
    due_before = filters.DateFilter(field_name="due_date", lookup_expr="lte")
    due_after = filters.DateFilter(field_name="due_date", lookup_expr="gte")
    period_from = filters.DateFilter(field_name="period_start", lookup_expr="gte")
    period_to = filters.DateFilter(field_name="period_end", lookup_expr="lte")
    min_amount = filters.NumberFilter(field_name="total", lookup_expr="gte")
    max_amount = filters.NumberFilter(field_name="total", lookup_expr="lte")
    year = filters.NumberFilter(field_name="due_date", lookup_expr="year")
    month = filters.NumberFilter(field_name="due_date", lookup_expr="month")

    class Meta:
        model = Invoice
        fields = ["q", "tenant", "landlord", "property", "lease", "status", "outstanding",
                  "overdue", "due_before", "due_after", "period_from", "period_to",
                  "min_amount", "max_amount", "year", "month"]

    def filter_free_text(self, queryset, name, value):
        for term in [word for word in value.split() if word]:
            queryset = queryset.filter(
                Q(number__icontains=term)
                | Q(lease__number__icontains=term)
                | Q(property__title__icontains=term)
                | Q(property__reference__icontains=term)
                | Q(tenant__first_name__icontains=term)
                | Q(tenant__last_name__icontains=term)
                | Q(tenant__email__icontains=term)
            )
        return queryset

    def filter_outstanding(self, queryset, name, value):
        if value is None:
            return queryset
        queryset = queryset.exclude(status=Invoice.Status.CANCELLED)
        return queryset.filter(total__gt=F("amount_paid")) if value else queryset.filter(
            total__lte=F("amount_paid")
        )

    def filter_overdue(self, queryset, name, value):
        if not value:
            return queryset
        return queryset.exclude(status__in=[Invoice.Status.CANCELLED, Invoice.Status.DRAFT,
                                            Invoice.Status.PAID]).filter(
            total__gt=F("amount_paid"), due_date__lt=timezone.localdate()
        )


class PaymentFilter(filters.FilterSet):
    q = filters.CharFilter(method="filter_free_text")
    tenant = filters.NumberFilter(field_name="tenant_id")
    invoice = filters.NumberFilter(field_name="invoice_id")
    lease = filters.NumberFilter(field_name="lease_id")
    status = filters.CharFilter(field_name="status")
    method = filters.CharFilter(field_name="method")
    date_from = filters.DateFilter(field_name="paid_on", lookup_expr="gte")
    date_to = filters.DateFilter(field_name="paid_on", lookup_expr="lte")
    min_amount = filters.NumberFilter(field_name="amount", lookup_expr="gte")
    max_amount = filters.NumberFilter(field_name="amount", lookup_expr="lte")
    year = filters.NumberFilter(field_name="paid_on", lookup_expr="year")
    month = filters.NumberFilter(field_name="paid_on", lookup_expr="month")

    class Meta:
        model = Payment
        fields = ["q", "tenant", "invoice", "lease", "status", "method", "date_from",
                  "date_to", "min_amount", "max_amount", "year", "month"]

    def filter_free_text(self, queryset, name, value):
        for term in [word for word in value.split() if word]:
            queryset = queryset.filter(
                Q(number__icontains=term)
                | Q(reference__icontains=term)
                | Q(payer_name__icontains=term)
                | Q(invoice__number__icontains=term)
                | Q(tenant__first_name__icontains=term)
                | Q(tenant__last_name__icontains=term)
                | Q(tenant__email__icontains=term)
            )
        return queryset


class ReceiptFilter(filters.FilterSet):
    q = filters.CharFilter(method="filter_free_text")
    tenant = filters.NumberFilter(field_name="tenant_id")
    lease = filters.NumberFilter(field_name="lease_id")
    property = filters.NumberFilter(field_name="property_id")
    method = filters.CharFilter(field_name="method")
    is_void = filters.BooleanFilter(field_name="is_void")
    date_from = filters.DateFilter(field_name="paid_on", lookup_expr="gte")
    date_to = filters.DateFilter(field_name="paid_on", lookup_expr="lte")

    class Meta:
        model = Receipt
        fields = ["q", "tenant", "lease", "property", "method", "is_void", "date_from",
                  "date_to"]

    def filter_free_text(self, queryset, name, value):
        for term in [word for word in value.split() if word]:
            queryset = queryset.filter(
                Q(number__icontains=term)
                | Q(reference__icontains=term)
                | Q(payment__number__icontains=term)
                | Q(tenant__first_name__icontains=term)
                | Q(tenant__last_name__icontains=term)
                | Q(tenant__email__icontains=term)
            )
        return queryset
