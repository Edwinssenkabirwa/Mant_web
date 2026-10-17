import logging

from django.conf import settings
from django.db.models import Count
from django.utils import timezone
from django.utils.decorators import method_decorator
from django.views.decorators.cache import cache_page
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsAdminRole
from apps.core.models import (
    Company,
    EmailCampaign,
    EmailCampaignRecipient,
    NewsletterSubscription,
    Service,
)
from apps.core.serializers import (
    AudienceEstimateSerializer,
    CampaignTestSerializer,
    CompanySerializer,
    EmailCampaignRecipientSerializer,
    EmailCampaignSerializer,
    ManageServiceSerializer,
    NewsletterSubscribeSerializer,
    NewsletterSubscriberSerializer,
    NewsletterTokenSerializer,
    ServiceDetailSerializer,
    ServiceListSerializer,
)
from apps.core.services import campaigns, newsletter
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


class ManageSubscriberViewSet(
    mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    """Administrator view of the mailing list.

    Deliberately missing: create and delete. Consent is only ever given by the person behind an
    address, and a suppression record is kept so an opted-out address cannot be mailed again by
    accident. PUT and DELETE are off the method list for the same reason; only PATCH of ``notes``
    is accepted.
    """

    permission_classes = [IsAuthenticated, IsAdminRole]
    serializer_class = NewsletterSubscriberSerializer
    queryset = NewsletterSubscription.objects.all()
    filterset_fields = ["status", "source"]
    search_fields = ["email", "first_name", "notes"]
    ordering_fields = ["created_at", "email", "status", "confirmed_at", "unsubscribed_at"]
    ordering = ["-created_at"]
    http_method_names = ["get", "patch", "post", "head", "options"]

    @action(detail=True, methods=["post"])
    def suppress(self, request, pk=None):
        """Stop all mail to this address and invalidate any outstanding confirmation link."""
        subscription = self.get_object()
        subscription.status = NewsletterSubscription.Status.SUPPRESSED
        subscription.confirm_token_hash = ""
        subscription.confirm_token_created_at = None
        subscription.unsubscribed_at = timezone.now()
        subscription.save(
            update_fields=[
                "status", "confirm_token_hash", "confirm_token_created_at",
                "unsubscribed_at", "updated_at",
            ]
        )
        return Response(self.get_serializer(subscription).data)

    @action(detail=True, methods=["post"])
    def reactivate(self, request, pk=None):
        """Return an address to pending confirmation and email a fresh link.

        The status never jumps straight to subscribed: a suppressed or bounced address has to
        confirm again, the same as a new sign-up.
        """
        subscription = self.get_object()
        if subscription.status == NewsletterSubscription.Status.SUBSCRIBED:
            return Response(
                {"detail": "This address already receives the newsletter."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        subscription.status = NewsletterSubscription.Status.PENDING_CONFIRMATION
        subscription.consent_given_at = timezone.now()
        subscription.unsubscribed_at = None
        subscription.save(
            update_fields=["status", "consent_given_at", "unsubscribed_at", "updated_at"]
        )

        try:
            newsletter.send_confirmation_email(subscription)
        except Exception:
            logger.exception(
                "Newsletter confirmation email failed for subscription %s", subscription.pk
            )
            return Response(
                {"detail": "The address is pending, but the confirmation email could not be "
                           "sent. Check the mail configuration and try again."},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        subscription.refresh_from_db()
        return Response(self.get_serializer(subscription).data)

    @action(detail=False, methods=["get"], url_path="stats")
    def stats(self, request):
        counts = NewsletterSubscription.objects.values("status").annotate(total=Count("id"))
        return Response({
            "total": NewsletterSubscription.objects.count(),
            "by_status": {row["status"]: row["total"] for row in counts},
        })


class ManageCampaignViewSet(viewsets.ModelViewSet):
    """Draft, preview and queue email campaigns. Sending happens in a management command."""

    permission_classes = [IsAuthenticated, IsAdminRole]
    serializer_class = EmailCampaignSerializer
    queryset = EmailCampaign.objects.select_related("created_by")
    filterset_fields = ["status"]
    search_fields = ["name", "subject"]
    ordering_fields = ["created_at", "queued_at", "completed_at", "status", "name"]
    ordering = ["-created_at"]

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    def perform_destroy(self, instance):
        if not instance.is_editable:
            raise PermissionDenied(
                "Only a draft can be deleted. Cancel a queued campaign instead; mail that has "
                "been handed to the provider cannot be recalled."
            )
        instance.delete()

    @action(detail=False, methods=["post"], url_path="audience-count")
    def audience_count(self, request):
        """Server-side estimate of who an audience selection would reach."""
        serializer = AudienceEstimateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        preview = campaigns.resolve_audiences(serializer.validated_data["audiences"])
        return Response({
            "eligible": preview.eligible,
            "excluded_suppressed": preview.excluded_suppressed,
            "duplicates": preview.duplicates,
            "unknown_audiences": preview.unknown_audiences,
        })

    @action(detail=True, methods=["get"])
    def recipients(self, request, pk=None):
        campaign = self.get_object()
        queryset = campaign.recipients.order_by("id")
        state = request.query_params.get("status")
        if state in EmailCampaignRecipient.Status.values:
            queryset = queryset.filter(status=state)
        page = self.paginate_queryset(queryset)
        return self.get_paginated_response(
            EmailCampaignRecipientSerializer(page, many=True).data
        )

    @action(detail=True, methods=["get"])
    def preview(self, request, pk=None):
        return Response({"html": campaigns.render_preview(self.get_object())})

    @action(detail=True, methods=["post"])
    def test(self, request, pk=None):
        campaign = self.get_object()
        serializer = CampaignTestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        address = serializer.validated_data["email"]
        try:
            campaigns.send_test(campaign, address)
        except Exception:
            logger.exception("Campaign test email failed for campaign %s", campaign.pk)
            return Response(
                {"detail": "The test message could not be handed to the mail server."},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        return Response({
            "detail": f"A test copy was handed to the mail server for {address}. "
                      "That is not proof it arrived in an inbox.",
        })

    @action(detail=True, methods=["post"])
    def queue(self, request, pk=None):
        campaign = self.get_object()
        if campaign.status != EmailCampaign.Status.DRAFT:
            return Response(
                {"detail": "This campaign is already queued, sending or finished."},
                status=status.HTTP_409_CONFLICT,
            )
        preview = campaigns.resolve_audiences(campaign.audiences)
        if not preview.recipients:
            return Response(
                {"detail": "Nobody in the selected audience may be mailed. "
                           "Check the audience and the suppression list."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        campaigns.queue_campaign(campaign)
        campaign.refresh_from_db()
        return Response(self.get_serializer(campaign).data)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        campaign = self.get_object()
        if not campaigns.cancel_campaign(campaign):
            return Response(
                {"detail": "Only a draft or a queued campaign can be cancelled."},
                status=status.HTTP_409_CONFLICT,
            )
        return Response(self.get_serializer(campaign).data)

    @action(detail=False, methods=["get"], url_path="stats")
    def stats(self, request):
        counts = EmailCampaign.objects.values("status").annotate(total=Count("id"))
        backend = ".".join(settings.EMAIL_BACKEND.split(".")[-2:])
        return Response({
            "total": EmailCampaign.objects.count(),
            "by_status": {row["status"]: row["total"] for row in counts},
            "outstanding": EmailCampaign.objects.filter(
                status__in=[EmailCampaign.Status.QUEUED, EmailCampaign.Status.SENDING]
            ).count(),
            # Lets the UI say plainly whether this install can hand mail to a real provider.
            "email_backend": backend,
            "sends_real_mail": backend == "smtp.EmailBackend",
            "from_email": settings.DEFAULT_FROM_EMAIL,
        })
