from datetime import timedelta

from django.db.models import Count
from django.utils import timezone
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.models import Role
from apps.accounts.permissions import IsAdminOrLandlord
from apps.billing.models import Invoice, Payment
from apps.billing.services import generate_invoices_for_lease, tenant_statement
from apps.leases.filters import LeaseFilter
from apps.leases.models import Lease
from apps.leases.serializers import LeaseOptionSerializer, LeaseSerializer


class LeaseViewSet(viewsets.ModelViewSet):
    """Tenancies. Administrators see all, landlords their own, tenants their own."""

    permission_classes = [IsAuthenticated]
    serializer_class = LeaseSerializer
    filterset_class = LeaseFilter
    ordering_fields = ["start_date", "end_date", "monthly_rent", "created_at", "status"]
    ordering = ["-created_at"]

    def get_queryset(self):
        user = self.request.user
        queryset = Lease.objects.select_related(
            "property", "property__owner", "tenant", "landlord"
        ).prefetch_related("property__images")
        if user.role == Role.ADMIN:
            return queryset
        if user.role == Role.LANDLORD:
            return queryset.filter(landlord=user)
        return queryset.filter(tenant=user)

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy",
                           "generate_invoices"):
            return [IsAuthenticated(), IsAdminOrLandlord()]
        return super().get_permissions()

    @action(detail=True, methods=["post"], url_path="generate-invoices")
    def generate_invoices(self, request, pk=None):
        lease = self.get_object()
        created = generate_invoices_for_lease(lease)
        return Response({
            "count": len(created),
            "invoice_numbers": [invoice.number for invoice in created],
            "detail": (
                f"{len(created)} invoice(s) generated."
                if created else "Every billing period is already invoiced."
            ),
        })

    @action(detail=True, methods=["get"])
    def statement(self, request, pk=None):
        lease = self.get_object()
        invoices = Invoice.objects.filter(lease=lease).select_related("property")
        payments = (
            Payment.objects.filter(lease=lease, status=Payment.Status.CONFIRMED)
            .select_related("receipt")
        )
        return Response(tenant_statement(invoices, payments, currency=lease.currency))

    @action(detail=False, methods=["get"])
    def options(self, request):
        queryset = self.filter_queryset(self.get_queryset())[:200]
        serializer = LeaseOptionSerializer(queryset, many=True, context={"request": request})
        return Response(serializer.data)

    @action(detail=False, methods=["get"])
    def stats(self, request):
        queryset = self.get_queryset()
        today = timezone.localdate()
        by_status = {
            row["status"]: row["count"]
            for row in queryset.values("status").annotate(count=Count("id"))
        }
        return Response({
            "total": queryset.count(),
            "by_status": by_status,
            "active": queryset.filter(status=Lease.Status.ACTIVE).count(),
            "expiring_soon": queryset.filter(
                status=Lease.Status.ACTIVE,
                end_date__gte=today,
                end_date__lte=today + timedelta(days=60),
            ).count(),
        })
