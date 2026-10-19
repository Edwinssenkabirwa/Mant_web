"""Seed the five services the website advertises.

The four headline names and their summary lines come from the printed brochures; the fifth,
Land & property documentation, is the paperwork work the brochure lists alongside them. The
longer body copy is written for owners and tenants rather than for the ledger, and every
service keeps its "honest limits" note.

Body copy uses a small convention the public page renders as sections: a line beginning "## "
becomes a subheading, and a block whose lines begin "- " becomes a bullet list. Paragraphs are
separated by a blank line.

Safe to run more than once: a service is looked up by its name and existing rows are left
exactly as an administrator set them, so re-running never overwrites edited copy, an uploaded
photograph or a deliberate unpublish. Slugs are pinned here rather than derived from the name,
so a rename does not move a published URL or orphan the artwork in seed_images/.

--update is the deliberate exception: it writes this file over the live rows, matched by slug,
and is how a rename or a copy change reaches a database that has already been seeded.
"""
from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand
from django.db import transaction

from apps.core.models import Service

SERVICES = [
    {
        "name": "Rent collection & property management",
        "slug": "property-management",
        "category": Service.Category.PROPERTY_MANAGEMENT,
        "icon": Service.Icon.BUILDING,
        "summary": (
            "We take care of your property like it's our own. From tenant relations, rent "
            "collection, maintenance and inspections, we ensure your property runs smoothly "
            "and profitably."
        ),
        "description": (
            "Rent is the reason most owners hand a property over, and it is the part that fails "
            "most often when it is left to memory. We take the tenancy on as a written mandate "
            "and run it to a calendar: who is in the unit, what they pay, when it is due, what "
            "the building needs and who is answering for it.\n\n"
            "## What we do for you\n\n"
            "- Rent collected on the date you agreed, chased the day it slips, and reported to "
            "you as it happens\n"
            "- Tenants sourced, referenced and put on a proper written agreement before anyone "
            "gets a key\n"
            "- Deposits and rent accounted for against the tenancy, so a question about money "
            "is answered with a document\n"
            "- Inspections and maintenance scheduled, with the trades briefed and the cost "
            "reported back\n"
            "- Arrears handled early and in writing, before a small gap becomes a bad year\n"
            "- One named desk answering for the property, so instructions are not passed "
            "sideways\n\n"
            "## Qualities of a good landlord\n\n"
            "We work best with owners who treat the property as a business rather than a side "
            "hustle. In practice that means:\n\n"
            "- Pricing realistically against the area, not against a hope\n"
            "- Keeping the building safe and wind-and-water tight, and funding repairs when "
            "they are raised\n"
            "- Deciding on repairs and tenant requests inside the time the mandate allows\n"
            "- Leaving the day-to-day to us instead of negotiating separately with the tenant\n"
            "- Telling us early when the property is being sold, transferred or re-tenanted\n\n"
            "## Qualities of a good tenant\n\n"
            "- Paying on the agreed date rather than the agreed month\n"
            "- Reporting a fault early, while it is still cheap to fix\n"
            "- Keeping the property as it was handed over, and respecting the neighbours and "
            "the rules in the agreement\n"
            "- Giving proper notice, and returning keys and access in the condition agreed\n"
            "- Raising a dispute through the office in writing, rather than by withholding rent\n\n"
            "## Our responsibilities to tenants and landlords, and theirs to us\n\n"
            "A management instruction only works as a two-way agreement, so we write down what "
            "we owe and what we need from you.\n\n"
            "To landlords: we tell you the position of your property without you having to ask; "
            "we never spend above the limit you set without asking first; we hold your papers "
            "and your tenants' personal details privately; and we say plainly when something is "
            "not our job and who the right professional is.\n\n"
            "To tenants: a working agreement, a proper handover and a place to raise a fault "
            "that gets an answer; notice before we enter; no charge that is not in the "
            "agreement; and a deposit accounted for against the condition the property was "
            "handed over in.\n\n"
            "In return we ask to be instructed in writing, to be the single point of contact "
            "once appointed, and to be told when anything in the arrangement changes.\n\n"
            "## How we work legally and professionally, for the convenience of our clients\n\n"
            "Everything starts from a written instruction. We hold no key, sign nothing and "
            "touch no money on a property until the owner's mandate is on file and the scope, "
            "the fee and the reporting are agreed. Where a step belongs to a licensed "
            "professional — a search, a valuation, a lease reviewed for registration, a court "
            "filing — we say so and hand the file to an advocate, a valuer or a registered "
            "tradesperson. We work within Ugandan tenancy and land law, we put instructions and "
            "responses in writing, and we keep the file so that a question asked two years from "
            "now can still be answered from records rather than memory.\n\n"
            "## Benefits of partnering with us\n\n"
            "The point of handing a property over is not to lose sight of it — it is to stop "
            "chasing it.\n\n"
            "- You receive money in the agreed time, so you can plan the month, the school fees "
            "or the next purchase around it instead of hoping\n"
            "- Income you can project is income you can invest against: a lender, a partner or "
            "a builder takes a steady, documented rent seriously, and you can start the next "
            "project earlier than you otherwise could\n"
            "- You stop being the person chasing tenants at seven in the morning; the calls "
            "come to a desk that writes them down\n"
            "- Faults get closed while they are small, which protects the brick and the price "
            "you will ask for later\n"
            "- You can be upcountry, in Dubai or in a meeting, and the rent still arrives\n"
            "- Earning becomes comfortable: the return, without the row"
        ),
        "highlights": [
            "Rent collected on the agreed date, with same-day follow-up when it slips",
            "Tenant sourcing, referencing and a written agreement before handover",
            "Renewals, notices and the paperwork that comes with a change of tenant",
            "Deposits held and accounted for against the condition of the property",
            "Planned inspections and a written report on the state of the building",
            "Maintenance: scope agreed, trades briefed, programme kept, cost reported",
            "Arrears handled early and in writing, with escalation when it comes to that",
            "Occupancy and collection reporting to the owner, readable in their portal",
            "Site coordination for refurbishment and improvement works on the agreed scope",
        ],
        "limitations": (
            "We do not take rent payments online; money reaches us by the methods in your "
            "agreement and counts as received when it has actually arrived. We are not a "
            "valuer, an advocate or a registered contractor, and those steps go to a licensed "
            "professional we will name to you. Licensed trades are engaged for the work that "
            "requires them, and we do not claim credentials we do not hold."
        ),
        "image_alt": "Illustrative artwork — apartment blocks with a landscaped frontage",
    },
    {
        "name": "Real estate",
        "slug": "real-estate-management",
        "category": Service.Category.REAL_ESTATE_MANAGEMENT,
        "icon": Service.Icon.KEYS,
        "summary": (
            "Maximize the value of your real estate investments. We handle leasing, marketing, "
            "facility management and portfolio oversight to deliver sustainable growth."
        ),
        "description": (
            "We bring buyers and sellers together and stay involved after the handshake. A "
            "seller gets the property marketed with honest photographs and an accurate price; a "
            "buyer gets a clear picture of what they are signing for. Very few deals in Uganda "
            "fail on price — they fail on a document nobody checked.\n\n"
            "## For the seller — finding the buyer\n\n"
            "- A market position based on comparable listings and the records we can genuinely "
            "see, not on what you would like\n"
            "- Listing, photography and marketing across our channels, with a record of every "
            "viewing and every offer\n"
            "- Buyers screened before a key turns over, so the property is not walked through "
            "by tourists\n"
            "- Offers negotiated on your instruction, with the terms — not just the figure — "
            "put in front of you\n"
            "- Coordination with the advocate, the surveyor and the offices through to handover\n\n"
            "## For the buyer — finding the property\n\n"
            "- A shortlist against the budget and the use you actually have, including areas "
            "you would not have driven to yourself\n"
            "- The property inspected with you: the access road, the neighbours and the flood "
            "position looked at rather than assumed\n"
            "- The documents that should exist for that purchase listed, and the ones that do "
            "exist read before you pay\n"
            "- Price and conditions negotiated on your behalf, with the money staged against "
            "the steps that must happen first\n\n"
            "## Venturing into due diligence, where the deal is really done\n\n"
            "Before money moves we work out what the seller's story is supposed to prove, then "
            "go and look for it. That means the instrument the land is held under, the search "
            "position, the physical boundaries against the plan, who else has an interest in "
            "the plot, whether the seller is the person the records point to, and whether the "
            "price carries a problem the next owner will inherit.\n\n"
            "- Searches and verification prepared with the land office and a licensed advocate, "
            "and chased to an answer\n"
            "- Boundaries walked with a surveyor's plan in hand, not from a car window\n"
            "- Family, tenant and occupant interests identified before purchase, because a plot "
            "is worth less with someone still living on it\n"
            "- Company, trustee or inheritance ownership checked against the documents that "
            "created it\n"
            "- A written position on what is proven, what is missing and what remains a risk\n\n"
            "## Helping our clients avoid fraud\n\n"
            "Most land fraud in and around Kampala is not a clever forgery. It is a "
            "genuine-looking document, sold twice, on a plot the seller does not have. The "
            "protections are boring, and they work.\n\n"
            "- We do not let a deposit buy silence: money is staged against completed steps, "
            "and the largest payment comes at transfer rather than at agreement\n"
            "- We insist on meeting the registered owner, or on papers that prove who is "
            "signing for them\n"
            "- We treat an unusually cheap plot, a rushed signature and cash requested outside "
            "the file as warnings rather than bargains\n"
            "- We put every promise into the agreement, because a verbal assurance about the "
            "road, the title or the tenant is not a term\n"
            "- Where a document cannot be verified we say the deal should not proceed, even "
            "when that costs us the instruction\n\n"
            "## Legal professionalism\n\n"
            "We act as an agent on written instruction. We are paid to complete your "
            "transaction, not to close a deal at any cost — and the difference shows in what we "
            "tell you when the news is bad.\n\n"
            "Across a portfolio the same discipline applies to vacancy: which unit is "
            "under-earning, which is approaching expiry, and what it would take to let it."
        ),
        "highlights": [
            "Market guidance from comparable listings and the records we can actually see",
            "Listing, photography and marketing of the property across our channels",
            "Buyer and tenant sourcing, screening and viewing coordination",
            "Due diligence packs assembled with the land office, a surveyor and an advocate",
            "Sale agreements and offer letters prepared and reviewed before signature",
            "Payment staged against the steps that have to be completed first",
            "Completion and handover, with a written record of what has been paid and what "
            "remains",
            "Portfolio oversight: occupancy, expiry calendar and vacancy position",
        ],
        "limitations": (
            "We act as an agent on written instruction. We do not hold a valuation licence, we "
            "cannot transfer a title ourselves, and no sale is guaranteed — price, buyer and "
            "timeline depend on the market, and the legal transfer must be handled by a "
            "licensed advocate and the land office."
        ),
        "image_alt": "Illustrative artwork — an open plot for sale above a Kampala neighbourhood",
    },
    {
        "name": "Contracting & lobbying",
        "slug": "lobbying-and-advocacy",
        "category": Service.Category.LOBBYING_ADVOCACY,
        "icon": Service.Icon.LANDMARK,
        "summary": (
            "We represent your interests with professionalism and influence. Our lobbying "
            "services help you navigate regulations, policies and secure favorable outcomes."
        ),
        "description": (
            "A capable, properly registered contractor loses work every week to a competitor "
            "whose file simply reached the right desk first. Tenders close quietly, "
            "requirements are missed on a technicality, and work written for your category is "
            "awarded somewhere down the road to whoever followed it up. The gap is rarely "
            "competence. It is representation.\n\n"
            "## Who we act for\n\n"
            "Two sides of the same transaction — never at the same time on the same contract.\n\n"
            "- The contractor who wants the work: the local or foreign firm that is registered, "
            "eligible and priced to compete, but has no reach inside the procuring office\n"
            "- The party awarding the work: the client, investor or institution that needs "
            "capable, verified bidders on the shortlist rather than whoever happens to know "
            "somebody\n"
            "- Owners and investors whose project is held up by a permit, a connection or an "
            "approval that has stopped moving\n\n"
            "## We represent legitimate and eligible contractors\n\n"
            "We do it by hustling the corners of influence — every desk, office and committee "
            "where a decision about your category of work is made, held up or quietly handed "
            "over. We act on behalf of the company that wishes to win the contract, and on "
            "behalf of the client giving it, and never both at once on the same tender.\n\n"
            "- We read the requirement the way the procuring office wrote it, and tell you "
            "plainly whether you are eligible before you spend money bidding\n"
            "- We assemble the compliance pack — registration, tax position, licences, "
            "certificates, references, financials — so nothing disqualifies you on a formality\n"
            "- We watch the tender position for your category and get the submission in before "
            "the clock, with the documents the committee will ask for\n"
            "- We carry the file to the offices that decide, put your company in front of them, "
            "and follow every unanswered question to an answer\n"
            "- We keep a dated record of what was submitted, whom we spoke to and what came "
            "back, and hand it to you at the end\n\n"
            "## How we act for the client giving the contract\n\n"
            "- We source eligible contractors against the specification and the budget you have "
            "set\n"
            "- We prequalify: registration, tax, licences, completed work and references "
            "checked rather than merely listed\n"
            "- We sound out the market so you know what the work should cost before a single "
            "bid arrives\n"
            "- We present a shortlist with the weaknesses of each bidder stated, not hidden\n\n"
            "## How we work legally and professionally\n\n"
            "Representation is not influence for sale. We act on written instruction, we "
            "disclose whose interest we are serving, and we pursue a decision through the "
            "process the law provides: submissions, clarifications, meetings, appeals and "
            "correspondence. We do not offer, promise or arrange anything of value to move a "
            "decision, and we will not accept an instruction that asks us to. That is not a "
            "disclaimer — it is the reason offices still take our calls.\n\n"
            "- Written instruction, declared interest, and a file that could be read out loud "
            "in a procurement review\n"
            "- Submissions made through the official channel, on the official timetable\n"
            "- Honest advice on whether a bid is worth the money it costs to prepare\n\n"
            "Utilities, local authorities and service providers also move faster when the file "
            "is complete and somebody follows it up, so we act as your agent on those matters "
            "and keep a written record of what was asked and what was answered."
        ),
        "highlights": [
            "Eligibility and compliance review before you spend money on a bid",
            "Tender monitoring for your category of work, with the requirement read as written",
            "Preparation and submission of the compliance pack and the technical response",
            "Representation before procuring offices, utilities and local authorities",
            "Follow-up correspondence and a dated record of every contact",
            "Contractor sourcing and prequalification for parties awarding work",
            "Market soundings so the awarding party knows what the work should cost",
            "Permit, connection and approval files unblocked and chased to a decision",
        ],
        "limitations": (
            "We cannot guarantee an award, a permit or a decision — the procuring entity, the "
            "council and the offices decide, and we have no vote in it. We do not bid in your "
            "name, sign as your company or hold your licences, and we will not take an "
            "instruction where winning depends on anything other than an eligible bidder and a "
            "compliant file."
        ),
        "image_alt": "Illustrative artwork — a contractor on site reviewing drawings with a mason",
    },
    {
        "name": "Debt recovery",
        "slug": "debt-recovery",
        "order": 5,
        "category": Service.Category.DEBT_RECOVERY,
        "icon": Service.Icon.COINS,
        "summary": (
            "We recover what is rightfully yours. Our effective and ethical debt recovery "
            "solutions help you improve cash flow and protect your assets."
        ),
        "description": (
            "Money that is owed is rarely held by one person — it is held by a chain. A payment "
            "parked at an office, a cheque that never cleared, a client who keeps promising, a "
            "file that has moved twice without anyone telling you, a contractor waiting on a "
            "certificate nobody will sign. The debt is usually not disputed; it is stuck. And "
            "every week it sits, it becomes harder to move. Chasing it yourself costs you days "
            "you cannot bill for, and a relationship you may still want. This is what calls for a "
            "professional like Mant Bridges — somebody to knock on every concerned office door and "
            "press for the effective payment of our clients.\n\n"
            "## Knocking on every concerned office door\n\n"
            "- We take the file, work out which offices and which people hold the money, and "
            "put a name to each one\n"
            "- We knock on every concerned office door — letter, telephone, and an actual visit "
            "where a visit is what moves a file\n"
            "- We present the claim in the form the paying party's own process needs, so it is "
            "not returned for a missing document\n"
            "- We follow up on a dated schedule rather than when somebody remembers, and report "
            "each contact back to you\n"
            "- We negotiate an arrangement in writing when the debtor can pay but not at once, "
            "on terms you approve\n"
            "- We prepare the escalation — the demand, the brief, the papers — for the channel "
            "your agreement and Ugandan law provide for, and hand it to your advocate\n\n"
            "## How we work with you\n\n"
            "Before we start we want three things: what was agreed, what has been paid, and "
            "what you have already tried. From there we fix the sum we are pursuing, the "
            "settlement you will and will not accept, how far you are prepared to go, and what "
            "we report and when. Nothing is settled or written off without you.\n\n"
            "- A written instruction covering the amount, the tolerance and the escalation you "
            "authorise\n"
            "- The documents behind the claim: the agreement, the payment record, the "
            "correspondence, and the proof that the work was delivered\n"
            "- Contact reports as we go, so you are never left wondering whether anything "
            "happened\n"
            "- A clear recommendation when a debt is not worth the cost of chasing — and we "
            "will say it\n\n"
            "## The line we hold\n\n"
            "Ethical recovery is the only kind that survives scrutiny. We deal with the debtor "
            "directly and in writing, we do not threaten, we do not contact employers, family "
            "or neighbours to pressure a payment, and we never present ourselves as a court, a "
            "police officer or your advocate."
        ),
        "highlights": [
            "Trade debts, unpaid fees, retention sums and contract balances",
            "Rent arrears pursued for landlords, including tenants who have already left",
            "Payments held up inside institutions, utilities and other offices",
            "Cheque and mobile money failures, and the follow-up with the paying bank",
            "Written demand and reminder correspondence with dated records",
            "Payment arrangements negotiated in writing, on terms the creditor approves",
            "Escalation briefs prepared for the advocate and the forum your agreement provides",
            "Reporting on what has been recovered, what remains and how long it has been out",
        ],
        "limitations": (
            "No outcome can be guaranteed. Recovery depends on the debtor's ability to pay, the "
            "documents behind the claim and the process your agreement and Ugandan law allow. "
            "We are not a court, a police service or an advocate, and we will not promise a "
            "result we cannot control."
        ),
        "image_alt": "Illustrative artwork — stacked bundles of United States banknotes",
    },
    {
        "name": "Land & property documentation",
        "slug": "land-documentation",
        "order": 4,
        "category": Service.Category.LAND_DOCUMENTATION,
        "icon": Service.Icon.DOCUMENT,
        "summary": (
            "When you instruct us, we take every step required to establish that the documents "
            "behind your land or property are genuine — so a purchase, a mortgage or an "
            "inheritance does not become your problem in front of a court."
        ),
        "description": (
            "A plot can come with an agreement, payment papers, photographs of the site and a "
            "smiling seller, and still be worth nothing — because the title is a copy of a "
            "copy, the owner died without a letter of administration, the land is customary and "
            "the family never consented, or the same plot has already been sold twice. When "
            "that surfaces, the person left standing in front of the bank, the buyer or the "
            "court is you. The humiliation, the embarrassment and the penalties land on the "
            "person holding the paper, not the person who sold it.\n\n"
            "## Every step required, taken on behalf of our clients\n\n"
            "When we are contracted we take the whole sequence on your behalf, and we do not "
            "skip a step because it looks slow.\n\n"
            "- We establish what the land actually is: leasehold or customary, the size, the "
            "location, and whether the plot on the ground is the plot on the plan\n"
            "- We obtain the official search for that parcel and read it, rather than accept "
            "the copy the seller already had printed\n"
            "- We verify the instrument in front of us against the office that issued it — "
            "title, indenture, partition agreement, letter of administration, court order or "
            "power of attorney\n"
            "- We trace the chain: who owned it, how it passed, and whether every transfer in "
            "between was consented and registered\n"
            "- We identify the interests that do not appear on a certificate — spouse and "
            "family on customary land, tenants and occupants, a bank's caveat, an unpaid "
            "developer, a road or a reserved strip\n"
            "- We assemble what the transaction needs: applications, consents, forms and the "
            "assessment of duty, with the surveyor's and the advocate's work, into one indexed "
            "file\n"
            "- We hand the file to a licensed advocate for transfer and registration, follow it "
            "through the offices, and bring back what proves it completed\n"
            "- We close out with a dated, indexed pack: what was checked, what was obtained, "
            "and what remains open\n\n"
            "## What this saves you from\n\n"
            "- A forged or altered title, and the criminal exposure that comes with buying "
            "under one\n"
            "- Land sold twice, or sold by someone who never had it to sell\n"
            "- A purchase a family can unwind years later because the required consent was "
            "never taken\n"
            "- A plot you cannot mortgage, develop or resell because the paperwork will not "
            "stand up\n"
            "- Penalties, back duty and demurrage at the offices when a missed step is only "
            "found at transfer\n"
            "- The embarrassment of explaining, in front of a bank or a court, that nobody "
            "checked\n\n"
            "## Where our role stops\n\n"
            "We prepare, verify, chase and hand over. The offices and the professionals do the "
            "parts the law reserves to them.\n\n"
            "- Registration, transfer and the issue of instruments belong to the land office "
            "and a licensed advocate\n"
            "- Valuation for a bank belongs to a registered valuer\n"
            "- Beacons and boundary plans belong to a licensed surveyor\n"
            "- Where a document cannot be verified we say the transaction should stop, "
            "whatever it costs us in instruction"
        ),
        "highlights": [
            "Official search applications prepared and chased at the land office",
            "Verification of titles, indentures, partition agreements and letters of administration",
            "Chain-of-ownership review, with caveats and encumbrances identified",
            "Consent requirements on customary, family and married-occupation land",
            "Duty, valuation and registration steps prepared and tracked",
            "Transfer, mutation and partition applications assembled and followed through",
            "Sale agreements and offer letters prepared and reviewed before signature",
            "A completion document pack, indexed, dated and handed over",
        ],
        "limitations": (
            "We are not a land registry, a surveyor or an advocate, and we do not hold or issue "
            "the records themselves. Official searches, title verification, valuation for transfer "
            "and registration are done by the land office, a licensed surveyor, a registered "
            "valuer and a licensed advocate. We prepare the file, follow it up and report "
            "exactly what has and has not been proven; we cannot guarantee what an office "
            "decides or how long it takes."
        ),
        "image_alt": "Illustrative artwork — land transaction file, agreements and forms",
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
        parser.add_argument(
            "--update",
            action="store_true",
            help="Refresh existing rows from this file, matched by slug. Overwrites any copy, "
                 "picture choice or unpublish an administrator made, so use it deliberately.",
        )

    @transaction.atomic
    def handle(self, *args, **options):
        created, existing, updated = [], [], []
        for position, payload in enumerate(SERVICES, start=1):
            # An explicit "order" wins over file position, so the published sequence can put
            # debt recovery last while the payloads stay grouped the way they were written.
            fields = dict(payload, order=payload.get("order", position), is_published=True)
            if not options["update"]:
                if Service.objects.filter(name=payload["name"]).exists():
                    existing.append(payload["name"])
                    continue
                service = Service.objects.create(**fields)
                created.append(service.name)
            else:
                # Matched by slug, because --update is how a rename is applied to a live database.
                service = Service.objects.filter(slug=payload["slug"]).first()
                if service is None:
                    service = Service.objects.create(**fields)
                    created.append(service.name)
                else:
                    for key, value in fields.items():
                        setattr(service, key, value)
                    service.save()
                    updated.append(service.name)
            if options["with_images"] and not service.image:
                service.image = _placeholder(service)
                service.save(update_fields=["image"])

        if not options["verbosity"]:
            return
        verb = "created" if not options["update"] else "created or refreshed"
        self.stdout.write(self.style.SUCCESS(
            f"{len(created) + len(updated)} service(s) {verb}, {len(existing)} already existed "
            "and were left untouched."
        ))
        for name in created:
            self.stdout.write(f"  + {name}")
        for name in updated:
            self.stdout.write(f"  ~ {name}")
        for name in existing:
            self.stdout.write(f"  = {name}")
        if not Service.objects.published().exists():
            self.stdout.write(self.style.WARNING("No published services — publish them in the admin."))
