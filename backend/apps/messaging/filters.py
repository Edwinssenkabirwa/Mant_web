import django_filters as filters
from django.db.models import Q

from apps.messaging.models import Conversation


class ConversationFilter(filters.FilterSet):
    q = filters.CharFilter(method="filter_free_text")
    status = filters.CharFilter(field_name="status")
    category = filters.CharFilter(field_name="category")
    property = filters.NumberFilter(field_name="property_id")
    lease = filters.NumberFilter(field_name="lease_id")
    participant = filters.NumberFilter(field_name="participants__id")
    created_by = filters.NumberFilter(field_name="created_by_id")

    class Meta:
        model = Conversation
        fields = ["q", "status", "category", "property", "lease", "participant", "created_by"]

    def filter_free_text(self, queryset, name, value):
        for term in [word for word in value.split() if word]:
            queryset = queryset.filter(
                Q(subject__icontains=term)
                | Q(messages__body__icontains=term)
                | Q(created_by__first_name__icontains=term)
                | Q(created_by__last_name__icontains=term)
                | Q(created_by__email__icontains=term)
                | Q(property__title__icontains=term)
                | Q(lease__number__icontains=term)
            ).distinct()
        return queryset
