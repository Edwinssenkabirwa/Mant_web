"""Seed the four services the website advertises.

The names and summary lines come from the printed brochures, so the site, the flyer and the
inbound enquiry all describe the same four offers. The longer body copy stays specific about
what the desk actually does, and every service keeps its "honest limits" note.

Safe to run more than once: a service is looked up by its name and existing rows are left exactly
as an administrator set them, so re-running never overwrites edited copy, an uploaded photograph
or a deliberate unpublish.
"""
from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand
from django.db import transaction

from apps.core.models import Service

SERVICES = [
    {
        "name": "Property Management",
        "category": Service.Category.PROPERTY_MANAGEMENT,
        "icon": Service.Icon.BUILDING,
        "summary": (
            "We take care of your property like it's our own. From tenant relations, rent "
            "collection, maintenance and inspections, we ensure your property runs smoothly "
            "and profitably."
        ),
        "description": (
            "A tenancy generates paperwork faster than most owners expect: an agreed rent, a "
            "deposit, service charge, billing dates, invoices, receipts and the occasional "
            "dispute about what was paid when. We take that administration on as a written "
            "mandate and run it to a calendar.\n\n"
            "Every invoice is raised the same way, with the tax, discount and late-fee rules "
            "from the lease applied consistently. Cash, bank transfer and mobile money "
            "receipts are logged and reconciled by the desk before they are treated as paid, "
            "so the ledger reflects money we can actually point to rather than money someone "
            "says they sent.\n\n"
            "Buildings need work, and work needs someone accountable for it. We define the "
            "scope with the owner, brief the trades, keep the programme and report progress "
            "against what was agreed — so a refurbishment does not turn into a set of "
            "unrelated invoices."
        ),
        "highlights": [
            "Tenancy setup with the agreed rent, service charge, deposit and billing "
            "frequency recorded on the lease",
            "Invoices raised on schedule, with tax, discounts and late-fee rules applied "
            "the same way every time",
            "Cash, bank transfer and mobile money payments logged, reconciled and receipted",
            "A running statement per tenancy — what was charged, what was received, what is "
            "outstanding",
            "Reminders on overdue invoices and a documented trail of what was sent and when",
            "Scope definition, contractor brief and scheduling for maintenance and "
            "refurbishment works",
            "Site coordination, progress records and cost reporting against the agreed scope",
            "Occupancy, arrears and collection reporting for landlords, shared through "
            "their portal",
        ],
        "limitations": (
            "We do not take rent payments online. Payments reach us by the methods in your "
            "agreement, are logged as pending, and only become confirmed once the desk "
            "reconciles them. Licensed trades are engaged for the work that requires them, "
            "and we do not claim credentials we do not hold."
        ),
        "image_alt": "Rent ledger and property administration desk",
    },
    {
        "name": "Real Estate Management",
        "category": Service.Category.REAL_ESTATE_MANAGEMENT,
        "icon": Service.Icon.KEYS,
        "summary": (
            "Maximize the value of your real estate investments. We handle leasing, marketing, "
            "facility management and portfolio oversight to deliver sustainable growth."
        ),
        "description": (
            "We bring buyers and sellers together and stay involved after the handshake. "
            "Sellers get the property listed and marketed with honest photographs, accurate "
            "prices and a record of every viewing and offer. Buyers get a clear picture of "
            "what they are agreeing to before they sign anything.\n\n"
            "Between offer and completion we keep the checklist — deposit, conditions, the "
            "advocate's work, the payment schedule — so nobody discovers a missing step on "
            "handover day.\n\n"
            "Across a portfolio the same discipline applies to vacancy: which unit is "
            "under-earning, which is approaching expiry, and what it would take to let it. "
            "Landlords see that position on their dashboard rather than in a monthly email."
        ),
        "highlights": [
            "Market guidance based on comparable listings and the records we can genuinely see",
            "Listing, photographs and marketing of the property across our channels",
            "Buyer screening, viewing coordination and offer negotiation on written "
            "instruction",
            "Preparation of sale agreements and offer letters, reviewed before signature",
            "Coordination with advocates, surveyors and the offices on the transfer steps",
            "Completion and handover, with a written record of what has been paid and what "
            "remains",
            "Portfolio oversight: occupancy, expiry calendar and vacancy reporting",
        ],
        "limitations": (
            "We act as an agent on written instruction. We do not hold a valuation licence, "
            "we cannot transfer a title ourselves, and no sale is guaranteed — price, buyer "
            "and timeline depend on the market, and the legal transfer must be handled by a "
            "licensed advocate."
        ),
        "image_alt": "Property sale agreement and handover of keys",
    },
    {
        "name": "Lobbying & Advocacy",
        "category": Service.Category.LOBBYING_ADVOCACY,
        "icon": Service.Icon.LANDMARK,
        "summary": (
            "We represent your interests with professionalism and influence. Our lobbying "
            "services help you navigate regulations, policies and secure favorable outcomes."
        ),
        "description": (
            "Utilities, local authorities and service providers move faster when the file is "
            "complete and somebody follows it up, so we act as the owner's agent on those "
            "matters and keep a written record of what was asked and what was answered.\n\n"
            "Most land and permit matters stall on documents rather than on the decision "
            "itself. We work out which papers a transaction or an application needs, get them "
            "drawn up or collected, and keep a file index so nothing goes missing between the "
            "parties, the lawyer and the offices.\n\n"
            "Where a step legally has to be done by someone else, we say so and hand the file "
            "to the right professional rather than pretending to be them."
        ),
        "highlights": [
            "Liaison with local authorities, utilities and service providers on property "
            "matters",
            "Preparation of representations and follow-up correspondence on behalf of the "
            "instruction",
            "A checklist of the documents a purchase or application needs, and who issues "
            "each one",
            "Assembling search applications, consent, stamp duty and land office forms into "
            "one file",
            "Liaison with the land office, surveyors and advocates, and follow-up on files "
            "already in process",
            "Support with transfer, mutation and partition applications and the searches "
            "they depend on",
            "A handed-over document pack at completion, indexed and dated",
        ],
        "limitations": (
            "We take instructions as an agent and coordinator. We are not a land registry and "
            "we do not hold or issue government records. Official searches, title "
            "verification, valuation for transfer and registration are done by the land "
            "office and a licensed advocate. We prepare the file and follow it up; we cannot "
            "guarantee what an office decides or how long it takes."
        ),
        "image_alt": "Representation file, permits and land office correspondence",
    },
    {
        "name": "Debt Recovery",
        "category": Service.Category.DEBT_RECOVERY,
        "icon": Service.Icon.GAVEL,
        "summary": (
            "We recover what is rightfully yours. Our effective and ethical debt recovery "
            "solutions help you improve cash flow and protect your assets."
        ),
        "description": (
            "Arrears are hardest to recover when nobody can say what is owed. Where we have "
            "run the tenancy, the ledger already exists: dated invoices, recorded payments, "
            "receipts and the reminders that were sent. We work from that record rather than "
            "from memory.\n\n"
            "Follow-up is written, dated and proportionate — a demand where one is due, a "
            "payment arrangement in writing where the debtor engages, and escalation "
            "guidance prepared for the channel your agreement and Ugandan law provide for."
        ),
        "highlights": [
            "Arrears review against the ledger: invoices, payments, receipts and prior "
            "reminders",
            "Written demand and reminder correspondence with dated records",
            "Negotiation of payment arrangements in writing, on terms the landlord approves",
            "Escalation guidance and a brief prepared for the channel your agreement "
            "provides for",
            "Reporting on what has been recovered, what remains and how long it has been "
            "outstanding",
        ],
        "limitations": (
            "No outcome can be guaranteed. Recovery depends on the debtor, the documentation "
            "and the process your agreement and Ugandan law allow — we will not promise a "
            "result we cannot control."
        ),
        "image_alt": "Arrears review and written recovery correspondence",
    },
]


