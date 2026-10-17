from django.db.models import Count, F
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.generics import CreateAPIView
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from apps.accounts.models import Role
from apps.accounts.permissions import IsAdminOrLandlord, IsAdminRole
from apps.properties.filters import PropertyFilter
from apps.properties.models import Enquiry, Property, PropertyImage
from apps.properties.permissions import IsImageOwnerOrAdmin, IsPropertyOwnerOrAdmin
from apps.properties.serializers import (
    EnquiryCreateSerializer,
    EnquirySerializer,
    ManagePropertySerializer,
    PropertyDetailSerializer,
    PropertyImageSerializer,
    PropertyListSerializer,
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
    """Landlords manage their own listings; administrators manage everything."""

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
        if self.action in ("update", "partial_update", "destroy", "images"):
            return [IsAuthenticated(), IsAdminOrLandlord(), IsPropertyOwnerOrAdmin()]
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
    """Re-order, promote or delete images that already belong to a listing."""

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
        if self.action in ("retrieve", "update", "partial_update", "destroy"):
            return [IsAuthenticated(), IsAdminOrLandlord(), IsImageOwnerOrAdmin()]
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
