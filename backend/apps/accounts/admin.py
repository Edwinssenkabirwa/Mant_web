from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from apps.accounts.forms import UserChangeForm, UserCreationForm
from apps.accounts.models import User


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    form = UserChangeForm
    add_form = UserCreationForm
    ordering = ("-date_joined",)
    list_display = ("email", "full_name", "phone", "role", "city", "is_active", "is_verified")
    list_filter = ("role", "is_active", "is_verified", "city")
    search_fields = ("email", "first_name", "last_name", "phone", "organisation", "national_id")
    readonly_fields = ("date_joined", "last_login", "created_at", "updated_at")

    fieldsets = (
        (None, {"fields": ("email", "password")}),
        ("Personal information", {"fields": ("first_name", "last_name", "phone", "avatar")}),
        ("Address & identity", {"fields": ("address", "city", "country", "national_id",
                                           "organisation", "tin_number")}),
        ("Role & access", {"fields": ("role", "is_verified", "is_active", "is_staff",
                                      "is_superuser", "groups", "user_permissions")}),
        ("Timestamps", {"fields": ("last_login", "date_joined", "created_at", "updated_at"),
                        "classes": ("collapse",)}),
    )
    add_fieldsets = (
        (None, {
            "classes": ("wide",),
            "fields": ("email", "first_name", "last_name", "role", "password1", "password2"),
        }),
    )
