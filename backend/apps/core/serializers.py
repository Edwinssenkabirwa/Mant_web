from rest_framework import serializers

from apps.core.models import Company


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
