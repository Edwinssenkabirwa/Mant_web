from rest_framework.permissions import BasePermission

from apps.accounts.models import Role


class IsPropertyOwnerOrAdmin(BasePermission):
    """Landlords may only manage their own listings; administrators manage all."""

    message = "You do not have permission to manage this listing."

    def has_object_permission(self, request, view, obj):
        user = request.user
        if not (user and user.is_authenticated):
            return False
        return user.role == Role.ADMIN or obj.owner_id == user.pk


class IsImageOwnerOrAdmin(BasePermission):
    message = "You do not have permission to manage this image."

    def has_object_permission(self, request, view, obj):
        user = request.user
        if not (user and user.is_authenticated):
            return False
        return user.role == Role.ADMIN or obj.property.owner_id == user.pk
