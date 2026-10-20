"""The desk's route from a landlord's recommendation to a verified listing.

An owner never writes to the public catalogue. He recommends a property, the office reads
it, and only the verification step below creates a `Property` row — so nothing reaches the
public pages that the desk has not checked.
"""
from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.utils import timezone

from apps.properties.models import Property, PropertyRecommendation

LISTING_KIND_TO_TYPE = {
    PropertyRecommendation.ListingKind.RENT: Property.ListingType.RENT,
    PropertyRecommendation.ListingKind.SALE: Property.ListingType.SALE,
}

OPEN_STATUSES = (
    PropertyRecommendation.Status.SUBMITTED,
    PropertyRecommendation.Status.IN_REVIEW,
)


class RecommendationError(ValueError):
    """A recommendation cannot move to the next stage. Shown to the user as-is."""


def submit_recommendation(recommendation):
    """Send a completed draft to the desk.

    Asking questions before the office sees the property is the point of the queue, so a
    half-filled recommendation is refused rather than parked in front of an administrator.
    """
    missing = recommendation.missing_for_submit()
    if missing:
        raise RecommendationError(
            "The office cannot check this yet. Still needed: " + ", ".join(missing).lower() + "."
        )
    if recommendation.status == PropertyRecommendation.Status.DRAFT:
        recommendation.status = PropertyRecommendation.Status.SUBMITTED
        recommendation.submitted_at = timezone.now()
        recommendation.save(update_fields=["status", "submitted_at", "updated_at"])
    return recommendation


def mark_in_review(recommendation):
    """Note that due diligence has started, so the owner sees it is with the desk."""
    if recommendation.status not in OPEN_STATUSES:
        raise RecommendationError(
            "Only a recommendation the desk has not decided yet can go into due diligence."
        )
    recommendation.status = PropertyRecommendation.Status.IN_REVIEW
    recommendation.save(update_fields=["status", "updated_at"])
    return recommendation


def decline_recommendation(recommendation, *, by_user, note=""):
    """Turn a recommendation down, with the reason the owner reads."""
    if recommendation.status not in OPEN_STATUSES:
        raise RecommendationError("This recommendation has already been decided.")
    if not note.strip():
        raise RecommendationError("Write a short note so the owner knows why.")
    recommendation.status = PropertyRecommendation.Status.DECLINED
    recommendation.decided_at = timezone.now()
    recommendation.decided_by = by_user
    recommendation.admin_note = note.strip()
    recommendation.save(
        update_fields=["status", "decided_at", "decided_by", "admin_note", "updated_at"]
    )
    return recommendation


def resolve_listing_type(recommendation, listing_type=None):
    """Pick which half of the catalogue the verified property lands on.

    A recommendation may say "for sale and to rent", but a listing is one or the other, so
    the desk chooses at verification instead of the model inventing a price for both.
    """
    if listing_type:
        if listing_type not in Property.ListingType.values:
            raise RecommendationError("Choose either a rental listing or a sale listing.")
        return listing_type
    mapped = LISTING_KIND_TO_TYPE.get(recommendation.listing_kind)
    if mapped:
        return mapped
    raise RecommendationError(
        "This is offered for sale and to rent. Choose which one the first listing shows."
    )


def verify_recommendation(recommendation, *, by_user, listing_type=None,
                          price=None, currency=None, note=""):
    """Publish the listing the desk has verified, owned by the landlord who recommended it.

    The figures below come from the owner's recommendation. Mant Bridges has not valued the
    property, so `price_expectation` is carried across as the asking price and the office
    overwrites it here when its own checks say otherwise.
    """
    if recommendation.listing_id:
        raise RecommendationError("This recommendation is already a published listing.")
    if recommendation.status not in OPEN_STATUSES:
        raise RecommendationError("Only a recommendation sent to the desk can be verified.")

    resolved_type = resolve_listing_type(recommendation, listing_type)
    amount = _positive_price(price, recommendation.price_expectation)
    money = currency or recommendation.currency or "UGX"
    period = recommendation.price_period or (
        Property.PricePeriod.ONE_OFF
        if resolved_type == Property.ListingType.SALE
        else Property.PricePeriod.MONTHLY
    )

    with transaction.atomic():
        listing = Property.objects.create(
            owner=recommendation.recommender,
            title=recommendation.title,
            description=recommendation.description,
            summary="",
            property_type=recommendation.property_type or Property.PropertyType.HOUSE,
            listing_type=resolved_type,
            status=Property.Status.AVAILABLE,
            price=amount,
            currency=money,
            price_period=period,
            bedrooms=recommendation.bedrooms or 0,
            bathrooms=recommendation.bathrooms or 0,
            parking_spaces=recommendation.parking_spaces or 0,
            area=recommendation.area or Decimal("0"),
            area_unit=recommendation.area_unit or "sqm",
            address=recommendation.address,
            city=recommendation.city,
            district=recommendation.district,
            is_published=True,
        )
        recommendation.status = PropertyRecommendation.Status.VERIFIED
        recommendation.decided_at = timezone.now()
        recommendation.decided_by = by_user
        if note.strip():
            recommendation.admin_note = note.strip()
        recommendation.listing = listing
        recommendation.save(
            update_fields=[
                "status", "decided_at", "decided_by", "admin_note", "listing", "updated_at",
            ]
        )
    return recommendation


def _positive_price(*values):
    """The first value that is a number above zero, or a clear refusal."""
    for value in values:
        if value in (None, ""):
            continue
        try:
            amount = Decimal(str(value))
        except InvalidOperation:
            continue
        if amount > 0:
            return amount
    raise RecommendationError(
        "A listing needs a price above zero. Set the owner's expectation, or enter the "
        "asking price the office agreed."
    )
