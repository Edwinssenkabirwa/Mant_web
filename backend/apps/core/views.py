import logging

from django.utils.decorators import method_decorator
from django.views.decorators.cache import cache_page
from rest_framework import status, viewsets
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsAdminRole
from apps.core.models import Company, Service
from apps.core.serializers import (
    CompanySerializer,
    ManageServiceSerializer,
    NewsletterSubscribeSerializer,
    NewsletterTokenSerializer,
    ServiceDetailSerializer,
    ServiceListSerializer,
)
from apps.core.services import newsletter
from apps.core.throttles import NewsletterSubscribeThrottle, NewsletterTokenThrottle

logger = logging.getLogger(__name__)

# Same wording whatever the server-side outcome, so responses cannot confirm or deny
# that a given address already subscribes.
SIGNUP_MESSAGE = (
    "If that address is new to us, a confirmation email is on its way. Open it and click "
    "the link to start receiving the Mant Bridges newsletter."
)


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
            "service_categories": choices(Service, "category"),
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


class PublicServiceViewSet(viewsets.ReadOnlyModelViewSet):
    """Published services for the website. Unpublished work stays invisible here."""

    permission_classes = [AllowAny]
    serializer_class = ServiceListSerializer
    queryset = Service.objects.published()
    lookup_field = "slug"

    def get_serializer_class(self):
        if self.action == "retrieve":
            return ServiceDetailSerializer
        return ServiceListSerializer


class ManageServiceViewSet(viewsets.ModelViewSet):
    """Administrator editing of the services shown on the website."""

    permission_classes = [IsAuthenticated, IsAdminRole]
    serializer_class = ManageServiceSerializer
    queryset = Service.objects.all()
    ordering = ["order", "name"]


class NewsletterSubscribeView(APIView):
    """Public double opt-in sign-up. Answers identically for new and known addresses."""

    permission_classes = [AllowAny]
    throttle_classes = [NewsletterSubscribeThrottle]

    def post(self, request):
        serializer = NewsletterSubscribeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        outcome, subscription = newsletter.subscribe(
            email=data["email"],
            first_name=data.get("first_name", ""),
            source=data.get("source", "website"),
        )
        if outcome == newsletter.PENDING:
            try:
                newsletter.send_confirmation_email(subscription)
            except Exception:
                logger.exception(
                    "Newsletter confirmation email failed for subscription %s", subscription.pk
                )
                return Response(
                    {
                        "detail": "We could not send the confirmation email just now. "
                        "Please try again in a moment."
                    },
                    status=status.HTTP_502_BAD_GATEWAY,
                )
        return Response({"detail": SIGNUP_MESSAGE}, status=status.HTTP_200_OK)


class NewsletterConfirmView(APIView):
    """Activates a pending subscription once its expiring, single-use token checks out."""

    permission_classes = [AllowAny]
    throttle_classes = [NewsletterTokenThrottle]

    def post(self, request):
        serializer = NewsletterTokenSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        state, _ = newsletter.confirm(serializer.validated_data["token"])
        messages = {
            "confirmed": "Your subscription is confirmed. Look out for the Mant Bridges newsletter.",
            "already_confirmed": "This subscription was already confirmed.",
            "expired": "This confirmation link has expired. Please sign up again to get a new one.",
            "invalid": "This confirmation link has already been used or is not valid. Sign up again for a new one.",
        }
        ok = state in ("confirmed", "already_confirmed")
        return Response(
            {"status": state, "detail": messages[state]},
            status=status.HTTP_200_OK if ok else status.HTTP_400_BAD_REQUEST,
        )


class NewsletterUnsubscribeView(APIView):
    """Honours an unsubscribe link with no login required."""

    permission_classes = [AllowAny]
    throttle_classes = [NewsletterTokenThrottle]

    def post(self, request):
        serializer = NewsletterTokenSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        state, _ = newsletter.unsubscribe(serializer.validated_data["token"])
        messages = {
            "unsubscribed": "You have been removed from the Mant Bridges newsletter.",
            "already_unsubscribed": "This address is already off the newsletter list.",
            "invalid": "This unsubscribe link is not valid.",
        }
        ok = state in ("unsubscribed", "already_unsubscribed")
        return Response(
            {"status": state, "detail": messages[state]},
            status=status.HTTP_200_OK if ok else status.HTTP_400_BAD_REQUEST,
        )
