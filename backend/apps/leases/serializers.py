from rest_framework import serializers

from apps.accounts.models import Role, User
from apps.accounts.serializers import UserBriefSerializer
from apps.billing.services import generate_invoices_for_lease
from apps.core.helpers import absolute_media_url, format_money
from apps.leases.models import Lease
from apps.properties.models import Property


class LeasePropertySerializer(serializers.ModelSerializer):
    cover_image_url = serializers.SerializerMethodField()

    class Meta:
        model = Property
        fields = ["id", "title", "slug", "reference", "address", "city", "district",
                  "price", "currency", "cover_image_url"]

    def get_cover_image_url(self, obj):
        cover = obj.cover_image
        return absolute_media_url(self.context.get("request"), cover.image) if cover else None


class LeaseSerializer(serializers.ModelSerializer):
    """Read/write serializer for tenancies."""

    property_detail = LeasePropertySerializer(source="property", read_only=True)
    tenant_detail = UserBriefSerializer(source="tenant", read_only=True)
    landlord_detail = UserBriefSerializer(source="landlord", read_only=True)
    tenant_name = serializers.CharField(source="tenant.full_name", read_only=True)
    landlord_name = serializers.CharField(source="landlord.full_name", read_only=True)
    property_title = serializers.CharField(source="property.title", read_only=True)
    property_slug = serializers.CharField(source="property.slug", read_only=True, default="")

    status_display = serializers.CharField(source="get_status_display", read_only=True)
    frequency_display = serializers.CharField(
        source="get_billing_frequency_display", read_only=True
    )
    late_fee_display = serializers.CharField(source="get_late_fee_type_display", read_only=True)

    term_months = serializers.IntegerField(read_only=True)
    days_remaining = serializers.IntegerField(read_only=True)
    is_current = serializers.BooleanField(read_only=True)
    total_invoiced = serializers.DecimalField(max_digits=16, decimal_places=2, read_only=True)
    total_collected = serializers.DecimalField(max_digits=16, decimal_places=2, read_only=True)
    outstanding_balance = serializers.DecimalField(max_digits=16, decimal_places=2,
                                                   read_only=True)
    monthly_rent_display = serializers.SerializerMethodField()

    class Meta:
        model = Lease
        fields = [
            "id", "number", "property", "property_detail", "property_title", "property_slug",
            "tenant", "tenant_detail", "tenant_name",
            "landlord", "landlord_detail", "landlord_name",
            "start_date", "end_date", "monthly_rent", "monthly_rent_display",
            "service_charge", "security_deposit", "currency",
            "billing_frequency", "frequency_display", "due_day_of_month",
            "grace_period_days", "late_fee_type", "late_fee_display",
            "late_fee_flat", "late_fee_percent",
            "status", "status_display", "terms", "notes",
            "term_months", "days_remaining", "is_current",
            "total_invoiced", "total_collected", "outstanding_balance",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "number", "created_at", "updated_at"]
        extra_kwargs = {
            "landlord": {"required": False},
            "terms": {"required": False, "allow_blank": True},
            "notes": {"required": False, "allow_blank": True},
        }

    def get_monthly_rent_display(self, obj):
        return format_money(obj.monthly_rent, obj.currency)

    # --- validation ---------------------------------------------------
    def validate_property(self, value):
        user = self._current_user()
        if user is not None and user.role == Role.LANDLORD and value.owner_id != user.pk:
            raise serializers.ValidationError(
                "You can only create tenancies for property you own."
            )
        return value

    def validate_tenant(self, value):
        if value.role != Role.TENANT:
            raise serializers.ValidationError(
                "The selected user is not registered as a tenant."
            )
        return value

    def validate_landlord(self, value):
        if value.role not in (Role.LANDLORD, Role.ADMIN):
            raise serializers.ValidationError(
                "The landlord must be a landlord or administrator account."
            )
        user = self._current_user()
        if user is not None and user.role == Role.LANDLORD and value.pk != user.pk:
            raise serializers.ValidationError(
                "You cannot assign a tenancy to another landlord."
            )
        return value

    def validate(self, attrs):
        start = attrs.get("start_date", getattr(self.instance, "start_date", None))
        end = attrs.get("end_date", getattr(self.instance, "end_date", None))
        rent = attrs.get("monthly_rent", getattr(self.instance, "monthly_rent", None))
        if start and end and end <= start:
            raise serializers.ValidationError(
                {"end_date": "The end date must be after the start date."}
            )
        if rent is not None and rent <= 0:
            raise serializers.ValidationError(
                {"monthly_rent": "Monthly rent must be greater than zero."}
            )
        return attrs

    def _current_user(self):
        request = self.context.get("request")
        return getattr(request, "user", None)

    def create(self, validated_data):
        user = self._current_user()
        if validated_data.get("landlord") is None:
            validated_data["landlord"] = validated_data["property"].owner
        if user is not None:
            validated_data["created_by"] = user
        if not validated_data.get("currency"):
            validated_data["currency"] = validated_data["property"].currency
        lease = super().create(validated_data)
        if lease.status == Lease.Status.ACTIVE:
            generate_invoices_for_lease(lease)
        return lease

    def update(self, instance, validated_data):
        lease = super().update(instance, validated_data)
        if lease.status == Lease.Status.ACTIVE:
            generate_invoices_for_lease(lease)
        return lease


class LeaseOptionSerializer(serializers.ModelSerializer):
    """Lightweight rows for dropdowns and pickers."""

    label = serializers.SerializerMethodField()
    tenant_name = serializers.CharField(source="tenant.full_name", read_only=True)
    property_title = serializers.CharField(source="property.title", read_only=True)

    class Meta:
        model = Lease
        fields = ["id", "number", "label", "tenant", "tenant_name", "property",
                  "property_title", "monthly_rent", "currency", "status", "end_date"]

    def get_label(self, obj):
        return f"{obj.number} - {obj.property.title} ({obj.tenant.full_name})"
