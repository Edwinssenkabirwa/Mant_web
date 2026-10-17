from rest_framework import serializers

from apps.core.helpers import absolute_media_url
from apps.core.models import Company, Service


class CompanySerializer(serializers.ModelSerializer):
    logo_url = serializers.SerializerMethodField()

    class Meta:
        model = Company
        fields = [
            "id", "name", "legal_name", "tagline", "about", "email", "phone", "alt_phone",
            "address", "city", "country", "website", "logo", "logo_url",
            "facebook", "twitter", "instagram", "linkedin",
            "currency", "currency_symbol",
            "invoice_prefix", "receipt_prefix", "lease_prefix", "payment_prefix",
            "grace_period_days", "late_fee_type", "late_fee_flat", "late_fee_percent",
            "bank_name", "bank_account_name", "bank_account_number", "bank_branch",
            "mobile_money_number", "payment_instructions",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]
        extra_kwargs = {"logo": {"write_only": True, "required": False, "allow_null": True}}

    def get_logo_url(self, obj):
        if not obj.logo:
            return None
        request = self.context.get("request")
        url = obj.logo.url
        return request.build_absolute_uri(url) if request else url


class ServiceListSerializer(serializers.ModelSerializer):
    """Card payload for the public homepage and services listing."""

    image_url = serializers.SerializerMethodField()
    summary_text = serializers.CharField(source="short_summary", read_only=True)
    category_display = serializers.CharField(source="get_category_display", read_only=True)

    class Meta:
        model = Service
        fields = [
            "id", "name", "slug", "category", "category_display", "summary_text",
            "highlights", "limitations", "image_url", "image_alt", "order",
        ]

    def get_image_url(self, obj):
        return absolute_media_url(self.context.get("request"), obj.image)


class ServiceDetailSerializer(ServiceListSerializer):
    paragraphs = serializers.ListField(child=serializers.CharField(), read_only=True)

    class Meta(ServiceListSerializer.Meta):
        fields = ServiceListSerializer.Meta.fields + [
            "summary", "description", "paragraphs", "updated_at",
        ]


class ManageServiceSerializer(serializers.ModelSerializer):
    """Administrator create/update payload, including the image upload."""

    image_url = serializers.SerializerMethodField()
    category_display = serializers.CharField(source="get_category_display", read_only=True)
    paragraphs = serializers.ListField(child=serializers.CharField(), read_only=True)
    summary_text = serializers.CharField(source="short_summary", read_only=True)

    class Meta:
        model = Service
        fields = [
            "id", "name", "slug", "category", "category_display", "summary",
            "description", "paragraphs", "summary_text", "highlights", "limitations",
            "image", "image_url", "image_alt", "order", "is_published",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "slug", "image_url", "category_display", "paragraphs",
                            "summary_text", "created_at", "updated_at"]
        extra_kwargs = {"image": {"write_only": True, "required": False, "allow_null": True}}

    def get_image_url(self, obj):
        return absolute_media_url(self.context.get("request"), obj.image)

    def validate_name(self, value):
        if len(value.strip()) < 3:
            raise serializers.ValidationError("Give the service a name.")
        return value.strip()

    def validate_highlights(self, value):
        if value in (None, ""):
            return []
        if isinstance(value, str):
            value = [item.strip() for item in value.split("\n") if item.strip()]
        if not isinstance(value, (list, tuple)):
            raise serializers.ValidationError("Highlights must be a list of points.")
        return [str(item) for item in value][:20]


class NewsletterSubscribeSerializer(serializers.Serializer):
    """Public sign-up form. Status and suppression fields are never accepted from here."""

    email = serializers.EmailField(max_length=254)
    first_name = serializers.CharField(max_length=120, required=False, allow_blank=True, default="")
    consent = serializers.BooleanField()
    source = serializers.CharField(max_length=60, required=False, allow_blank=True, default="website")

    def validate_email(self, value):
        return value.strip().lower()

    def validate_first_name(self, value):
        return (value or "").strip()

    def validate_source(self, value):
        return (value or "").strip() or "website"

    def validate_consent(self, value):
        if not value:
            raise serializers.ValidationError(
                "Please confirm that you agree to receive the Mant Bridges newsletter."
            )
        return value


class NewsletterTokenSerializer(serializers.Serializer):
    """Confirmation and unsubscribe links both carry one opaque token."""

    token = serializers.CharField(max_length=256)

    def validate_token(self, value):
        cleaned = value.strip()
        if not cleaned:
            raise serializers.ValidationError("This link is missing its token.")
        return cleaned
