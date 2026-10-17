from django.contrib import admin

from apps.core.models import Company, EmailCampaign, EmailCampaignRecipient, NewsletterSubscription, Service


class EmailCampaignRecipientInline(admin.TabularInline):
    model = EmailCampaignRecipient
    extra = 0
    can_delete = False
    fields = ("email", "display_name", "source", "status", "attempts", "error", "sent_at")
    readonly_fields = fields
    ordering = ("id",)

    def has_add_permission(self, request, obj=None):
        # The frozen audience comes from queueing, not from typing addresses in here.
        return False


@admin.register(EmailCampaign)
class EmailCampaignAdmin(admin.ModelAdmin):
    """Draft editing and delivery bookkeeping. Nothing here sends mail."""

    list_display = ("name", "status", "recipient_count", "accepted_count",
                    "failed_count", "skipped_count", "created_at")
    list_filter = ("status",)
    search_fields = ("name", "subject")
    ordering = ("-created_at",)
    readonly_fields = (
        "status", "recipient_count", "excluded_count", "accepted_count", "failed_count",
        "skipped_count", "queued_at", "started_at", "completed_at", "created_by",
        "created_at", "updated_at",
    )
    inlines = (EmailCampaignRecipientInline,)
    fieldsets = (
        ("Message", {"fields": ("name", "subject", "body")}),
        ("Audience", {"fields": ("audiences",)}),
        ("Delivery", {"fields": ("status", "queued_at", "started_at", "completed_at",
                                 "created_by")}),
        ("Counts", {"fields": ("recipient_count", "excluded_count", "accepted_count",
                               "failed_count", "skipped_count")}),
        ("Record", {"fields": ("created_at", "updated_at")}),
    )


@admin.register(NewsletterSubscription)
class NewsletterSubscriptionAdmin(admin.ModelAdmin):
    list_display = ("email", "status", "source", "confirmed_at", "created_at")
    list_filter = ("status", "source")
    search_fields = ("email", "first_name", "notes")
    date_hierarchy = "created_at"
    ordering = ("-created_at",)
    readonly_fields = ("created_at", "updated_at", "consent_given_at", "confirmed_at", "unsubscribed_at")
    actions = ("suppress_selected",)
    fieldsets = (
        ("Address", {"fields": ("email", "first_name", "status", "source", "notes")}),
        ("Consent trail", {"fields": ("consent_given_at", "confirmed_at", "unsubscribed_at")}),
        ("Record", {"fields": ("created_at", "updated_at")}),
    )

    # Fieldsets above omit the token hashes, so they never appear on the change form.

    @admin.action(description="Suppress these addresses (no marketing mail)")
    def suppress_selected(self, request, queryset):
        updated = queryset.update(
            status=NewsletterSubscription.Status.SUPPRESSED, notes="Suppressed from Django admin"
        )
        self.message_user(request, f"{updated} address(es) suppressed.")


@admin.register(Service)
class ServiceAdmin(admin.ModelAdmin):
    list_display = ("name", "category", "order", "is_published", "updated_at")
    list_editable = ("order", "is_published")
    search_fields = ("name", "summary", "description")
    prepopulated_fields = {"slug": ("name",)}
    ordering = ("order", "name")
    fieldsets = (
        ("Card", {"fields": ("name", "category", "icon", "summary", "order", "is_published")}),
        ("Page copy", {"fields": ("description", "highlights", "limitations")}),
        ("Artwork", {"fields": ("image", "image_alt")}),
        ("System", {"fields": ("slug",)}),
    )


@admin.register(Company)
class CompanyAdmin(admin.ModelAdmin):
    list_display = ("name", "email", "phone", "city", "currency", "updated_at")
    fieldsets = (
        ("Identity", {"fields": ("name", "legal_name", "tagline", "about", "logo")}),
        ("Contact", {"fields": ("email", "phone", "alt_phone", "phone_3", "address", "city",
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
