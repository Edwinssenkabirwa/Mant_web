from django.contrib import admin

from apps.billing.models import Invoice
from apps.leases.models import Lease


class LeaseInvoiceInline(admin.TabularInline):
    model = Invoice
    extra = 0
    fields = ("number", "period_start", "period_end", "due_date", "status", "reminder_count")
    readonly_fields = ("number", "period_start", "period_end", "due_date", "status",
                       "reminder_count")
    can_delete = False
    show_change_link = True

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(Lease)
class LeaseAdmin(admin.ModelAdmin):
    inlines = [LeaseInvoiceInline]
    list_display = ("number", "property", "tenant", "landlord", "start_date", "end_date",
                    "monthly_rent", "status")
    list_filter = ("status", "billing_frequency", "start_date", "end_date")
    search_fields = ("number", "property__title", "property__reference", "tenant__email",
                     "tenant__first_name", "tenant__last_name", "landlord__email")
    autocomplete_fields = ("property", "tenant", "landlord", "created_by")
    readonly_fields = ("number", "created_at", "updated_at")
    date_hierarchy = "start_date"
    fieldsets = (
        ("Parties", {"fields": ("number", "property", "tenant", "landlord", "created_by")}),
        ("Term", {"fields": ("start_date", "end_date", "status")}),
        ("Money", {"fields": ("monthly_rent", "service_charge", "security_deposit",
                              "currency")}),
        ("Billing schedule", {"fields": ("billing_frequency", "due_day_of_month",
                                         "grace_period_days")}),
        ("Late fees", {"fields": ("late_fee_type", "late_fee_flat", "late_fee_percent")}),
        ("Documents", {"fields": ("terms", "notes")}),
    )
