from django.contrib import admin

from apps.properties.models import Enquiry, Property, PropertyImage, PropertyRecommendation


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


@admin.register(PropertyRecommendation)
class PropertyRecommendationAdmin(admin.ModelAdmin):
    list_display = ("title", "recommender", "listing_kind", "city", "price_expectation",
                    "status", "submitted_at", "listing", "created_at")
    list_filter = ("status", "listing_kind", "city", "property_type")
    search_fields = ("title", "description", "address", "city", "district", "plot_reference",
                     "recommender__full_name", "recommender__email")
    readonly_fields = ("recommender", "status", "submitted_at", "decided_at", "decided_by",
                       "listing", "created_at", "updated_at")
    autocomplete_fields = ("recommender",)
    date_hierarchy = "created_at"
    fieldsets = (
        ("From the owner", {"fields": ("recommender", "status", "submitted_at", "admin_note")}),
        ("The property", {"fields": ("title", "description", "listing_kind", "property_type",
                                     "bedrooms", "bathrooms", "parking_spaces", "area",
                                     "area_unit")}),
        ("Money", {"fields": ("price_expectation", "price_period", "currency")}),
        ("Where it is", {"fields": ("address", "city", "district", "plot_reference")}),
        ("Owner's side of it", {"fields": ("ownership", "occupancy", "paperwork",
                                           "paperwork_note", "inspection_contact")}),
        ("Outcome", {"fields": ("decided_at", "decided_by", "listing")}),
    )

    def has_add_permission(self, request):
        # Recommendations start from an owner's portal or an account signup, never from the office.
        return False
