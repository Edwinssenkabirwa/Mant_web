from django.conf import settings
from django.db import models
from django.urls import reverse

from apps.core.helpers import unique_slug
from apps.core.models import TimeStampedModel

AMENITIES = [
    "Air Conditioning",
    "Balcony",
    "Backup Generator",
    "Borehole Water",
    "CCTV Security",
    "Carpeted Floors",
    "En-suite Bathroom",
    "Fitted Kitchen",
    "Furnished",
    "Garden",
    "Gated Compound",
    "Gym",
    "Hot Water",
    "Internet / WiFi",
    "Lift / Elevator",
    "Parking",
    "Perimeter Wall",
    "Swimming Pool",
    "Tiled Floors",
    "Water Tank",
    "Wheelchair Access",
]


class PropertyQuerySet(models.QuerySet):
    def published(self):
        return self.filter(is_published=True)

    def available(self):
        return self.published().filter(status=Property.Status.AVAILABLE)

    def featured(self):
        return self.available().filter(is_featured=True)


class PropertyManager(models.Manager):
    def get_queryset(self):
        return PropertyQuerySet(self.model, using=self._db)

    def published(self):
        return self.get_queryset().published()

    def available(self):
        return self.get_queryset().available()

    def featured(self):
        return self.get_queryset().featured()


class Property(TimeStampedModel):
    class Status(models.TextChoices):
        AVAILABLE = "AVAILABLE", "Available"
        PENDING = "PENDING", "Offer pending"
        OCCUPIED = "OCCUPIED", "Occupied / Let"
        SOLD = "SOLD", "Sold"
        OFF_MARKET = "OFF_MARKET", "Off market"

    class PropertyType(models.TextChoices):
        APARTMENT = "APARTMENT", "Apartment"
        HOUSE = "HOUSE", "House"
        TOWNHOUSE = "TOWNHOUSE", "Townhouse"
        DUPLEX = "DUPLEX", "Duplex"
        STUDIO = "STUDIO", "Studio"
        SERVICED = "SERVICED", "Serviced Apartment"
        OFFICE = "OFFICE", "Office"
        SHOP = "SHOP", "Shop"
        WAREHOUSE = "WAREHOUSE", "Warehouse"
        LAND = "LAND", "Land"

    class ListingType(models.TextChoices):
        RENT = "RENT", "For Rent"
        SALE = "SALE", "For Sale"

    class PricePeriod(models.TextChoices):
        MONTHLY = "MONTHLY", "Per Month"
        QUARTERLY = "QUARTERLY", "Per Quarter"
        YEARLY = "YEARLY", "Per Year"
        ONE_OFF = "ONE_OFF", "One-off"

    class Furnishing(models.TextChoices):
        FURNISHED = "FURNISHED", "Furnished"
        SEMI = "SEMI", "Semi Furnished"
        UNFURNISHED = "UNFURNISHED", "Unfurnished"

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="properties",
        help_text="Landlord who owns the listing. Mant Bridges administrators may own listings too.",
    )
    title = models.CharField(max_length=200)
    slug = models.SlugField(max_length=220, unique=True, blank=True)
    reference = models.CharField(max_length=30, unique=True, blank=True, null=True)
    description = models.TextField()
    summary = models.CharField(
        max_length=300, blank=True, default="",
        help_text="Short line shown on listing cards. The description is used when empty.",
    )

    property_type = models.CharField(max_length=20, choices=PropertyType.choices,
                                     default=PropertyType.APARTMENT, db_index=True)
    listing_type = models.CharField(max_length=10, choices=ListingType.choices,
                                    default=ListingType.RENT, db_index=True)
    status = models.CharField(max_length=15, choices=Status.choices,
                              default=Status.AVAILABLE, db_index=True)
    furnishing = models.CharField(max_length=15, choices=Furnishing.choices,
                                  default=Furnishing.UNFURNISHED)

    price = models.DecimalField(max_digits=14, decimal_places=2, db_index=True)
    currency = models.CharField(max_length=10, default="UGX")
    price_period = models.CharField(max_length=10, choices=PricePeriod.choices,
                                    default=PricePeriod.MONTHLY)
    negotiable = models.BooleanField(default=False)
    service_charge = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    security_deposit = models.DecimalField(max_digits=14, decimal_places=2, default=0)

    bedrooms = models.PositiveIntegerField(default=0, db_index=True)
    bathrooms = models.PositiveIntegerField(default=0)
    parking_spaces = models.PositiveIntegerField(default=0)
    area = models.DecimalField(max_digits=10, decimal_places=2, default=0,
                               help_text="Floor or plot area.")
    area_unit = models.CharField(max_length=20, default="sqm")
    year_built = models.PositiveIntegerField(blank=True, null=True)
    amenities = models.JSONField(default=list, blank=True)

    address = models.CharField(max_length=255)
    city = models.CharField(max_length=120, db_index=True)
    district = models.CharField(max_length=120, blank=True, default="")
    region = models.CharField(max_length=120, blank=True, default="")
    country = models.CharField(max_length=120, default="Uganda")
    latitude = models.DecimalField(max_digits=9, decimal_places=6, blank=True, null=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, blank=True, null=True)

    is_published = models.BooleanField(default=True, db_index=True)
    is_featured = models.BooleanField(default=False, db_index=True)
    views = models.PositiveIntegerField(default=0)

    objects = PropertyManager()

    class Meta:
        ordering = ("-is_featured", "-created_at")
        verbose_name_plural = "Properties"
        indexes = [
            models.Index(fields=["listing_type", "status", "is_published"]),
            models.Index(fields=["city", "property_type"]),
        ]

    def __str__(self):
        return self.title

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = unique_slug(Property, self.title, instance=self)
        was_new = self.pk is None
        super().save(*args, **kwargs)
        if was_new and not self.reference:
            self.reference = f"MB-P{self.pk:05d}"
            super().save()

    def get_absolute_url(self):
        return reverse("property-detail", args=[self.slug])

    @property
    def short_description(self):
        if self.summary:
            return self.summary
        return (self.description[:220] + "...") if len(self.description) > 220 else self.description

    @property
    def cover_image(self):
        images = list(self.images.all())
        for image in images:
            if image.is_primary:
                return image
        return images[0] if images else None

    @property
    def is_available(self):
        return self.is_published and self.status == Property.Status.AVAILABLE

    @property
    def city_district(self):
        return ", ".join(bit for bit in (self.district, self.city) if bit)


