from decimal import Decimal, InvalidOperation

from rest_framework import serializers

from apps.accounts.models import Role, User
from apps.accounts.serializers import UserBriefSerializer
from apps.core.helpers import absolute_media_url, format_money
from apps.properties.models import Enquiry, Property, PropertyImage

PERIOD_SUFFIX = {
    Property.PricePeriod.MONTHLY: " / month",
    Property.PricePeriod.QUARTERLY: " / quarter",
    Property.PricePeriod.YEARLY: " / year",
    Property.PricePeriod.ONE_OFF: "",
}


class PropertyImageSerializer(serializers.ModelSerializer):
    image_url = serializers.SerializerMethodField()

    class Meta:
        model = PropertyImage
        fields = ["id", "image", "image_url", "caption", "alt_text", "is_primary", "order"]
        read_only_fields = ["id", "image_url"]
        extra_kwargs = {"image": {"write_only": True}}

    def get_image_url(self, obj):
        return absolute_media_url(self.context.get("request"), obj.image)


class PropertyListSerializer(serializers.ModelSerializer):
    """Compact payload for listing cards and search results."""

    cover_image_url = serializers.SerializerMethodField()
    price_display = serializers.SerializerMethodField()
    owner_id = serializers.IntegerField(source="owner.id", read_only=True)
    owner_name = serializers.CharField(source="owner.full_name", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    property_type_display = serializers.CharField(
        source="get_property_type_display", read_only=True
    )
    listing_type_display = serializers.CharField(
        source="get_listing_type_display", read_only=True
    )
    furnishing_display = serializers.CharField(source="get_furnishing_display", read_only=True)
    location = serializers.CharField(source="city_district", read_only=True)
    excerpt = serializers.CharField(source="short_description", read_only=True)

    class Meta:
        model = Property
        fields = [
            "id", "title", "slug", "reference",
            "property_type", "property_type_display",
            "listing_type", "listing_type_display",
            "status", "status_display", "furnishing", "furnishing_display",
            "price", "price_display", "currency", "price_period", "negotiable",
            "service_charge", "security_deposit",
            "bedrooms", "bathrooms", "parking_spaces", "area", "area_unit",
            "address", "city", "district", "location", "excerpt", "amenities",
            "is_featured", "is_published", "views",
            "owner_id", "owner_name", "cover_image_url", "created_at",
        ]

    def get_cover_image_url(self, obj):
        cover = obj.cover_image
        if not cover:
            return None
        return absolute_media_url(self.context.get("request"), cover.image)

    def get_price_display(self, obj):
        suffix = PERIOD_SUFFIX.get(obj.price_period, "")
        label = format_money(obj.price, obj.currency or "UGX")
        return f"{label}{suffix}"


class PropertyDetailSerializer(PropertyListSerializer):
    """Full payload for a property page."""

    images = PropertyImageSerializer(many=True, read_only=True)
    owner = UserBriefSerializer(read_only=True)
    is_available = serializers.BooleanField(read_only=True)

    class Meta(PropertyListSerializer.Meta):
        fields = PropertyListSerializer.Meta.fields + [
            "description", "summary", "year_built", "region", "country",
            "latitude", "longitude", "images", "owner", "is_available", "updated_at",
        ]


class ManagePropertySerializer(serializers.ModelSerializer):
    """Create/update payload for landlords and administrators."""

    owner = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.filter(role__in=[Role.LANDLORD, Role.ADMIN]),
        required=False,
    )
    owner_name = serializers.CharField(source="owner.full_name", read_only=True)
    cover_image_url = serializers.SerializerMethodField()
    images = PropertyImageSerializer(many=True, read_only=True)
    price_display = serializers.SerializerMethodField()

    class Meta:
        model = Property
        fields = [
            "id", "owner", "owner_name", "title", "slug", "reference", "summary",
            "description", "property_type", "listing_type", "status", "furnishing",
            "price", "price_display", "currency", "price_period", "negotiable",
            "service_charge", "security_deposit", "bedrooms", "bathrooms",
            "parking_spaces", "area", "area_unit", "year_built", "amenities",
            "address", "city", "district", "region", "country", "latitude", "longitude",
            "is_published", "is_featured", "views", "images", "cover_image_url",
            "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "slug", "reference", "views", "images", "cover_image_url",
            "price_display", "owner_name", "created_at", "updated_at",
        ]

    def get_cover_image_url(self, obj):
        cover = obj.cover_image
        return absolute_media_url(self.context.get("request"), cover.image) if cover else None

    def get_price_display(self, obj):
        suffix = PERIOD_SUFFIX.get(obj.price_period, "")
        return f"{format_money(obj.price, obj.currency or 'UGX')}{suffix}"

    def validate_title(self, value):
        if len(value.strip()) < 5:
            raise serializers.ValidationError("Give the listing a descriptive title.")
        return value.strip()

    def validate_price(self, value):
        if value is None or Decimal(value) <= 0:
            raise serializers.ValidationError("The price must be greater than zero.")
        return value

    def validate_owner(self, value):
        request = self.context.get("request")
        user = getattr(request, "user", None)
        if user is not None and user.role == Role.LANDLORD and value.pk != user.pk:
            raise serializers.ValidationError(
                "Landlords can only publish listings under their own account."
            )
        if value.role not in (Role.LANDLORD, Role.ADMIN):
            raise serializers.ValidationError(
                "A listing must belong to a landlord or an administrator."
            )
        return value

    def validate_amenities(self, value):
        if value in (None, ""):
            return []
        if isinstance(value, str):
            value = [item.strip() for item in value.split(",") if item.strip()]
        if not isinstance(value, (list, tuple)):
            raise serializers.ValidationError("Amenities must be a list of names.")
        return [str(item) for item in value]

    def validate(self, attrs):
        raw_deposit = attrs.get("security_deposit", getattr(self.instance, "security_deposit", 0))
        try:
            if raw_deposit is not None and Decimal(str(raw_deposit)) < 0:
                raise serializers.ValidationError(
                    {"security_deposit": "The deposit cannot be negative."}
                )
        except InvalidOperation:
            raise serializers.ValidationError(
                {"security_deposit": "Enter a valid amount."}
            )
        return attrs

    def create(self, validated_data):
        request = self.context.get("request")
        if validated_data.get("owner") is None and request is not None:
            validated_data["owner"] = request.user
        return super().create(validated_data)


