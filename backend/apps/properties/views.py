from django.db.models import Count, F
from rest_framework import mixins, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.generics import CreateAPIView
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from apps.accounts.models import Role
from apps.accounts.permissions import (
    IsAdminOrLandlord,
    IsAdminRole,
    IsLandlordRole,
)
from apps.properties.filters import PropertyFilter
from apps.properties.models import Enquiry, Property, PropertyImage, PropertyRecommendation
from apps.properties.serializers import (
    EnquiryCreateSerializer,
    EnquirySerializer,
    ManagePropertySerializer,
    ManageRecommendationSerializer,
    PropertyDetailSerializer,
    PropertyImageSerializer,
    PropertyListSerializer,
    PropertyRecommendationSerializer,
)
from apps.properties.services import (
    RecommendationError,
    decline_recommendation,
    mark_in_review,
    submit_recommendation,
    verify_recommendation,
)


class PublicPropertyViewSet(viewsets.ReadOnlyModelViewSet):
    """Public catalogue: search, filter and view available property."""

    permission_classes = [AllowAny]
    serializer_class = PropertyListSerializer
    filterset_class = PropertyFilter
    lookup_field = "slug"
    ordering_fields = ["created_at", "price", "bedrooms", "views", "title"]
    ordering = ["-is_featured", "-created_at"]

    def get_queryset(self):
        queryset = (
            Property.objects.published()
            .select_related("owner")
            .prefetch_related("images")
        )
        if "status" not in self.request.query_params:
            queryset = queryset.filter(status=Property.Status.AVAILABLE)
        return queryset

    def get_serializer_class(self):
        if self.action == "retrieve":
            return PropertyDetailSerializer
        return PropertyListSerializer

    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        Property.objects.filter(pk=instance.pk).update(views=F("views") + 1)
        instance.refresh_from_db(fields=["views"])
        serializer = self.get_serializer(instance, context={"request": request})
        return Response(serializer.data)

    @action(detail=False, methods=["get"])
    def featured(self, request):
        queryset = self.filter_queryset(
            Property.objects.featured().select_related("owner").prefetch_related("images")
        )[:6]
        serializer = PropertyListSerializer(queryset, many=True, context={"request": request})
        return Response(serializer.data)

    @action(detail=False, methods=["get"])
    def cities(self, request):
        rows = (
            Property.objects.available()
            .exclude(city="")
            .values("city")
            .annotate(count=Count("id"))
            .order_by("-count")
        )
        return Response([{"city": row["city"], "count": row["count"]} for row in rows])

    @action(detail=False, methods=["get"])
    def stats(self, request):
        available = Property.objects.available()
        return Response({
            "available": available.count(),
            "for_rent": available.filter(listing_type=Property.ListingType.RENT).count(),
            "for_sale": available.filter(listing_type=Property.ListingType.SALE).count(),
            "cities": available.exclude(city="").values("city").distinct().count(),
            "by_type": [
                {
                    "value": choice.value,
                    "label": choice.label,
                    "count": available.filter(property_type=choice.value).count(),
                }
                for choice in Property.PropertyType
            ],
        })


