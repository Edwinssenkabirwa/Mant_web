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


class IsAdminOrTenant(BasePermission):
    """The rent book — invoices, payments, receipts, leases and statements — is read by the office
    and by the tenant it concerns. A landlord's own view of his money is served from /api/landlord/,
    which reports totals and trends without exposing another person's documents or details."""

    message = "These records belong to the Mant Bridges office and the tenant they were issued to."

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and user.role in (Role.ADMIN, Role.TENANT))


class IsAdminOrReadOnly(BasePermission):
    """Anyone authenticated may read; only admins may write."""

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated):
            return False
        if request.method in SAFE_METHODS:
            return True
        return user.role == Role.ADMIN
