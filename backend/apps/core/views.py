from django.utils.decorators import method_decorator
from django.views.decorators.cache import cache_page
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsAdminRole
from apps.core.models import Company
from apps.core.serializers import CompanySerializer


class CompanyAPIView(APIView):
    """Public read access to branding and payment instructions; admins may edit."""

    def get_permissions(self):
        if self.request.method in ("PUT", "PATCH"):
            return [IsAuthenticated(), IsAdminRole()]
        return [AllowAny()]

    def get(self, request):
        company = Company.load()
        return Response(CompanySerializer(company, context={"request": request}).data)

    def put(self, request):
        return self._update(request)

    def patch(self, request):
        return self._update(request, partial=True)

    def _update(self, request, partial=False):
        company = Company.load()
        serializer = CompanySerializer(
            company, data=request.data, partial=partial, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


@method_decorator(cache_page(60 * 5), name="dispatch")
class LookupsAPIView(APIView):
    """Dropdown and filter vocabularies, so the frontend never hardcodes them."""

    permission_classes = [AllowAny]

    def get(self, request):
        from apps.accounts.models import User
        from apps.billing.models import Invoice, Payment
        from apps.blog.models import Category
        from apps.leases.models import Lease
        from apps.properties.models import AMENITIES, Property

        def choices(model, field):
            return [
                {"value": value, "label": label}
                for value, label in model._meta.get_field(field).flatchoices
            ]

        cities = (
            Property.objects.filter(is_published=True)
            .exclude(city="")
            .values_list("city", flat=True)
            # Property._meta.ordering would pull created_at into DISTINCT and repeat cities.
            .order_by()
            .distinct()
        )

        return Response({
            "property_types": choices(Property, "property_type"),
            "listing_types": choices(Property, "listing_type"),
            "property_statuses": choices(Property, "status"),
            "amenities": AMENITIES,
            "cities": sorted(cities),
            "payment_methods": choices(Payment, "method"),
            "payment_statuses": choices(Payment, "status"),
            "invoice_statuses": choices(Invoice, "status"),
            "lease_statuses": choices(Lease, "status"),
            "late_fee_types": choices(Company, "late_fee_type"),
            "roles": choices(User, "role"),
            "blog_categories": list(
                Category.objects.values("id", "name", "slug").order_by("name")
            ),
            "currency": Company.load().currency,
            "currency_symbol": Company.load().currency_symbol,
        })


class HealthAPIView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        return Response({"status": "ok", "service": "mant-bridges-api"}, status=status.HTTP_200_OK)