class PropertyImage(TimeStampedModel):
    property = models.ForeignKey(Property, on_delete=models.CASCADE, related_name="images")
    image = models.ImageField(upload_to="properties/%Y/%m/")
    caption = models.CharField(max_length=180, blank=True, default="")
    alt_text = models.CharField(max_length=180, blank=True, default="")
    is_illustrative = models.BooleanField(
        default=False,
        help_text="Set for renders and stock art so visitors see the picture is not a "
                  "photograph of this property.",
    )
    is_primary = models.BooleanField(default=False)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ("-is_primary", "order", "id")

    def __str__(self):
        return f"{self.property.title} - image {self.pk}"

    def save(self, *args, **kwargs):
        has_primary = PropertyImage.objects.filter(
            property_id=self.property_id, is_primary=True
        ).exclude(pk=self.pk).exists()
        if self.is_primary or not has_primary:
            # Every property needs exactly one cover image.
            self.is_primary = True
        super().save(*args, **kwargs)
        if self.is_primary:
            PropertyImage.objects.filter(property_id=self.property_id).exclude(
                pk=self.pk
            ).update(is_primary=False)


class Enquiry(TimeStampedModel):
    """Message from a member of the public (contact page or property enquiry)."""

    class Status(models.TextChoices):
        NEW = "NEW", "New"
        IN_PROGRESS = "IN_PROGRESS", "In progress"
        RESOLVED = "RESOLVED", "Resolved"
        ARCHIVED = "ARCHIVED", "Archived"

    name = models.CharField(max_length=120)
    email = models.EmailField()
    phone = models.CharField(max_length=40, blank=True, default="")
    subject = models.CharField(max_length=200, blank=True, default="")
    message = models.TextField()
    property = models.ForeignKey(Property, on_delete=models.SET_NULL, null=True, blank=True,
                                 related_name="enquiries")
    status = models.CharField(max_length=15, choices=Status.choices, default=Status.NEW)
    handled_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="enquiries_handled",
    )
    admin_note = models.TextField(blank=True, default="")

    class Meta:
        ordering = ("-created_at",)
        verbose_name_plural = "Enquiries"

    def __str__(self):
        return f"{self.name} - {self.subject or self.email}"


