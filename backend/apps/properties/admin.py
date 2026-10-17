from django.contrib import admin

from apps.properties.models import Enquiry, Property, PropertyImage


class PropertyImageInline(admin.TabularInline):
    model = PropertyImage
    extra = 1
    fields = ("image", "caption", "alt_text", "is_illustrative", "is_primary", "order")


@admin.register(Property)
class PropertyAdmin(admin.ModelAdmin):
    inlines = [PropertyImageInline]
    list_display = ("title", "reference", "owner", "city", "property_type", "listing_type",
                    "price", "status", "is_published", "is_featured", "created_at")
    list_filter = ("status", "listing_type", "property_type", "is_published", "is_featured", "city")
    search_fields = ("title", "reference", "description", "address", "city", "district")
    prepopulated_fields = {"slug": ("title",)}
    autocomplete_fields = ("owner",)
    readonly_fields = ("reference", "views", "created_at", "updated_at")
    date_hierarchy = "created_at"
    list_editable = ("status", "is_published", "is_featured")
    fieldsets = (
        ("Listing", {"fields": ("owner", "title", "slug", "reference", "summary", "description")}),
        ("Classification", {"fields": ("property_type", "listing_type", "status", "furnishing")}),
        ("Pricing", {"fields": ("price", "currency", "price_period", "negotiable",
                                 "service_charge", "security_deposit")}),
        ("Specifications", {"fields": ("bedrooms", "bathrooms", "parking_spaces", "area",
                                       "area_unit", "year_built", "amenities")}),
        ("Location", {"fields": ("address", "city", "district", "region", "country",
                                 "latitude", "longitude")}),
        ("Visibility", {"fields": ("is_published", "is_featured", "views")}),
    )


@admin.register(Enquiry)
class EnquiryAdmin(admin.ModelAdmin):
    list_display = ("name", "email", "subject", "property", "status", "handled_by", "created_at")
    list_filter = ("status", "created_at")
    search_fields = ("name", "email", "phone", "subject", "message")
    readonly_fields = ("created_at", "updated_at")
    date_hierarchy = "created_at"
