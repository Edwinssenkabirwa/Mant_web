"""Fold the five seeded services into the four the printed brochures advertise.

Nothing is deleted. "Land documentation" keeps its row and artwork but is unpublished, because
its paragraphs now live inside "Lobbying & Advocacy", and the works-coordination paragraphs of
"Contracting and Lobbying" move into "Property Management". A fresh database has no rows here
yet, so every lookup is optional and the migration simply does nothing.
"""
from django.db import migrations

PARA_SEPARATOR = "\n\n"

PROPERTY_MANAGEMENT_SUMMARY = (
    "We take care of your property like it's our own. From tenant relations, rent collection, "
    "maintenance and inspections, we ensure your property runs smoothly and profitably."
)
REAL_ESTATE_MANAGEMENT_SUMMARY = (
    "Maximize the value of your real estate investments. We handle leasing, marketing, facility "
    "management and portfolio oversight to deliver sustainable growth."
)
LOBBYING_ADVOCACY_SUMMARY = (
    "We represent your interests with professionalism and influence. Our lobbying services help "
    "you navigate regulations, policies and secure favorable outcomes."
)
DEBT_RECOVERY_SUMMARY = (
    "We recover what is rightfully yours. Our effective and ethical debt recovery solutions help "
    "you improve cash flow and protect your assets."
)

WORKS_PARAGRAPH = (
    "Buildings need work, and work needs someone accountable for it. We define the scope with "
    "the owner, brief the trades, keep the programme and report progress against what was "
    "agreed — so a refurbishment does not turn into a set of unrelated invoices."
)
WORKS_HIGHLIGHTS = [
    "Scope definition, contractor brief and scheduling for maintenance and refurbishment works",
    "Site coordination, progress records and cost reporting against the agreed scope",
]
TRADES_LIMITATION = (
    "Licensed trades are engaged for the work that requires them, and we do not claim "
    "credentials we do not hold."
)
LAND_DOCUMENTATION_LIMITATION = (
    "We are not a land registry and we do not hold or issue government records. Official "
    "searches, title verification, valuation for transfer and registration are done by the land "
    "office and a licensed advocate. We prepare the file and follow it up; we cannot guarantee "
    "what an office decides or how long it takes."
)


def _append_paragraphs(service, paragraphs):
    body = service.description or ""
    added = [chunk for chunk in paragraphs if chunk not in body]
    if added:
        service.description = PARA_SEPARATOR.join([body] + added).strip()
    return service


def _append_highlights(service, points):
    current = list(service.highlights or [])
    service.highlights = current + [point for point in points if point not in current]
    return service


def _append_limitation(service, sentence):
    current = (service.limitations or "").strip()
    if sentence in current:
        return service
    if not current:
        service.limitations = sentence
    else:
        service.limitations = current.rstrip(".") + ". " + sentence
    return service


def fold_services(apps, schema_editor):
    Service = apps.get_model("core", "Service")

    def find(slug):
        return Service.objects.filter(slug=slug).first()

    management = find("rent-collection-and-property-management")
    if management is not None:
        works = find("contracting-and-lobbying")
        _append_paragraphs(management, [WORKS_PARAGRAPH])
        _append_highlights(management, WORKS_HIGHLIGHTS)
        _append_limitation(management, TRADES_LIMITATION)
        management.name = "Property Management"
        management.slug = "property-management"
        management.category = "PROPERTY_MANAGEMENT"
        management.icon = "building"
        management.summary = PROPERTY_MANAGEMENT_SUMMARY
        management.order = 1
        management.save()

    trading = find("real-estate-purchase-and-sale")
    if trading is not None:
        trading.name = "Real Estate Management"
        trading.slug = "real-estate-management"
        trading.category = "REAL_ESTATE_MANAGEMENT"
        trading.icon = "keys"
        trading.summary = REAL_ESTATE_MANAGEMENT_SUMMARY
        trading.order = 2
        trading.save()

    advocacy = find("contracting-and-lobbying")
    if advocacy is not None:
        paperwork = find("land-documentation")
        if paperwork is not None:
            _append_paragraphs(
                advocacy,
                [chunk.strip() for chunk in (paperwork.description or "").split(PARA_SEPARATOR)
                 if chunk.strip()],
            )
            _append_highlights(
                advocacy,
                [
                    "A checklist of the documents a purchase or application needs, and who "
                    "issues each one",
                    "Assembling search applications, consent, stamp duty and land office forms "
                    "into one file",
                    "Liaison with the land office, surveyors and advocates, and follow-up on "
                    "files already in process",
                    "Support with transfer, mutation and partition applications and the "
                    "searches they depend on",
                    "A handed-over document pack at completion, indexed and dated",
                ],
            )
            _append_limitation(advocacy, LAND_DOCUMENTATION_LIMITATION)
        advocacy.name = "Lobbying & Advocacy"
        advocacy.slug = "lobbying-and-advocacy"
        advocacy.category = "LOBBYING_ADVOCACY"
        advocacy.icon = "landmark"
        advocacy.summary = LOBBYING_ADVOCACY_SUMMARY
        advocacy.order = 3
        # The artwork on this row illustrates property works, not a representation file.
        advocacy.image_alt = "Illustrative artwork — property works and site coordination"
        advocacy.save()

    documentation = find("land-documentation")
    if documentation is not None:
        documentation.order = 99
        documentation.is_published = False
        documentation.save()

    recovery = find("debt-recovery")
    if recovery is not None:
        recovery.name = "Debt Recovery"
        recovery.category = "DEBT_RECOVERY"
        recovery.icon = "gavel"
        recovery.summary = DEBT_RECOVERY_SUMMARY
        recovery.order = 4
        recovery.save()


def unfold_services(apps, schema_editor):
    """Best-effort reverse: republish the withdrawn row and drop the folded-in prose."""
    Service = apps.get_model("core", "Service")
    for slug, name, category, order in (
        ("property-management", "Rent collection and property management", "PROPERTY_MANAGEMENT", 1),
        ("real-estate-management", "Real estate: purchase and sale", "BUYING_SELLING", 5),
        ("lobbying-and-advocacy", "Contracting and lobbying", "CONTRACTING", 3),
        ("debt-recovery", "Debt recovery", "DEBT_RECOVERY", 2),
    ):
        service = Service.objects.filter(slug=slug).first()
        if service is None:
            continue
        service.name, service.category, service.order = name, category, order
        service.icon = ""
        service.summary = ""
        service.save()
    paperwork = Service.objects.filter(slug="land-documentation").first()
    if paperwork is not None:
        paperwork.is_published = True
        paperwork.order = 4
        paperwork.save()


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0005_company_phone_3_service_icon_alter_company_email_and_more"),
    ]

    operations = [migrations.RunPython(fold_services, unfold_services)]
