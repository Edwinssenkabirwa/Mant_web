from django.db.models import Count, Q
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.generics import CreateAPIView
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView

from apps.accounts.models import Role, User
from apps.accounts.permissions import IsAdminRole
from apps.accounts.serializers import (
    AdminUserSerializer,
    ChangePasswordSerializer,
    MantTokenObtainPairSerializer,
    ProfileUpdateSerializer,
    RegisterSerializer,
    UserSerializer,
)


def tokens_for(user):
    refresh = RefreshToken.for_user(user)
    refresh["email"] = user.email
    refresh["role"] = user.role
    refresh["full_name"] = user.full_name
    return {"access": str(refresh.access_token), "refresh": str(refresh)}


def user_payload(user, request):
    return UserSerializer(user, context={"request": request}).data


class RegisterView(CreateAPIView):
    """Public self-registration for landlords and tenants."""

    permission_classes = [AllowAny]
    serializer_class = RegisterSerializer
    queryset = User.objects.all()

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        payload = {"user": user_payload(user, request)}
        payload.update(tokens_for(user))
        return Response(payload, status=status.HTTP_201_CREATED)


class LoginView(TokenObtainPairView):
    serializer_class = MantTokenObtainPairSerializer


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(user_payload(request.user, request))

    def put(self, request):
        return self._update(request, partial=False)

    def patch(self, request):
        return self._update(request, partial=True)

    def _update(self, request, partial):
        serializer = ProfileUpdateSerializer(
            request.user, data=request.data, partial=partial, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(user_payload(request.user, request))


class ChangePasswordView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(
            {"detail": "Your password has been changed."}, status=status.HTTP_200_OK
        )


class UserViewSet(viewsets.ModelViewSet):
    """Administrator management of every account on the platform."""

    permission_classes = [IsAuthenticated, IsAdminRole]
    serializer_class = AdminUserSerializer
    queryset = User.objects.all()
    filterset_fields = ["role", "is_active", "is_verified", "city"]
    search_fields = ["email", "first_name", "last_name", "phone", "organisation", "national_id"]
    ordering_fields = ["date_joined", "first_name", "last_name", "role", "email"]
    ordering = ["-date_joined"]

    def _guard_last_admin(self, instance, new_role, new_active):
        if instance.role != Role.ADMIN:
            return
        if new_role == Role.ADMIN and new_active:
            return
        remaining = (
            User.objects.filter(role=Role.ADMIN, is_active=True).exclude(pk=instance.pk).count()
        )
        if remaining == 0:
            raise PermissionDenied("At least one active administrator must remain.")

    def perform_update(self, serializer):
        instance = serializer.instance
        data = serializer.validated_data
        self._guard_last_admin(
            instance,
            data.get("role", instance.role),
            data.get("is_active", instance.is_active),
        )
        if instance.pk == self.request.user.pk and data.get("is_active") is False:
            raise PermissionDenied("You cannot deactivate your own account.")
        serializer.save()

    def perform_destroy(self, instance):
        if instance.pk == self.request.user.pk:
            raise PermissionDenied("You cannot delete your own account.")
        self._guard_last_admin(instance, None, False)
        instance.delete()

    @action(detail=False, methods=["get"])
    def stats(self, request):
        counts = User.objects.aggregate(
            total=Count("id"),
            admins=Count("id", filter=Q(role=Role.ADMIN)),
            landlords=Count("id", filter=Q(role=Role.LANDLORD)),
            tenants=Count("id", filter=Q(role=Role.TENANT)),
            active=Count("id", filter=Q(is_active=True)),
            inactive=Count("id", filter=Q(is_active=False)),
        )
        return Response(counts)
