from django.contrib import admin
from django.utils.html import format_html

from apps.billing.models import Invoice, Payment, Receipt, RentReminder
from apps.billing.services import apply_late_fees, refresh_overdue_invoices


@admin.action(description="Apply late fees to selected overdue invoices")
def action_apply_late_fees(modeladmin, request, queryset):
    updated = apply_late_fees(invoices=queryset)
    modeladmin.message_user(
        request, f"Late fees applied to {len(updated)} invoice(s)."
    )


@admin.action(description="Mark selected invoices as overdue")
def action_mark_overdue(modeladmin, request, queryset):
    count = refresh_overdue_invoices(invoices=queryset)
    modeladmin.message_user(request, f"{count} invoice(s) marked overdue.")


@admin.register(Invoice)
class InvoiceAdmin(admin.ModelAdmin):
    list_display = ("number", "tenant", "property", "period_label", "due_date", "total",
                    "amount_paid", "balance", "effective_status")
    list_filter = ("status", "due_date", "currency", "landlord")
    search_fields = ("number", "lease__number", "tenant__email", "tenant__first_name",
                     "tenant__last_name", "property__title", "property__reference")
    autocomplete_fields = ("lease", "property", "tenant", "landlord")
    readonly_fields = ("number", "tax_amount", "total", "amount_paid", "created_at",
                       "updated_at", "reminder_count", "last_reminder_at")
    date_hierarchy = "due_date"
    actions = [action_apply_late_fees, action_mark_overdue]
    fieldsets = (
        ("Document", {"fields": ("number", "lease", "status", "notes")}),
        ("Parties", {"fields": ("property", "tenant", "landlord")}),
        ("Period", {"fields": ("period_start", "period_end", "issue_date", "due_date")}),
        ("Charges", {"fields": ("rent_amount", "service_charge", "utility_charge",
                                 "other_charge", "other_charge_label", "discount",
                                 "tax_percent", "tax_amount", "late_fee", "currency")}),
        ("Totals", {"fields": ("total", "amount_paid")}),
        ("Reminders", {"fields": ("reminder_count", "last_reminder_at")}),
    )

    @admin.display(ordering="status", description="Status now")
    def effective_status(self, obj):
        return obj.effective_status

    def get_queryset(self, request):
        return super().get_queryset(request).select_related("tenant", "property", "lease")


@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    list_display = ("number", "tenant", "invoice", "amount", "method", "paid_on", "status",
                    "receipt_link")
    list_filter = ("status", "method", "paid_on")
    search_fields = ("number", "reference", "payer_name", "invoice__number",
                     "tenant__email", "tenant__first_name", "tenant__last_name")
    autocomplete_fields = ("invoice", "lease", "tenant", "recorded_by", "confirmed_by")
    readonly_fields = ("number", "confirmed_at", "created_at", "updated_at")
    date_hierarchy = "paid_on"
    fieldsets = (
        ("Payment", {"fields": ("number", "invoice", "lease", "tenant", "payer_name")}),
        ("Amount", {"fields": ("amount", "currency", "method", "reference", "paid_on")}),
        ("Review", {"fields": ("status", "notes", "rejection_reason", "recorded_by",
                               "confirmed_by", "confirmed_at")}),
    )

    @admin.display(description="Receipt")
    def receipt_link(self, obj):
        receipt = getattr(obj, "receipt", None)
        if not receipt:
            return "-"
        text = "VOID" if receipt.is_void else receipt.number
        return format_html(
            '<a href="{}">{}</a>',
            f"/django-admin/billing/receipt/{receipt.pk}/change/",
            text,
        )


@admin.register(Receipt)
class ReceiptAdmin(admin.ModelAdmin):
    list_display = ("number", "tenant", "amount", "method", "paid_on", "is_void",
                    "issued_by", "pdf_link")
    list_filter = ("is_void", "method", "paid_on")
    search_fields = ("number", "payment__number", "reference", "tenant__email",
                     "tenant__first_name", "tenant__last_name")
    readonly_fields = ("number", "payment", "lease", "property", "tenant", "amount",
                       "currency", "method", "reference", "paid_on", "issued_by", "pdf",
                       "is_void", "void_reason", "voided_at", "created_at", "updated_at")
    date_hierarchy = "paid_on"

    def has_add_permission(self, request):
        # Receipts are issued by the system when a payment is confirmed.
        return False

    @admin.display(description="PDF")
    def pdf_link(self, obj):
        if not obj.pdf:
            return "not generated"
        return format_html('<a href="{}" target="_blank">Download</a>', obj.pdf.url)


@admin.register(RentReminder)
class RentReminderAdmin(admin.ModelAdmin):
    """Written by the rent desk's reminder actions, never by hand.

    ``status`` stops at what this application can see: a WhatsApp row records that the desk
    opened a chat, not that the tenant received anything.
    """

    list_display = ("invoice", "channel", "status", "phone", "created_by", "opened_at",
                    "created_at")
    list_filter = ("channel", "status", "created_at")
    search_fields = ("invoice__number", "invoice__tenant__first_name",
                     "invoice__tenant__last_name", "invoice__tenant__email", "phone")
    readonly_fields = ("invoice", "channel", "status", "body", "phone", "opened_at",
                       "created_by", "created_at", "updated_at")
    date_hierarchy = "created_at"

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False
