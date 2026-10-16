from datetime import timedelta

import django_filters as filters
from django.db.models import Q
from django.utils import timezone

from apps.leases.models import Lease


class LeaseFilter(filters.FilterSet):
    q = filters.CharFilter(method="filter_free_text")
    tenant = filters.NumberFilter(field_name="tenant_id")
    landlord = filters.NumberFilter(field_name="landlord_id")
    property = filters.NumberFilter(field_name="property_id")
    status = filters.CharFilter(field_name="status")
    active = filters.BooleanFilter(method="filter_active")
    expiring_soon = filters.BooleanFilter(method="filter_expiring_soon")
    ending_before = filters.DateFilter(field_name="end_date", lookup_expr="lte")
    starting_after = filters.DateFilter(field_name="start_date", lookup_expr="gte")

    class Meta:
        model = Lease
        fields = ["q", "tenant", "landlord", "property", "status", "active",
                  "expiring_soon", "ending_before", "starting_after"]

    def filter_free_text(self, queryset, name, value):
        for term in [word for word in value.split() if word]:
            queryset = queryset.filter(
                Q(number__icontains=term)
                | Q(property__title__icontains=term)
                | Q(property__reference__icontains=term)
                | Q(tenant__first_name__icontains=term)
                | Q(tenant__last_name__icontains=term)
                | Q(tenant__email__icontains=term)
            )
        return queryset

    def filter_active(self, queryset, name, value):
        today = timezone.localdate()
        if value is True:
            return queryset.filter(status=Lease.Status.ACTIVE, start_date__lte=today,
                                   end_date__gte=today)
        if value is False:
            return queryset.exclude(status=Lease.Status.ACTIVE, start_date__lte=today,
                                    end_date__gte=today)
        return queryset

    def filter_expiring_soon(self, queryset, name, value):
        if not value:
            return queryset
        today = timezone.localdate()
        return queryset.filter(status=Lease.Status.ACTIVE, end_date__gte=today,
                               end_date__lte=today + timedelta(days=60))