class ManagePropertyViewSet(viewsets.ModelViewSet):
    """Administrator-managed listings. An owner may read the listings registered to his
    account, but only the office writes them — a property reaches the catalogue through the
    recommendation queue, where it is checked and verified first."""

    permission_classes = [IsAuthenticated, IsAdminOrLandlord]
    serializer_class = ManagePropertySerializer
    filterset_class = PropertyFilter
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    ordering_fields = ["created_at", "price", "title", "status", "city"]
    ordering = ["-created_at"]

    def get_queryset(self):
        user = self.request.user
        queryset = Property.objects.select_related("owner").prefetch_related("images")
        if user.role != Role.ADMIN:
            queryset = queryset.filter(owner=user)
        return queryset

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy", "images"):
            return [IsAuthenticated(), IsAdminRole()]
        return super().get_permissions()

    @action(detail=True, methods=["post"], url_path="images",
            parser_classes=[MultiPartParser, FormParser])
    def images(self, request, *args, **kwargs):
        property_obj = self.get_object()
        upload = request.FILES.get("image")
        if upload is None:
            return Response(
                {"detail": "Choose an image file to upload."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            order = int(request.data.get("order") or 0)
        except (TypeError, ValueError):
            order = 0

        def flag(name):
            return str(request.data.get(name, "")).lower() in ("1", "true", "yes")

        image = PropertyImage.objects.create(
            property=property_obj,
            image=upload,
            caption=request.data.get("caption", "") or "",
            alt_text=request.data.get("alt_text", "") or "",
            is_illustrative=flag("is_illustrative"),
            is_primary=flag("is_primary"),
            order=order,
        )
        return Response(
            PropertyImageSerializer(image, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=False, methods=["get"], url_path="stats")
    def stats(self, request):
        queryset = self.get_queryset()
        rows = queryset.values("status").annotate(count=Count("id"))
        by_status = {row["status"]: row["count"] for row in rows}
        return Response({
            "total": queryset.count(),
            "published": queryset.filter(is_published=True).count(),
            "featured": queryset.filter(is_featured=True).count(),
            "by_status": by_status,
            "for_rent": queryset.filter(listing_type=Property.ListingType.RENT).count(),
            "for_sale": queryset.filter(listing_type=Property.ListingType.SALE).count(),
        })


class PropertyImageViewSet(viewsets.ModelViewSet):
    """Re-order, promote or delete images that already belong to a listing — office only.

    An owner sees the pictures on his own listings, but he does not edit them: what is
    published is what the desk verified.
    """

    permission_classes = [IsAuthenticated, IsAdminOrLandlord]
    serializer_class = PropertyImageSerializer
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    http_method_names = ["get", "patch", "put", "delete", "head", "options"]
    ordering = ["-is_primary", "order", "id"]

    def get_queryset(self):
        user = self.request.user
        queryset = PropertyImage.objects.select_related("property", "property__owner")
        if user.role != Role.ADMIN:
            queryset = queryset.filter(property__owner=user)
        return queryset

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [IsAuthenticated(), IsAdminRole()]
        return super().get_permissions()


class EnquiryCreateView(CreateAPIView):
    """Public contact form and per-listing enquiries."""

    permission_classes = [AllowAny]
    serializer_class = EnquiryCreateSerializer
    queryset = Enquiry.objects.all()


class ManageEnquiryViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, IsAdminRole]
    serializer_class = EnquirySerializer
    queryset = Enquiry.objects.select_related("property", "handled_by")
    filterset_fields = ["status"]
    search_fields = ["name", "email", "phone", "subject", "message"]
    ordering_fields = ["created_at", "status"]
    ordering = ["-created_at"]

    def perform_update(self, serializer):
        serializer.save(handled_by=self.request.user)

    @action(detail=False, methods=["get"])
    def stats(self, request):
        rows = Enquiry.objects.values("status").annotate(count=Count("id"))
        counts = {row["status"]: row["count"] for row in rows}
        counts["total"] = Enquiry.objects.count()
        counts["new"] = Enquiry.objects.filter(status=Enquiry.Status.NEW).count()
        return Response(counts)


class LandlordRecommendationViewSet(viewsets.ModelViewSet):
    """An owner's own recommendations.

    He may add as many as he likes and keep correcting them while the desk works, but the
    queue only sees a recommendation once he sends it, and the decision is never his to make.
    """

    permission_classes = [IsAuthenticated, IsLandlordRole]
    serializer_class = PropertyRecommendationSerializer
    filterset_fields = ["status", "listing_kind"]
    ordering = ["-created_at"]
    ordering_fields = ["created_at", "status", "price_expectation"]
    http_method_names = ["get", "post", "patch", "put", "delete", "head", "options"]

    def get_queryset(self):
        return (
            PropertyRecommendation.objects.select_related("recommender", "listing")
            .filter(recommender=self.request.user)
        )

    def perform_create(self, serializer):
        serializer.save(recommender=self.request.user)

    def update(self, request, *args, **kwargs):
        blocked = self._refuse_if_decided()
        if blocked:
            return blocked
        return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        blocked = self._refuse_if_decided()
        if blocked:
            return blocked
        return super().partial_update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        recommendation = self.get_object()
        if recommendation.status != PropertyRecommendation.Status.DRAFT:
            return Response(
                {"detail": "This one is already with the desk, so it stays on the record. "
                            "Message the office if something has changed."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().destroy(request, *args, **kwargs)

    def _refuse_if_decided(self):
        recommendation = self.get_object()
        if not recommendation.is_editable:
            return Response(
                {"detail": "The desk has already decided on this property, so it can no "
                            "longer be edited here."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return None

    @action(detail=True, methods=["post"])
    def submit(self, request, *args, **kwargs):
        """Send the recommendation to the office for due diligence."""
        recommendation = self.get_object()
        try:
            submit_recommendation(recommendation)
        except RecommendationError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(self.get_serializer(recommendation).data)


class VerifyRecommendationSerializer(serializers.Serializer):
    """The desk's own answers for the fields a listing cannot go out without."""

    listing_type = serializers.ChoiceField(choices=Property.ListingType.choices, required=False)
    price = serializers.DecimalField(max_digits=14, decimal_places=2, required=False)
    currency = serializers.CharField(max_length=10, required=False, allow_blank=True)
    note = serializers.CharField(required=False, allow_blank=True)


class DeclineRecommendationSerializer(serializers.Serializer):
    note = serializers.CharField()

    def validate_note(self, value):
        if len(value.strip()) < 5:
            raise serializers.ValidationError(
                "Say briefly why — the owner reads this and can act on it."
            )
        return value.strip()


class ManageRecommendationViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin,
                                  mixins.UpdateModelMixin, mixins.DestroyModelMixin,
                                  viewsets.GenericViewSet):
    """The verification queue: everything owners have sent, for the office to check.

    The desk edits what an owner wrote and decides on it, but does not author recommendations
    on his behalf — that would put words in the owner's mouth.
    """

    permission_classes = [IsAuthenticated, IsAdminRole]
    serializer_class = ManageRecommendationSerializer
    filterset_fields = ["status", "listing_kind", "city", "property_type", "recommender"]
    search_fields = ["title", "description", "address", "city", "district", "plot_reference",
                     "recommender__full_name", "recommender__email"]
    ordering = ["-created_at"]
    ordering_fields = ["created_at", "status", "price_expectation"]

    def get_queryset(self):
        queryset = PropertyRecommendation.objects.select_related(
            "recommender", "listing", "decided_by"
        )
        # An empty draft is the owner's private working copy, so it is left out of the default
        # list. Ask for ?status=DRAFT, or open a row directly, and the desk can still reach it.
        if self.action == "list" and "status" not in self.request.query_params:
            queryset = queryset.exclude(status=PropertyRecommendation.Status.DRAFT)
        return queryset

    @action(detail=True, methods=["post"])
    def review(self, request, *args, **kwargs):
        """Mark that due diligence has started."""
        recommendation = self.get_object()
        try:
            mark_in_review(recommendation)
        except RecommendationError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(self.get_serializer(recommendation).data)

    @action(detail=True, methods=["post"])
    def verify(self, request, *args, **kwargs):
        """Check it, then publish the listing on the owner's account."""
        recommendation = self.get_object()
        form = VerifyRecommendationSerializer(data=request.data)
        form.is_valid(raise_exception=True)
        answers = form.validated_data
        try:
            verify_recommendation(
                recommendation,
                by_user=request.user,
                listing_type=answers.get("listing_type"),
                price=answers.get("price"),
                currency=answers.get("currency") or None,
                note=answers.get("note", ""),
            )
        except RecommendationError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        recommendation.refresh_from_db()
        return Response(self.get_serializer(recommendation).data)

    @action(detail=True, methods=["post"])
    def decline(self, request, *args, **kwargs):
        recommendation = self.get_object()
        form = DeclineRecommendationSerializer(data=request.data)
        form.is_valid(raise_exception=True)
        try:
            decline_recommendation(
                recommendation, by_user=request.user, note=form.validated_data["note"]
            )
        except RecommendationError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(self.get_serializer(recommendation).data)

    @action(detail=False, methods=["get"])
    def stats(self, request):
        rows = PropertyRecommendation.objects.values("status").annotate(count=Count("id"))
        counts = {row["status"]: row["count"] for row in rows}
        counts["total"] = sum(counts.values())
        counts["waiting"] = counts.get("DRAFT", 0) + counts.get("SUBMITTED", 0) + \
            counts.get("IN_REVIEW", 0)
        return Response(counts)
