from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from apps.accounts.models import Role, User


class UserBriefSerializer(serializers.ModelSerializer):
    """Compact representation used when a user is nested inside another resource."""

    full_name = serializers.CharField(read_only=True)
    initials = serializers.CharField(read_only=True)

    class Meta:
        model = User
        fields = ["id", "email", "first_name", "last_name", "phone", "role", "full_name", "initials"]


class UserSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(read_only=True)
    initials = serializers.CharField(read_only=True)
    role_display = serializers.CharField(source="get_role_display", read_only=True)
    avatar_url = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id", "email", "first_name", "last_name", "phone", "role", "role_display",
            "avatar", "avatar_url", "address", "city", "country", "national_id",
            "organisation", "tin_number", "is_active", "is_verified", "full_name",
            "initials", "date_joined", "last_login",
        ]
        read_only_fields = ["id", "date_joined", "last_login"]
        extra_kwargs = {
            "email": {"read_only": True},
            "role": {"read_only": True},
            "is_active": {"read_only": True},
            "is_verified": {"read_only": True},
            "avatar": {"write_only": True, "required": False, "allow_null": True},
        }

    def get_avatar_url(self, obj):
        if not obj.avatar:
            return None
        request = self.context.get("request")
        url = obj.avatar.url
        return request.build_absolute_uri(url) if request else url


class ProfileUpdateSerializer(serializers.ModelSerializer):
    """Fields a signed-in user may change about themselves."""

    class Meta:
        model = User
        fields = [
            "first_name", "last_name", "phone", "avatar", "address", "city",
            "country", "national_id", "organisation", "tin_number",
        ]
        extra_kwargs = {"avatar": {"required": False, "allow_null": True}}


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8,
                                     style={"input_type": "password"})
    password_confirm = serializers.CharField(write_only=True, style={"input_type": "password"})

    class Meta:
        model = User
        fields = [
            "id", "email", "first_name", "last_name", "phone", "role", "city",
            "address", "organisation", "password", "password_confirm",
        ]

    def validate_email(self, value):
        value = value.strip().lower()
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError("An account with this email already exists.")
        return value

    def validate_role(self, value):
        if value not in (Role.LANDLORD, Role.TENANT):
            raise serializers.ValidationError(
                "You may register as a landlord or a tenant. Administrator accounts are "
                "created by Mant Bridges staff."
            )
        return value

    def validate(self, attrs):
        confirm = attrs.pop("password_confirm", None)
        if attrs.get("password") != confirm:
            raise serializers.ValidationError(
                {"password_confirm": "The two passwords do not match."}
            )
        validate_password(attrs["password"])
        return attrs

    def create(self, validated_data):
        password = validated_data.pop("password")
        return User.objects.create_user(password=password, **validated_data)


class AdminUserSerializer(serializers.ModelSerializer):
    """Used by administrators to create and manage any account."""

    password = serializers.CharField(write_only=True, required=False, allow_blank=True,
                                     style={"input_type": "password"})
    full_name = serializers.CharField(read_only=True)
    role_display = serializers.CharField(source="get_role_display", read_only=True)

    class Meta:
        model = User
        fields = [
            "id", "email", "first_name", "last_name", "phone", "role", "role_display",
            "full_name", "address", "city", "country", "national_id", "organisation",
            "tin_number", "is_active", "is_verified", "password", "date_joined", "last_login",
        ]
        read_only_fields = ["id", "date_joined", "last_login"]

    def validate_email(self, value):
        value = value.strip().lower()
        queryset = User.objects.filter(email=value)
        if self.instance:
            queryset = queryset.exclude(pk=self.instance.pk)
        if queryset.exists():
            raise serializers.ValidationError("An account with this email already exists.")
        return value

    def validate_password(self, value):
        if value:
            validate_password(value)
        return value

    def validate(self, attrs):
        if self.instance is None and not attrs.get("password"):
            raise serializers.ValidationError(
                {"password": "A password is required when creating an account."}
            )
        return attrs

    def create(self, validated_data):
        password = validated_data.pop("password", None)
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        return user

    def update(self, instance, validated_data):
        password = validated_data.pop("password", None)
        for field, value in validated_data.items():
            setattr(instance, field, value)
        if password:
            instance.set_password(password)
        instance.save()
        return instance


class MantTokenObtainPairSerializer(TokenObtainPairSerializer):
    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token["email"] = user.email
        token["role"] = user.role
        token["full_name"] = user.full_name
        return token

    def validate(self, attrs):
        data = super().validate(attrs)
        data["user"] = UserSerializer(self.user, context=self.context).data
        return data


class ChangePasswordSerializer(serializers.Serializer):
    old_password = serializers.CharField(write_only=True, style={"input_type": "password"})
    new_password = serializers.CharField(write_only=True, min_length=8,
                                         style={"input_type": "password"})
    new_password_confirm = serializers.CharField(write_only=True,
                                                 style={"input_type": "password"})

    def validate_old_password(self, value):
        user = self.context["request"].user
        if not user.check_password(value):
            raise serializers.ValidationError("Your current password is incorrect.")
        return value

    def validate(self, attrs):
        if attrs["new_password"] != attrs["new_password_confirm"]:
            raise serializers.ValidationError(
                {"new_password_confirm": "The two new passwords do not match."}
            )
        validate_password(attrs["new_password"], self.context["request"].user)
        if attrs["new_password"] == attrs["old_password"]:
            raise serializers.ValidationError(
                {"new_password": "The new password must be different from the current one."}
            )
        return attrs

    def save(self, **kwargs):
        user = self.context["request"].user
        user.set_password(self.validated_data["new_password"])
        user.save()
        return user
