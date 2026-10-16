import django_filters as filters
from django.db.models import Q

from apps.properties.models import Property


class CharInFilter(filters.BaseInFilter, filters.CharFilter):
    """Accepts comma separated values, e.g. ?property_type=APARTMENT,HOUSE"""


class PropertyFilter(filters.FilterSet):
    q = filters.CharFilter(method="filter_free_text")
    property_type = CharInFilter(field_name="property_type", lookup_expr="in")
    status = CharInFilter(field_name="status", lookup_expr="in")
    listing_type = filters.ChoiceFilter(choices=Property.ListingType.choices)
    furnishing = filters.ChoiceFilter(choices=Property.Furnishing.choices)
    city = filters.CharFilter(field_name="city", lookup_expr="icontains")
    district = filters.CharFilter(field_name="district", lookup_expr="icontains")
    min_price = filters.NumberFilter(field_name="price", lookup_expr="gte")
    max_price = filters.NumberFilter(field_name="price", lookup_expr="lte")
    bedrooms_min = filters.NumberFilter(field_name="bedrooms", lookup_expr="gte")
    bedrooms = filters.NumberFilter(field_name="bedrooms", lookup_expr="exact")
    bathrooms_min = filters.NumberFilter(field_name="bathrooms", lookup_expr="gte")
    amenities = filters.CharFilter(method="filter_amenities")
    featured = filters.BooleanFilter(field_name="is_featured")
    published = filters.BooleanFilter(field_name="is_published")
    owner = filters.NumberFilter(field_name="owner_id")

    class Meta:
        model = Property
        fields = [
            "q", "property_type", "status", "listing_type", "furnishing", "city",
            "district", "min_price", "max_price", "bedrooms", "bedrooms_min",
            "bathrooms_min", "amenities", "featured", "published", "owner",
        ]

    def filter_free_text(self, queryset, name, value):
        """Match every search word against the fields a buyer would type."""
        for term in [word for word in value.split() if word]:
            queryset = queryset.filter(
                Q(title__icontains=term)
                | Q(description__icontains=term)
                | Q(summary__icontains=term)
                | Q(address__icontains=term)
                | Q(city__icontains=term)
                | Q(district__icontains=term)
                | Q(region__icontains=term)
                | Q(reference__icontains=term)
            )
        return queryset

    def filter_amenities(self, queryset, name, value):
        for amenity in [item.strip() for item in value.split(",") if item.strip()]:
            queryset = queryset.filter(amenities__contains=[amenity])
        return queryset
