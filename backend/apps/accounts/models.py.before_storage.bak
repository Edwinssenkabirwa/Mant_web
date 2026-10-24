from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models
from django.utils import timezone

from apps.core.models import TimeStampedModel


class Role(models.TextChoices):
    ADMIN = "ADMIN", "Administrator"
    LANDLORD = "LANDLORD", "Landlord"
    TENANT = "TENANT", "Tenant"


class UserManager(BaseUserManager):
    """Email-address based user manager; there is no username field."""

    use_in_migrations = True

    def _create_user(self, email, password, **extra_fields):
        if not email:
            raise ValueError("An email address is required to create a user.")
        user = self.model(email=self.normalize_email(email).lower(), **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_user(self, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", False)
        extra_fields.setdefault("is_superuser", False)
        extra_fields.setdefault("role", Role.TENANT)
        return self._create_user(email, password, **extra_fields)

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        extra_fields.setdefault("role", Role.ADMIN)
        extra_fields.setdefault("first_name", "System")
        extra_fields.setdefault("last_name", "Administrator")

        if extra_fields.get("is_staff") is not True:
            raise ValueError("Superuser must have is_staff=True.")
        if extra_fields.get("is_superuser") is not True:
            raise ValueError("Superuser must have is_superuser=True.")
        return self._create_user(email, password, **extra_fields)


class User(AbstractBaseUser, PermissionsMixin, TimeStampedModel):
    email = models.EmailField(unique=True, db_index=True)
    first_name = models.CharField(max_length=80)
    last_name = models.CharField(max_length=80)
    phone = models.CharField(max_length=40, blank=True, default="")
    role = models.CharField(max_length=12, choices=Role.choices, default=Role.TENANT, db_index=True)
    avatar = models.ImageField(upload_to="avatars/%Y/%m/", blank=True, null=True)

    address = models.CharField(max_length=255, blank=True, default="")
    city = models.CharField(max_length=120, blank=True, default="")
    country = models.CharField(max_length=120, blank=True, default="Uganda")
    national_id = models.CharField(max_length=60, blank=True, default="")
    organisation = models.CharField(
        max_length=150, blank=True, default="",
        help_text="Company or estate name, mainly used by landlords.",
    )
    tin_number = models.CharField(max_length=60, blank=True, default="")

    # Kept separate from having an account: a campaign audience may never include someone
    # merely because their address is in the database.
    marketing_opt_in = models.BooleanField(default=False, db_index=True)
    marketing_opt_in_at = models.DateTimeField(null=True, blank=True)

    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    is_verified = models.BooleanField(default=False)
    date_joined = models.DateTimeField(default=timezone.now)

    objects = UserManager()

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["first_name", "last_name"]

    class Meta:
        ordering = ("-date_joined",)
        indexes = [models.Index(fields=["role", "is_active"])]
        verbose_name = "User"
        verbose_name_plural = "Users"

    def save(self, *args, **kwargs):
        if self.email:
            self.email = self.email.strip().lower()
        if self.role == Role.ADMIN:
            # Administrators always need Django admin access.
            self.is_staff = True
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.full_name} ({self.get_role_display()})"

    @property
    def full_name(self):
        name = f"{self.first_name} {self.last_name}".strip()
        return name or self.email

    @property
    def short_name(self):
        return self.first_name or self.email.split("@")[0]

    @property
    def initials(self):
        first = (self.first_name or self.email[:1]).strip()[:1]
        last = (self.last_name or "").strip()[:1]
        return (first + last).upper()

    @property
    def is_admin(self):
        return self.role == Role.ADMIN

    @property
    def is_landlord(self):
        return self.role == Role.LANDLORD

    @property
    def is_tenant(self):
        return self.role == Role.TENANT
