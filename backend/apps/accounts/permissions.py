from rest_framework.permissions import SAFE_METHODS, BasePermission

from apps.accounts.models import Role


class IsAdminRole(BasePermission):
    message = "Only Mant Bridges administrators can perform this action."

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and user.role == Role.ADMIN)


class IsLandlordRole(BasePermission):
    message = "Only landlords can perform this action."

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and user.role == Role.LANDLORD)


class IsTenantRole(BasePermission):
    message = "Only tenants can perform this action."

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and user.role == Role.TENANT)


class IsAdminOrLandlord(BasePermission):
    message = "Administrators and landlords only."

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and user.role in (Role.ADMIN, Role.LANDLORD))


class IsAdminOrReadOnly(BasePermission):
    """Anyone authenticated may read; only admins may write."""

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated):
            return False
        if request.method in SAFE_METHODS:
            return True
        return user.role == Role.ADMIN