class PropertyRecommendation(TimeStampedModel):
    """A property an owner puts in front of the Mant Bridges desk.

    Only the office turns a recommendation into a listing, so nothing typed here reaches the
    public catalogue until an administrator verifies it. The detail fields stay optional because
    an account opens with an empty draft that the owner fills in when he gets to it.
    """

    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        SUBMITTED = "SUBMITTED", "Submitted to the desk"
        IN_REVIEW = "IN_REVIEW", "In due diligence"
        VERIFIED = "VERIFIED", "Verified and listed"
        DECLINED = "DECLINED", "Declined"

    class ListingKind(models.TextChoices):
        RENT = "RENT", "To rent"
        SALE = "SALE", "For sale"
        BOTH = "BOTH", "For sale and to rent"

    class Ownership(models.TextChoices):
        OWN = "OWN", "I own it"
        FAMILY = "FAMILY", "Family property"
        AGENT = "AGENT", "I act for the owner"
        OTHER = "OTHER", "Another arrangement"

    class Occupancy(models.TextChoices):
        VACANT = "VACANT", "Empty and ready"
        OCCUPIED = "OCCUPIED", "Tenants in place"
        UNDER_CONSTRUCTION = "UNDER_CONSTRUCTION", "Still being built"
        UNKNOWN = "UNKNOWN", "Not sure"

    class Paperwork(models.TextChoices):
        TITLE = "TITLE", "Title / lease in hand"
        SALE_LETTER = "SALE_LETTER", "Sale letter or agreement only"
        APPLIED = "APPLIED", "Search or application in progress"
        NONE = "NONE", "Nothing yet"
        UNKNOWN = "UNKNOWN", "Not sure"

    recommender = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="property_recommendations",
    )
    title = models.CharField(max_length=200, blank=True, default="")
    description = models.TextField(blank=True, default="")
    listing_kind = models.CharField(
        max_length=10, choices=ListingKind.choices, blank=True, default=""
    )
    property_type = models.CharField(
        max_length=20, choices=Property.PropertyType.choices, blank=True, default=""
    )
    bedrooms = models.PositiveIntegerField(blank=True, null=True)
    bathrooms = models.PositiveIntegerField(blank=True, null=True)
    parking_spaces = models.PositiveIntegerField(blank=True, null=True)
    area = models.DecimalField(max_digits=10, decimal_places=2, blank=True, null=True)
    area_unit = models.CharField(max_length=20, default="sqm", blank=True)
    price_expectation = models.DecimalField(
        max_digits=14, decimal_places=2, blank=True, null=True,
        help_text="What the owner expects, not a valuation by Mant Bridges.",
    )
    price_period = models.CharField(
        max_length=10, choices=Property.PricePeriod.choices, blank=True, default=""
    )
    currency = models.CharField(max_length=10, default="UGX", blank=True)
    address = models.CharField(max_length=255, blank=True, default="")
    city = models.CharField(max_length=120, blank=True, default="")
    district = models.CharField(max_length=120, blank=True, default="")
    plot_reference = models.CharField(
        max_length=120, blank=True, default="",
        help_text="Plot number, block or title number where one exists.",
    )
    ownership = models.CharField(
        max_length=12, choices=Ownership.choices, blank=True, default=""
    )
    occupancy = models.CharField(
        max_length=20, choices=Occupancy.choices, blank=True, default=""
    )
    paperwork = models.CharField(
        max_length=16, choices=Paperwork.choices, blank=True, default=""
    )
    paperwork_note = models.TextField(
        blank=True, default="",
        help_text="Documents held, what is missing, and anything the desk needs to know "
                  "before it starts due diligence.",
    )
    inspection_contact = models.CharField(
        max_length=120, blank=True, default="",
        help_text="Who to call to view the property, and how to reach them.",
    )
    status = models.CharField(
        max_length=15, choices=Status.choices, default=Status.DRAFT, db_index=True
    )
    submitted_at = models.DateTimeField(blank=True, null=True)
    decided_at = models.DateTimeField(blank=True, null=True)
    decided_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="recommendations_decided",
        blank=True,
        null=True,
    )
    admin_note = models.TextField(blank=True, default="")
    listing = models.OneToOneField(
        Property,
        on_delete=models.SET_NULL,
        related_name="recommendation",
        blank=True,
        null=True,
        help_text="The listing created when the desk verified this recommendation.",
    )

    REQUIRED_FOR_SUBMIT = (
        ("title", "A short name for the property"),
        ("description", "What the property is, in a few sentences"),
        ("listing_kind", "Whether it is for sale, to rent, or both"),
        ("property_type", "The kind of property"),
        ("address", "Where it is — street, zone or landmark"),
        ("city", "The town or district it sits in"),
        ("ownership", "How the property relates to you"),
    )

    class Meta:
        ordering = ("-created_at",)
        verbose_name_plural = "Property recommendations"
        indexes = [
            models.Index(fields=["recommender", "status"]),
            models.Index(fields=["status", "-created_at"]),
        ]

    def __str__(self):
        return self.title or f"Recommendation #{self.pk} for {self.recommender}"

    @property
    def is_editable(self):
        """The owner may still change anything up to the moment the desk verifies or declines it."""
        return self.status in (self.Status.DRAFT, self.Status.SUBMITTED, self.Status.IN_REVIEW)

    def missing_for_submit(self):
        return [label for field, label in self.REQUIRED_FOR_SUBMIT if not getattr(self, field)]
