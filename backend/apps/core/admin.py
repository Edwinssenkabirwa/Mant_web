from django.contrib import admin

from apps.core.models import Company


@admin.register(Company)
class CompanyAdmin(admin.ModelAdmin):
    list_display = ("name", "email", "phone", "city", "currency", "updated_at")
    fieldsets = (
        ("Identity", {"fields": ("name", "legal_name", "tagline", "about", "logo")}),
        ("Contact", {"fields": ("email", "phone", "alt_phone", "address", "city",
                                 "country", "website")}),
        ("Social", {"fields": ("facebook", "twitter", "instagram", "linkedin")}),
        ("Money & documents", {"fields": ("currency", "currency_symbol", "invoice_prefix",
                                          "receipt_prefix", "lease_prefix", "payment_prefix")}),
        ("Late fee policy", {"fields": ("grace_period_days", "late_fee_type",
                                        "late_fee_flat", "late_fee_percent")}),
        ("Payment channels", {"fields": ("bank_name", "bank_account_name",
                                         "bank_account_number", "bank_branch",
                                         "mobile_money_number", "payment_instructions")}),
    )

    def has_add_permission(self, request):
        # Single-row profile: created on demand by Company.load().
        return not Company.objects.exists()

    def has_delete_permission(self, request, obj=None):
        return False
