from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.utils import timezone

from apps.accounts.forms import UserChangeForm, UserCreationForm
from apps.accounts.models import User


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    form = UserChangeForm
    add_form = UserCreationForm
    ordering = ("-date_joined",)
    list_display = ("email", "full_name", "phone", "role", "city", "is_active", "is_verified",
                    "marketing_opt_in")
    list_filter = ("role", "is_active", "is_verified", "marketing_opt_in", "city")
    search_fields = ("email", "first_name", "last_name", "phone", "organisation", "national_id")
    readonly_fields = ("date_joined", "last_login", "created_at", "updated_at",
                       "marketing_opt_in_at")

    fieldsets = (
        (None, {"fields": ("email", "password")}),
        ("Personal information", {"fields": ("first_name", "last_name", "phone", "avatar")}),
        ("Address & identity", {"fields": ("address", "city", "country", "national_id",
                                           "organisation", "tin_number")}),
        ("Role & access", {"fields": ("role", "is_verified", "is_active", "is_staff",
                                      "is_superuser", "groups", "user_permissions")}),
        # Campaign audiences read marketing_opt_in, so it needs a home somewhere. Ticking the
        # box is only honest when the person asked for mail; note where that came from.
        ("Marketing consent", {"fields": ("marketing_opt_in", "marketing_opt_in_at")}),
        ("Timestamps", {"fields": ("last_login", "date_joined", "created_at", "updated_at"),
                        "classes": ("collapse",)}),
    )
    add_fieldsets = (
        (None, {
            "classes": ("wide",),
            "fields": ("email", "first_name", "last_name", "role", "password1", "password2"),
        }),
    )

    def save_model(self, request, obj, form, change):
        if "marketing_opt_in" in form.changed_data:
            obj.marketing_opt_in_at = timezone.now() if obj.marketing_opt_in else None
        super().save_model(request, obj, form, change)