def _placeholder(service):
    from apps.core.services.placeholders import PALETTES, placeholder_image

    index = service.order % len(PALETTES)
    tile = placeholder_image(
        service.name,
        size=(1200, 800),
        palette=PALETTES[index],
        tagline="Mant Bridges LTD — service illustration",
    )
    return ContentFile(tile.read(), name=f"{service.slug}.jpg")


class Command(BaseCommand):
    help = "Create the website's service entries, skipping any that already exist."

    def add_arguments(self, parser):
        parser.add_argument(
            "--with-images",
            action="store_true",
            help="Attach a generated brand placeholder to any service that has no image yet.",
        )

    @transaction.atomic
    def handle(self, *args, **options):
        created, existing = [], []
        for position, payload in enumerate(SERVICES, start=1):
            if Service.objects.filter(name=payload["name"]).exists():
                existing.append(payload["name"])
                continue
            service = Service.objects.create(**dict(payload, order=position, is_published=True))
            created.append(service.name)
            if options["with_images"] and not service.image:
                service.image = _placeholder(service)
                service.save(update_fields=["image"])

        if not options["verbosity"]:
            return
        self.stdout.write(self.style.SUCCESS(
            f"{len(created)} service(s) created, {len(existing)} already existed and were left untouched."
        ))
        for name in created:
            self.stdout.write(f"  + {name}")
        for name in existing:
            self.stdout.write(f"  = {name}")
        if not Service.objects.published().exists():
            self.stdout.write(self.style.WARNING("No published services — publish them in the admin."))