class EnquiryCreateSerializer(serializers.ModelSerializer):
    """Public contact / property enquiry form."""

    class Meta:
        model = Enquiry
        fields = ["id", "name", "email", "phone", "subject", "message", "property"]
        extra_kwargs = {
            "property": {"required": False, "allow_null": True},
            "subject": {"required": False, "allow_blank": True},
        }

    def validate_message(self, value):
        if len(value.strip()) < 5:
            raise serializers.ValidationError("Please write a short message.")
        return value.strip()

    def create(self, validated_data):
        request = self.context.get("request")
        enquiry = super().create(validated_data)
        if request is not None and not validated_data.get("subject"):
            property_obj = enquiry.property
            enquiry.subject = (
                f"Enquiry about {property_obj.title}" if property_obj else "Website enquiry"
            )
            enquiry.save()
        return enquiry


class EnquirySerializer(serializers.ModelSerializer):
    property_title = serializers.CharField(source="property.title", read_only=True, default="")
    property_slug = serializers.CharField(source="property.slug", read_only=True, default="")
    handled_by_name = serializers.CharField(
        source="handled_by.full_name", read_only=True, default=""
    )
    status_display = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        model = Enquiry
        fields = [
            "id", "name", "email", "phone", "subject", "message", "property",
            "property_title", "property_slug", "status", "status_display",
            "admin_note", "handled_by", "handled_by_name", "created_at",
        ]
        read_only_fields = ["id", "created_at", "handled_by"]
