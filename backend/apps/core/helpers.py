"""Small shared utilities: money formatting and document numbering."""
from datetime import date
from decimal import Decimal, ROUND_HALF_UP

from django.utils.text import slugify

TWO_PLACES = Decimal("0.01")


def to_decimal(value):
    if value is None or value == "":
        return Decimal("0.00")
    return Decimal(str(value)).quantize(TWO_PLACES, rounding=ROUND_HALF_UP)


def format_money(amount, currency_symbol="UGX"):
    value = to_decimal(amount)
    if value == value.to_integral_value():
        formatted = f"{int(value):,}"
    else:
        formatted = f"{value:,.2f}"
    return f"{currency_symbol} {formatted}"


def next_document_number(prefix, model, field="number", ref_date=None):
    """Build a sequential, collision-free document number such as MB-RCP-2026-00007.

    Counting rows for the current year keeps numbers human-readable without
    relying on database-specific sequence features.
    """
    ref_date = ref_date or date.today()
    year_prefix = f"{prefix}-{ref_date.year}-"
    existing = model.objects.filter(**{f"{field}__startswith": year_prefix}).count()
    sequence = existing + 1
    candidate = f"{year_prefix}{sequence:05d}"
    while model.objects.filter(**{field: candidate}).exists():
        sequence += 1
        candidate = f"{year_prefix}{sequence:05d}"
    return candidate


def unique_slug(model, value, field="slug", instance=None):
    """Return a slug for `value` that is unique across `model`."""
    base = slugify(value, allow_unicode=False) or slugify(model.__name__.lower())
    candidate = base
    counter = 2
    queryset = model.objects.all()
    if instance is not None and instance.pk:
        queryset = queryset.exclude(pk=instance.pk)
    while queryset.filter(**{field: candidate}).exists():
        candidate = f"{base}-{counter}"
        counter += 1
    return candidate


def absolute_media_url(request, file_field):
    """Absolute URL for an ImageField/FileField so the React app can render it directly."""
    if not file_field:
        return None
    url = file_field.url
    if request is None:
        return url
    try:
        return request.build_absolute_uri(url)
    except AttributeError:
        return url
