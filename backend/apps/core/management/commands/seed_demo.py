"""Seed a fresh database with a realistic Mant Bridges LTD demo dataset.

Run it as many times as you like: every record is looked up by a natural key
first, so re-running only fills in whatever is missing.
"""
from datetime import timedelta
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from apps.accounts.models import Role, User
from apps.billing.models import Invoice, Payment, Receipt
from apps.billing.services import daily_maintenance, generate_invoices_for_lease
from apps.blog.models import Category, Post
from apps.core.models import Company
from apps.core.services.placeholders import PALETTES, placeholder_image
from apps.leases.models import Lease, add_months
from apps.messaging.models import Conversation
from apps.messaging.services import get_or_create_conversation, post_message
from apps.properties.models import Enquiry, Property, PropertyImage

DEFAULT_PASSWORD = "MantDemo@2026"

COMPANY = {
    "name": "Mant Bridges LTD",
    "legal_name": "Mant Bridges Limited",
    "tagline": "Bridging gaps",
    "about": (
        "Mant Bridges is located in Kampala, operating in Kampala, Wakiso, Mukono, Masaka and "
        "all major cities of Uganda.\n\n"
        "We do rent collection and property management, real estate, contracting and lobbying, "
        "debt recovery, and land and property documentation. We also list verified apartments, "
        "family houses, offices, shops, warehouses and land, and we stay with the transaction "
        "long after the keys change hands.\n\n"
        "Landlords get a property that is answered for: rent arriving on the date it was "
        "agreed, faults closed while they are still small, and a position they can plan an "
        "investment around. Tenants get a working agreement, a proper handover and a direct "
        "line to the office for maintenance, documents and queries."
    ),
    "email": "mantbridgesltd@gmail.com",
    "phone": "+256 752629260",
    "alt_phone": "+256 788075365",
    "phone_3": "+256 77718484",
    "address": "Cham Towers, Kampala Road",
    "city": "Kampala",
    "country": "Uganda",
    "website": "https://mantbridgesltd.online",
    "currency": "UGX",
    "currency_symbol": "UGX",
    "invoice_prefix": "MB-INV",
    "receipt_prefix": "MB-RCP",
    "lease_prefix": "MB-LSE",
    "payment_prefix": "MB-PAY",
    "grace_period_days": 5,
    "late_fee_type": Company.PERCENT,
    "late_fee_percent": Decimal("5"),
    "late_fee_flat": Decimal("0"),
    "bank_name": "Stanbic Bank Uganda",
    "bank_account_name": "Mant Bridges Limited",
    "bank_account_number": "9030 0123 4567 8",
    "bank_branch": "Kampala Road Branch",
    "mobile_money_number": "0700 123 456 (MTN Mobile Money)",
    "payment_instructions": (
        "Quote the invoice number on every payment. Mobile money payments are confirmed "
        "within one working day and the receipt is issued automatically."
    ),
}

USERS = [
    {
        "email": "admin@mantbridges.com", "first_name": "Sarah", "last_name": "Nakato",
        "role": Role.ADMIN, "phone": "+256 700 100 201", "city": "Kampala",
        "country": "Uganda", "is_verified": True, "superuser": True,
        "organisation": "Mant Bridges LTD",
    },
    {
        "email": "ops@mantbridges.com", "first_name": "Brian", "last_name": "Okello",
        "role": Role.ADMIN, "phone": "+256 700 100 202", "city": "Kampala",
        "country": "Uganda", "is_verified": True, "organisation": "Mant Bridges LTD",
    },
    {
        "email": "landlord@mantbridges.com", "first_name": "Joseph", "last_name": "Ssebugwawo",
        "role": Role.LANDLORD, "phone": "+256 772 445 511", "city": "Kampala",
        "country": "Uganda", "is_verified": True, "organisation": "Ssebugwawo Estates",
        "national_id": "CM81002300ABCD", "tin_number": "1002345678",
    },
    {
        "email": "aisha@mantbridges.com", "first_name": "Aisha", "last_name": "Nabbanja",
        "role": Role.LANDLORD, "phone": "+256 752 338 902", "city": "Entebbe",
        "country": "Uganda", "is_verified": True, "organisation": "Nabbanja Properties",
        "national_id": "CM82045100EFGH", "tin_number": "1009988776",
    },
    {
        "email": "tenant@mantbridges.com", "first_name": "Peter", "last_name": "Mugisha",
        "role": Role.TENANT, "phone": "+256 704 771 220", "city": "Kampala",
        "country": "Uganda", "is_verified": True, "organisation": "Uganda Telecom Ltd",
    },
    {
        "email": "grace@mantbridges.com", "first_name": "Grace", "last_name": "Achieng",
        "role": Role.TENANT, "phone": "+256 781 660 118", "city": "Kampala",
        "country": "Uganda", "is_verified": True, "organisation": "Nile Beverages",
    },
    {
        "email": "david@mantbridges.com", "first_name": "David", "last_name": "Lubega",
        "role": Role.TENANT, "phone": "+256 776 220 904", "city": "Entebbe",
        "country": "Uganda", "is_verified": True,
    },
    {
        "email": "rhoda@mantbridges.com", "first_name": "Rhoda", "last_name": "Kyomuhendo",
        "role": Role.TENANT, "phone": "+256 700 815 336", "city": "Jinja",
        "country": "Uganda", "is_verified": True, "organisation": "Kyomuhendo Consulting",
    },
]

PROPERTIES = [
    {
        "owner": "landlord@mantbridges.com",
        "title": "Sunset Heights Two Bedroom Apartment",
        "property_type": "APARTMENT", "listing_type": "RENT",
        "price": Decimal("1800000"), "price_period": "MONTHLY", "negotiable": True,
        "service_charge": Decimal("150000"), "security_deposit": Decimal("1800000"),
        "bedrooms": 2, "bathrooms": 2, "parking_spaces": 1, "area": Decimal("96"),
        "furnishing": "SEMI", "year_built": 2019, "is_featured": True,
        "address": "Plot 21, Bukoto Street", "city": "Kampala", "district": "Kamwookya",
        "region": "Central", "latitude": Decimal("0.347596"), "longitude": Decimal("32.597080"),
        "amenities": ["Balcony", "CCTV Security", "Fitted Kitchen", "Hot Water",
                      "Internet / WiFi", "Lift / Elevator", "Parking", "Water Tank",
                      "Backup Generator", "Gated Compound"],
        "summary": "Bright two bedroom apartment on Bukoto Street with a balcony view over Kampala.",
        "description": (
            "A well finished two bedroom apartment on the third floor of Sunset Heights, a "
            "gated block a short drive from the Kampala city centre.\n\n"
            "Both bedrooms are en-suite capable, the open kitchen is fully fitted and the "
            "living area opens onto a wide balcony that catches the evening sun. The block "
            "runs on borehole water with a backup tank and generator, so supply is "
            "uninterrupted.\n\n"
            "Secure parking for one vehicle, CCTV in the common areas and a resident caretaker. "
            "The monthly service charge covers water, security, refuse collection and standby "
            "power."
        ),
    },
    {
        "owner": "landlord@mantbridges.com",
        "title": "Kololo Ridge Executive Villa",
        "property_type": "HOUSE", "listing_type": "RENT",
        "price": Decimal("6500000"), "price_period": "MONTHLY",
        "service_charge": Decimal("400000"), "security_deposit": Decimal("6500000"),
        "bedrooms": 4, "bathrooms": 4, "parking_spaces": 3, "area": Decimal("420"),
        "furnishing": "FURNISHED", "year_built": 2016, "is_featured": True,
        "address": "12 Acacia Avenue, Kololo", "city": "Kampala", "district": "Kololo",
        "region": "Central", "latitude": Decimal("0.334300"), "longitude": Decimal("32.590200"),
        "amenities": ["Air Conditioning", "Balcony", "CCTV Security", "En-suite Bathroom",
                      "Fitted Kitchen", "Furnished", "Garden", "Gated Compound", "Gym",
                      "Hot Water", "Internet / WiFi", "Parking", "Perimeter Wall",
                      "Swimming Pool", "Tiled Floors", "Backup Generator"],
        "summary": "Furnished four bedroom villa with a private garden, pool and staff quarters on Kololo.",
        "description": (
            "An executive four bedroom villa set in a mature garden on one of Kololo's quietest "
            "crescents. Designed for entertaining, with a double-height lounge, a formal dining "
            "room for ten and a covered terrace that runs the length of the house.\n\n"
            "All four bedrooms are en-suite and air conditioned, the main bedroom has a walk-in "
            "dressing room, and there is a separate study with its own entrance.\n\n"
            "The property includes staff quarters, a three car garage, a swimming pool, a small "
            "gym and full perimeter security with an electric fence and CCTV."
        ),
    },
    {
        "owner": "landlord@mantbridges.com",
        "title": "Ntinda Gardens Three Bedroom Townhouse",
        "property_type": "TOWNHOUSE", "listing_type": "RENT",
        "price": Decimal("2600000"), "price_period": "MONTHLY",
        "service_charge": Decimal("200000"), "security_deposit": Decimal("2600000"),
        "bedrooms": 3, "bathrooms": 3, "parking_spaces": 2, "area": Decimal("180"),
        "furnishing": "UNFURNISHED", "year_built": 2020,
        "address": "Plot 8, Ntinda-Kisaasi Road", "city": "Kampala", "district": "Ntinda",
        "region": "Central", "latitude": Decimal("0.358900"), "longitude": Decimal("32.608100"),
        "amenities": ["Balcony", "CCTV Security", "Carpeted Floors", "Fitted Kitchen",
                      "Garden", "Gated Compound", "Hot Water", "Internet / WiFi", "Parking",
                      "Water Tank"],
        "summary": "Three bedroom townhouse in a small gated cluster close to Ntinda trading centre.",
        "description": (
            "A three bedroom townhouse in a cluster of six units behind a single controlled "
            "gate. The ground floor holds the lounge, a guest cloakroom and a fitted kitchen "
            "with a utility room and a small walled garden at the back.\n\n"
            "Upstairs there are three bedrooms, two of them en-suite, plus a family bathroom. "
            "Unfurnished and available on a twelve month term, billed quarterly.\n\n"
            "Two minutes from Ntinda trading centre, ten minutes from the city centre outside "
            "peak hours."
        ),
    },
    {
        "owner": "aisha@mantbridges.com",
        "title": "Victoria Lakeview Studio Apartment",
        "property_type": "STUDIO", "listing_type": "RENT",
        "price": Decimal("950000"), "price_period": "MONTHLY",
        "service_charge": Decimal("80000"), "security_deposit": Decimal("950000"),
        "bedrooms": 1, "bathrooms": 1, "parking_spaces": 1, "area": Decimal("42"),
        "furnishing": "FURNISHED", "year_built": 2021, "is_featured": True,
        "address": "Plot 5, Lakeview Crescent", "city": "Entebbe", "district": "Entebbe Municipality",
        "region": "Central", "latitude": Decimal("0.051200"), "longitude": Decimal("32.463700"),
        "amenities": ["Air Conditioning", "Balcony", "CCTV Security", "Fitted Kitchen",
                      "Furnished", "Hot Water", "Internet / WiFi", "Parking", "Water Tank",
                      "Wheelchair Access"],
        "summary": "Furnished studio five minutes from Entebbe town with a partial view of Lake Victoria.",
        "description": (
            "A compact furnished studio ideal for a single professional or a frequent traveller "
            "into Entebbe. The room is zoned into sleeping, working and living areas, with a "
            "kitchenette, an en-suite shower room and a private balcony.\n\n"
            "Rent includes furniture, a fridge, a microwave, a smart television and unlimited "
            "WiFi. Water and security are covered by the service charge.\n\n"
            "Five minutes from Entebbe town, fifteen minutes from the airport."
        ),
    },
    {
        "owner": "aisha@mantbridges.com",
        "title": "Kira Road Retail Shop Unit",
        "property_type": "SHOP", "listing_type": "RENT",
        "price": Decimal("1200000"), "price_period": "MONTHLY",
        "service_charge": Decimal("100000"), "security_deposit": Decimal("2400000"),
        "bedrooms": 0, "bathrooms": 1, "parking_spaces": 0, "area": Decimal("55"),
        "furnishing": "UNFURNISHED", "year_built": 2018,
        "address": "Plot 214, Kira Road", "city": "Kampala", "district": "Kamwokya",
        "region": "Central", "latitude": Decimal("0.344200"), "longitude": Decimal("32.600500"),
        "amenities": ["CCTV Security", "Gated Compound", "Internet / WiFi", "Perimeter Wall",
                      "Tiled Floors", "Wheelchair Access"],
        "summary": "Street-front retail unit on Kira Road with heavy daily foot traffic.",
        "description": (
            "A 55 square metre retail unit with a six metre frontage directly on Kira Road, "
            "one of Kampala's busiest commuter routes. Suitable for a pharmacy, salon, "
            "telecom shop or fast-moving consumer goods outlet.\n\n"
            "The unit has tiled floors, a roller shutter, a rear service door and its own "
            "washroom. Signage space is available on the facade.\n\n"
            "A two month deposit is required and a minimum term of two years is preferred."
        ),
    },
    {
        "owner": "aisha@mantbridges.com",
        "title": "Bugolobi Business Park Office Suite",
        "property_type": "OFFICE", "listing_type": "RENT",
        "price": Decimal("3400000"), "price_period": "MONTHLY",
        "service_charge": Decimal("600000"), "security_deposit": Decimal("3400000"),
        "bedrooms": 0, "bathrooms": 2, "parking_spaces": 6, "area": Decimal("210"),
        "furnishing": "SEMI", "year_built": 2017,
        "address": "Bugolobi Business Park, Block C", "city": "Kampala",
        "district": "Bugolobi", "region": "Central",
        "latitude": Decimal("0.324600"), "longitude": Decimal("32.618900"),
        "amenities": ["Air Conditioning", "Backup Generator", "CCTV Security",
                      "Internet / WiFi", "Lift / Elevator", "Parking", "Wheelchair Access",
                      "Hot Water", "Gated Compound"],
        "summary": "210 sqm open-plan office with six parking bays in a managed business park.",
        "description": (
            "A 210 square metre open-plan suite on the second floor of Block C, served by a "
            "passenger lift and a stairwell. The layout currently provides a reception area, "
            "an open working floor, two private offices, a boardroom and a server cupboard.\n\n"
            "Air conditioning throughout, structured cabling, fibre internet and 24 hour "
            "security. Backup power covers the common areas and the lift.\n\n"
            "Six allocated parking bays with additional visitor parking in front of the block."
        ),
    },
    {
        "owner": "landlord@mantbridges.com",
        "title": "Gayaza Four Bedroom Family House For Sale",
        "property_type": "HOUSE", "listing_type": "SALE",
        "price": Decimal("380000000"), "price_period": "ONE_OFF",
        "bedrooms": 4, "bathrooms": 3, "parking_spaces": 2, "area": Decimal("300"),
        "furnishing": "UNFURNISHED", "year_built": 2013, "negotiable": True,
        "address": "Kasangati Road, Gayaza", "city": "Wakiso", "district": "Kasangati",
        "region": "Central", "latitude": Decimal("0.456700"), "longitude": Decimal("32.601200"),
        "amenities": ["Borehole Water", "Garden", "Gated Compound", "Hot Water",
                      "Parking", "Perimeter Wall", "Water Tank", "Backup Generator"],
        "summary": "Family house on a three quarter acre title with a walled compound and mature garden.",
        "description": (
            "A four bedroom family house on a 0.75 acre plot with a mailo title, seven "
            "kilometres past the Gayaza trading centre.\n\n"
            "The house has a large lounge with a fireplace, a separate dining room, a fitted "
            "kitchen with a store, and four bedrooms sharing three bathrooms. There is a "
            "self-contained guest wing at the rear and quarters for two staff.\n\n"
            "The compound is walled, gated and planted with mature fruit trees. Water comes "
            "from a borehole with a 5,000 litre tank and a pump house. Price is negotiable "
            "for a cash buyer."
        ),
    },
    {
        "owner": "aisha@mantbridges.com",
        "title": "Muyenga Hilltop Penthouse For Sale",
        "property_type": "APARTMENT", "listing_type": "SALE",
        "price": Decimal("720000000"), "price_period": "ONE_OFF",
        "bedrooms": 3, "bathrooms": 3, "parking_spaces": 2, "area": Decimal("260"),
        "furnishing": "FURNISHED", "year_built": 2022, "is_featured": True,
        "address": "Muyenga Hill, Apartment 12A", "city": "Kampala", "district": "Muyenga",
        "region": "Central", "latitude": Decimal("0.326800"), "longitude": Decimal("32.604400"),
        "amenities": ["Air Conditioning", "Balcony", "CCTV Security", "En-suite Bathroom",
                      "Fitted Kitchen", "Furnished", "Gym", "Hot Water", "Internet / WiFi",
                      "Lift / Elevator", "Parking", "Swimming Pool", "Tiled Floors"],
        "summary": "Top-floor penthouse with a wraparound terrace and views across Lake Victoria.",
        "description": (
            "A 260 square metre penthouse occupying the whole of the top floor, with a "
            "wraparound terrace that looks out over Kololo, Ggaba and Lake Victoria.\n\n"
            "Three en-suite bedrooms, a guest cloakroom, an open kitchen with a breakfast "
            "island and a separate laundry. Sold furnished to a high specification.\n\n"
            "The development offers a swimming pool, a gym, a lift, standby power and 24 hour "
            "manned security. Two covered parking bays and a store room are included in the "
            "sale."
        ),
    },
    {
        "owner": "landlord@mantbridges.com",
        "title": "Jinja Industrial Warehouse 1,200 sqm",
        "property_type": "WAREHOUSE", "listing_type": "RENT",
        "price": Decimal("4800000"), "price_period": "MONTHLY",
        "service_charge": Decimal("350000"), "security_deposit": Decimal("4800000"),
        "bedrooms": 0, "bathrooms": 2, "parking_spaces": 8, "area": Decimal("1200"),
        "furnishing": "UNFURNISHED", "year_built": 2015,
        "address": "Plot 44, Industrial Area, Jinja", "city": "Jinja",
        "district": "Jinja Municipality", "region": "Eastern",
        "latitude": Decimal("0.447900"), "longitude": Decimal("33.202600"),
        "amenities": ["CCTV Security", "Gated Compound", "Internet / WiFi", "Parking",
                      "Perimeter Wall", "Water Tank", "Backup Generator"],
        "summary": "Clear-span warehouse with a covered loading bay and a hard-standing yard.",
        "description": (
            "A 1,200 square metre clear-span warehouse with a six metre clear height, a "
            "reinforced concrete floor rated for forklift traffic and a covered loading bay "
            "that takes a 40 foot container.\n\n"
            "Two offices, two washrooms and a store are built into the front of the unit. "
            "The hard-standing yard at the side gives room for eight trucks to manoeuvre.\n\n"
            "Three phase power is connected and the estate has a shared standby generator, "
            "perimeter wall and 24 hour security."
        ),
    },
    {
        "owner": "landlord@mantbridges.com",
        "title": "Kyanja Prime Residential Plot",
        "property_type": "LAND", "listing_type": "SALE",
        "price": Decimal("260000000"), "price_period": "ONE_OFF", "negotiable": True,
        "bedrooms": 0, "bathrooms": 0, "parking_spaces": 0, "area": Decimal("1012"),
        "area_unit": "sqm",
        "address": "Plot 312, Kyanja", "city": "Kampala", "district": "Kyanja",
        "region": "Central", "latitude": Decimal("0.291400"), "longitude": Decimal("32.633100"),
        "amenities": ["Perimeter Wall", "Water Tank", "Internet / WiFi"],
        "summary": "25 by 40 metre residential plot with a mailo title on a tarmacked road.",
        "description": (
            "A 25 by 40 metre residential plot on a tarmacked access road in Kyanja, with a "
            "mailo title ready for transfer.\n\n"
            "The plot is fenced on three sides, level and drained, with municipal water and "
            "UMEME power at the boundary. Approved plans for a four bedroom maisonette can be "
            "transferred to the buyer.\n\n"
            "Ideal for a family home or a small apartment development. Serious buyers can "
            "arrange a viewing through the Mant Bridges office."
        ),
    },
]

CATEGORIES = [
    {"name": "Market Insights", "description": "What is happening with rent and property prices in Uganda."},
    {"name": "Renting Tips", "description": "Practical advice for tenants and first-time renters."},
    {"name": "Buying Guide", "description": "Land titles, due diligence and how to buy safely."},
    {"name": "Landlord Desk", "description": "Managing property, tenants and rent collection."},
    {"name": "Company News", "description": "Updates from Mant Bridges LTD."},
]

POSTS = [
    {
        "title": "What Kampala Rent Actually Costs In 2026",
        "category": "Market Insights",
        "author": "admin@mantbridges.com",
        "tags": ["rent", "kampala", "market", "prices"],
        "is_featured": True,
        "excerpt": (
            "A plain-language look at what tenants pay for a studio, a two bedroom and an "
            "executive house in Kampala's main suburbs, and what moves the number."
        ),
        "content": (
            "Rent in Kampala is not one market, it is a dozen small ones. A tenant moving from "
            "Ntinda to Najjera can halve their monthly payment for the same number of rooms, "
            "while a move from Kololo to Muyenga may change very little.\n\n"
            "Broadly, studios in Entebbe and the outer Kampala suburbs sit between UGX 400,000 "
            "and UGX 900,000 a month. Two bedroom apartments in established suburbs such as "
            "Bukoto, Ntinda, Kyanja and Bugolobi run from UGX 1,200,000 to UGX 2,500,000, "
            "depending on finishing and whether the block has a lift, standby power and a "
            "borehole.\n\n"
            "Three and four bedroom detached houses start around UGX 2,500,000 in the middle "
            "suburbs and rise past UGX 6,000,000 in Kololo, Nakasero and Muyenga, where "
            "expatriate demand and large plots keep prices high.\n\n"
            "Three things move the number more than anything else: reliable water, standby "
            "power, and the condition of the access road. A unit with a borehole and a "
            "generator will command a premium of fifteen to twenty five percent over an "
            "identical unit without them.\n\n"
            "Always ask whether the quoted figure includes the service charge. At Mant Bridges "
            "we publish rent and service charge separately on every listing, so you can "
            "compare like with like."
        ),
    },
    {
        "title": "Reading A Tenancy Agreement Without A Lawyer",
        "category": "Renting Tips",
        "author": "admin@mantbridges.com",
        "tags": ["tenancy", "agreement", "legal", "deposit"],
        "is_featured": True,
        "excerpt": (
            "The eight clauses that decide whether a tenancy runs smoothly, explained in "
            "ordinary language."
        ),
        "content": (
            "You do not need a lawyer to read a tenancy agreement, but you do need to read it. "
            "Most disputes we resolve at Mant Bridges turn on clauses the tenant skimmed past.\n\n"
            "Start with the term. Confirm the start date, the end date and what happens when "
            "the term expires. A clause that renews automatically for another year unless you "
            "give notice is common and is not a problem, provided you know the notice period.\n\n"
            "Next, the rent and the due date. The agreement should state the amount, the "
            "currency, the day of the month it falls due, and how it may be increased. An "
            "increase clause should be capped, for example not more than ten percent per year, "
            "and should require written notice.\n\n"
            "Then the deposit. It must say what the deposit covers, when it is returned and "
            "what deductions are permitted. Insist on a joint inspection and a written "
            "condition report at handover.\n\n"
            "After that come repairs, who pays for what, quiet enjoyment, subletting, and "
            "termination. Read the termination clause twice: it should be symmetrical, giving "
            "both you and the landlord the same notice period.\n\n"
            "Finally, look for a late payment fee. It should be a fixed percentage or a fixed "
            "amount, charged once, with a grace period. If the agreement is vague about this, "
            "ask for it to be written down before you sign."
        ),
    },
    {
        "title": "Mailo, Leasehold And Freehold: What A Buyer Must Verify",
        "category": "Buying Guide",
        "author": "ops@mantbridges.com",
        "tags": ["titles", "mailo", "due diligence", "buying"],
        "excerpt": (
            "Before you pay a deposit, these are the searches and questions that protect you "
            "from buying a dispute."
        ),
        "content": (
            "Ugandan land can be held as mailo, freehold, leasehold or customary tenure, and "
            "the type of tenure changes what you are actually buying.\n\n"
            "Mailo is the most common tenure in Buganda and the one that causes the most "
            "trouble for unwary buyers, because a mailo owner's title can coexist "
            "with the registered rights of lawful or bona fide occupants. Always ask whether "
            "there are occupants on the land and obtain their written consent or a clear "
            "agreement on relocation.\n\n"
            "Run a title search at the land registry. It costs very little and confirms the "
            "registered proprietor, the exact area, and whether there are encumbrances, "
            "mortgages or caveats.\n\n"
            "Then confirm the boundaries on the ground with a licensed surveyor. Compare the "
            "mutation form and the diagram to what the seller is showing you.\n\n"
            "Ask for the seller's identification, the rates clearance from the local "
            "authority and, where relevant, the ground rent clearance. Pay through a bank "
            "transfer into an account in the registered proprietor's name, never in cash, and "
            "have a sale agreement witnessed before money moves."
        ),
    },
    {
        "title": "How Mant Bridges Handles Rent Collection",
        "category": "Landlord Desk",
        "author": "admin@mantbridges.com",
        "tags": ["rent collection", "receipts", "arrears", "landlords"],
        "is_featured": True,
        "excerpt": (
            "Invoices, receipts, late fees and arrears reporting: the exact process our rent "
            "desk follows every month."
        ),
        "content": (
            "Rent collection is where most landlord-tenant relationships either hold together "
            "or fall apart. Our process is deliberately boring, because boring is what keeps "
            "both sides calm.\n\n"
            "Every tenancy is recorded as a lease in the system with a start date, an end "
            "date, the monthly rent, any service charge and the day of the month rent falls "
            "due. The system generates an invoice for each billing period automatically, "
            "numbered MB-INV-YEAR-SEQUENCE, and emails are not needed for the tenant to see "
            "it: the invoice appears in their portal.\n\n"
            "Payments are recorded in cash, by bank transfer or by mobile money. A payment "
            "starts as pending. Once our rent desk matches it to a bank statement or a mobile "
            "money transaction, it is confirmed, and confirming it issues a numbered receipt "
            "with a downloadable PDF.\n\n"
            "If a payment is recorded in error, voiding the receipt reverses it cleanly: the "
            "receipt is stamped VOID, the payment is rejected and the invoice balance "
            "recalculates. Nothing is ever silently deleted.\n\n"
            "Late fees follow the policy written into the lease. There is a grace period, then "
            "a single fee, either a flat amount or a percentage of the monthly rent. The fee "
            "is charged once per invoice, not daily.\n\n"
            "Landlords see all of this on their dashboard: billed, collected, outstanding, an "
            "ageing breakdown of arrears and a month by month collection chart."
        ),
    },
    {
        "title": "Five Questions To Ask At A Property Viewing",
        "category": "Renting Tips",
        "author": "ops@mantbridges.com",
        "tags": ["viewing", "tenants", "checklist"],
        "excerpt": (
            "Photographs sell a property. These questions tell you what it is like to live "
            "in one."
        ),
        "content": (
            "A viewing usually lasts twenty minutes. Use them well.\n\n"
            "First: where does the water come from, and what happens when the supply is cut? "
            "Ask to see the tank, the pump and the borehole. In Kampala this single question "
            "predicts your comfort more reliably than the finish of the tiles.\n\n"
            "Second: is there standby power, and what does it actually carry? A generator that "
            "runs the lift and the corridor lights is not the same as one that runs your "
            "fridge.\n\n"
            "Third: what is included in the service charge? Get the list in writing.\n\n"
            "Fourth: turn on the taps and flush the toilet. Check the water pressure, look "
            "under the sink for staining, and open the windows to see how much noise comes in "
            "from the road.\n\n"
            "Fifth: ask who to call when something breaks, and how quickly they respond. If "
            "the agent cannot answer that, you have your answer."
        ),
    },
    {
        "title": "Mant Bridges Opens A Dedicated Rent Desk",
        "category": "Company News",
        "author": "admin@mantbridges.com",
        "tags": ["company", "rent desk", "receipts"],
        "excerpt": (
            "Our new rent desk issues a numbered receipt for every payment and gives tenants "
            "and landlords the same live view of the ledger."
        ),
        "content": (
            "From this month, every tenancy managed by Mant Bridges moves onto our new rent "
            "desk.\n\n"
            "Tenants can log in to see their invoices, record a payment, and download a "
            "receipt the moment the payment is confirmed. Landlords see the same ledger from "
            "their side, together with arrears ageing and collection performance across their "
            "portfolio.\n\n"
            "Both sides can message the administration team directly from the dashboard, and "
            "those messages are attached to the tenancy so that whoever picks up the "
            "conversation next can see the history.\n\n"
            "If you would like your property moved onto the rent desk, contact us and we will "
            "arrange the handover."
        ),
    },
]

LEASES = [
    {
        "property": "Sunset Heights Two Bedroom Apartment",
        "tenant": "tenant@mantbridges.com", "landlord": "landlord@mantbridges.com",
        "months_ago": 8, "term_months": 12, "due_day_of_month": 5,
        "billing_frequency": Lease.BillingFrequency.MONTHLY,
        "monthly_rent": Decimal("1800000"), "service_charge": Decimal("150000"),
        "security_deposit": Decimal("1800000"),
        "late_fee_type": Lease.LateFeePolicy.INHERIT,
        "terms": "Twelve month residential tenancy, renewable by written agreement.",
    },
    {
        "property": "Ntinda Gardens Three Bedroom Townhouse",
        "tenant": "grace@mantbridges.com", "landlord": "landlord@mantbridges.com",
        "months_ago": 14, "term_months": 24, "due_day_of_month": 1,
        "billing_frequency": Lease.BillingFrequency.QUARTERLY,
        "monthly_rent": Decimal("2600000"), "service_charge": Decimal("200000"),
        "security_deposit": Decimal("2600000"),
        "late_fee_type": Lease.LateFeePolicy.FLAT, "late_fee_flat": Decimal("100000"),
        "terms": "Twenty four month tenancy billed quarterly in advance.",
    },
    {
        "property": "Victoria Lakeview Studio Apartment",
        "tenant": "david@mantbridges.com", "landlord": "aisha@mantbridges.com",
        "months_ago": 4, "term_months": 12, "due_day_of_month": 10,
        "billing_frequency": Lease.BillingFrequency.MONTHLY,
        "monthly_rent": Decimal("950000"), "service_charge": Decimal("80000"),
        "security_deposit": Decimal("950000"),
        "late_fee_type": Lease.LateFeePolicy.FLAT, "late_fee_flat": Decimal("50000"),
        "terms": "Twelve month furnished studio tenancy including water and WiFi.",
    },
    {
        "property": "Bugolobi Business Park Office Suite",
        "tenant": "rhoda@mantbridges.com", "landlord": "aisha@mantbridges.com",
        "months_ago": 19, "term_months": 36, "due_day_of_month": 7,
        "billing_frequency": Lease.BillingFrequency.QUARTERLY,
        "monthly_rent": Decimal("3400000"), "service_charge": Decimal("600000"),
        "security_deposit": Decimal("3400000"),
        "late_fee_type": Lease.LateFeePolicy.PERCENT, "late_fee_percent": Decimal("7.5"),
        "terms": "Thirty six month commercial lease, rent reviewed annually by agreement.",
    },
]

CONVERSATIONS = [
    {
        "from": "tenant@mantbridges.com", "to": "admin@mantbridges.com",
        "subject": "Leaking pipe under the kitchen sink",
        "category": Conversation.Category.MAINTENANCE,
        "property": "Sunset Heights Two Bedroom Apartment",
        "messages": [
            ("tenant@mantbridges.com",
             "Good morning. Water is pooling under the kitchen sink in apartment 3B at Sunset "
             "Heights. I have closed the isolation valve but the cupboard floor is swollen. "
             "Can someone come and look at it this week?"),
            ("admin@mantbridges.com",
             "Thank you for reporting this, Peter, and for closing the valve. I have raised a "
             "maintenance call with the landlord and the plumber will attend tomorrow between "
             "10:00 and 12:00. Please leave the valve closed until then."),
            ("tenant@mantbridges.com",
             "Perfect, I will be at home. Do I need to move anything out of the cupboard?"),
            ("admin@mantbridges.com",
             "Just clear the cleaning supplies so he can reach the pipework. Anything damaged "
             "will be assessed and the landlord is liable for the repair under your tenancy."),
        ],
    },
    {
        "from": "landlord@mantbridges.com", "to": "admin@mantbridges.com",
        "subject": "Rent collection statement for Sunset Heights",
        "category": Conversation.Category.RENT,
        "messages": [
            ("landlord@mantbridges.com",
             "Sarah, could I get a statement for Sunset Heights covering this year so far? I "
             "need it for my accountant before the end of the month."),
            ("admin@mantbridges.com",
             "Certainly, Joseph. The statement is available in your dashboard under Rent > "
             "Statements. Filter by the property and it will show every invoice and every "
             "confirmed receipt with a running balance. Your collection rate for the period is "
             "shown at the top of the page."),
            ("landlord@mantbridges.com",
             "Found it, that is exactly what I needed. One invoice still shows as overdue, is "
             "that correct?"),
            ("admin@mantbridges.com",
             "Yes. The tenant has paid part of it and we are chasing the balance. A reminder "
             "went out from the platform last week and a late fee will apply once the grace "
             "period ends. I will let you know as soon as it clears."),
        ],
    },
    {
        "from": "grace@mantbridges.com", "to": "ops@mantbridges.com",
        "subject": "Copy of my receipt for the quarterly payment",
        "category": Conversation.Category.DOCUMENTS,
        "property": "Ntinda Gardens Three Bedroom Townhouse",
        "messages": [
            ("grace@mantbridges.com",
             "Hello. I paid the quarterly rent by bank transfer on the second of this month "
             "but I have not seen a receipt. My employer needs it for their records."),
            ("ops@mantbridges.com",
             "Hello Grace. The transfer matched on the third and the payment is confirmed. "
             "Your receipt is under Rent > Receipts in your dashboard - open it and click "
             "Download for the signed PDF. If it does not appear, tell me and I will reissue "
             "it."),
        ],
    },
    {
        "from": "admin@mantbridges.com", "to": "rhoda@mantbridges.com",
        "subject": "Renewal of your Bugolobi office lease",
        "category": Conversation.Category.GENERAL,
        "property": "Bugolobi Business Park Office Suite",
        "messages": [
            ("admin@mantbridges.com",
             "Dear Rhoda, your office lease at Bugolobi Business Park has about a year left to "
             "run. The landlord has asked whether you would like to open renewal discussions "
             "early, as there is interest in the block from other tenants."),
            ("rhoda@mantbridges.com",
             "Thank you for the heads up. We would like to renew, ideally on the same terms. "
             "What increase is the landlord proposing?"),
        ],
    },
]

ENQUIRIES = [
    {
        "name": "Moses Katende", "email": "moses.katende@example.com",
        "phone": "+256 703 118 442", "subject": "Viewing request - Kyanja plot",
        "message": ("I am interested in the 25 by 40 plot in Kyanja. Is the title available "
                    "for search, and can I view it on Saturday morning?"),
        "property": "Kyanja Prime Residential Plot",
    },
    {
        "name": "Lillian Auma", "email": "lillian.auma@example.com",
        "phone": "+256 772 660 019", "subject": "Budget for a two bedroom in Kampala",
        "message": ("My budget is UGX 1,500,000 a month including service charge. Which of "
                    "your two bedroom apartments would fit, and how soon could I move in?"),
        "property": None,
    },
    {
        "name": "Godfrey Ssendi", "email": "g.sendi@example.com",
        "phone": "+256 758 220 761", "subject": "Warehousing near the northern bypass",
        "message": ("We need 800 to 1,500 square metres of covered storage with yard space "
                    "for two trucks. Do you manage anything along the northern bypass or in "
                    "Ntinda industrial area?"),
        "property": None,
    },
]


class Command(BaseCommand):
    help = (
        "Create a complete Mant Bridges LTD demo dataset: company profile, users, properties "
        "with images, blog posts, leases, invoices, payments, receipts and conversations. "
        "Safe to run more than once."
    )

    METHODS = [Payment.Method.MOBILE_MONEY, Payment.Method.BANK_TRANSFER, Payment.Method.CASH]

    def add_arguments(self, parser):
        parser.add_argument(
            "--password", default=DEFAULT_PASSWORD,
            help=f"Password given to every demo account (default: {DEFAULT_PASSWORD}).",
        )
        parser.add_argument(
            "--no-images", action="store_true",
            help="Skip generating placeholder images (faster, but listings show no photo).",
        )

    def handle(self, *args, **options):
        self.password = options["password"]
        self.generate_images = not options["no_images"]
        self.counts = {
            "users": 0, "properties": 0, "images": 0, "posts": 0, "leases": 0,
            "invoices": 0, "payments": 0, "receipts": 0, "conversations": 0, "enquiries": 0,
        }

        with transaction.atomic():
            company = self.seed_company()
            users = self.seed_users()
            properties = self.seed_properties(users)
            self.seed_blog(users)
            leases = self.seed_leases(users)
            self.seed_payments(users["admin@mantbridges.com"], leases)
            self.seed_conversations(users, properties)
            self.seed_enquiries()
            maintenance = daily_maintenance()

        self.report(company, users, maintenance)

    # -- company and users -------------------------------------------------
    def seed_company(self):
        company = Company.load()
        for field, value in COMPANY.items():
            if getattr(company, field, None) in (None, "", []):
                setattr(company, field, value)
        company.save()
        self.stdout.write("  company profile updated (values already set were left alone)")
        return company

    def seed_users(self):
        users = {}
        for spec in USERS:
            email = spec["email"]
            fields = {key: value for key, value in spec.items()
                      if key not in ("email", "superuser")}
            user = User.objects.filter(email__iexact=email).first()
            if user is None:
                user = User.objects.create_user(email=email, password=self.password, **fields)
                self.counts["users"] += 1
            else:
                for key, value in fields.items():
                    setattr(user, key, value)
                user.save()
            if spec.get("superuser") and not user.is_superuser:
                user.is_superuser = True
                user.is_staff = True
                user.save()
            users[email] = user
        self.stdout.write(f"  users ready ({self.counts['users']} created)")
        return users

    # -- properties --------------------------------------------------------
    def seed_properties(self, users):
        properties = {}
        for index, spec in enumerate(PROPERTIES):
            owner = users[spec["owner"]]
            fields = {key: value for key, value in spec.items() if key != "owner"}
            title = fields.pop("title")
            prop, created = Property.objects.get_or_create(
                title=title, defaults={"owner": owner, **fields}
            )
            if not created:
                for key, value in fields.items():
                    setattr(prop, key, value)
                prop.owner = owner
                prop.save()
            else:
                self.counts["properties"] += 1
            properties[title] = prop
            if self.generate_images:
                self.counts["images"] += self.seed_property_images(prop, index)
        self.stdout.write(
            f"  properties ready ({self.counts['properties']} created, "
            f"{self.counts['images']} images)"
        )
        return properties

    def seed_property_images(self, prop, index):
        if PropertyImage.objects.filter(property=prop).exists():
            return 0
        captions = ["Front view", "Interior", "Fittings and finishes"]
        for position, caption in enumerate(captions):
            label = prop.title if position == 0 else f"{prop.title} - {caption}"
            content = placeholder_image(
                label,
                size=(1200, 800),
                palette=PALETTES[(index + position) % len(PALETTES)],
                tagline=f"{prop.reference or ''} | {prop.city}".strip(" |"),
            )
            image = PropertyImage(
                property=prop, caption=caption, alt_text=f"{prop.title}: {caption}",
                order=position, is_primary=position == 0,
            )
            image.image.save(f"{prop.slug}-{position + 1}.jpg", content, save=False)
            image.save()
        return len(captions)

    # -- blog --------------------------------------------------------------
    def seed_blog(self, users):
        categories = {
            spec["name"]: Category.objects.get_or_create(
                name=spec["name"], defaults={"description": spec["description"]}
            )[0]
            for spec in CATEGORIES
        }
        created = 0
        for index, spec in enumerate(POSTS):
            author = users[spec["author"]]
            fields = {
                "author": author,
                "category": categories.get(spec["category"]),
                "excerpt": spec["excerpt"],
                "content": spec["content"],
                "tags": spec["tags"],
                "is_featured": spec.get("is_featured", False),
                "status": Post.Status.PUBLISHED,
                "published_at": timezone.now() - timedelta(days=(len(POSTS) - index) * 6),
                "views": (len(POSTS) - index) * 37,
            }
            post, is_new = Post.objects.get_or_create(title=spec["title"], defaults=fields)
            if is_new:
                created += 1
                if self.generate_images and not post.cover_image:
                    post.cover_image.save(
                        f"{post.slug}.jpg",
                        placeholder_image(
                            post.title, size=(1200, 630),
                            palette=PALETTES[index % len(PALETTES)],
                            tagline="MANT BRIDGES LTD",
                        ),
                        save=False,
                    )
                    post.save()
            self.counts["posts"] += int(is_new)
        self.stdout.write(f"  blog ready ({created} posts created)")

    # -- tenancies and rent ------------------------------------------------
    def seed_leases(self, users):
        today = timezone.localdate()
        first_of_month = today.replace(day=1)
        leases = []
        for spec in LEASES:
            prop = Property.objects.filter(title=spec["property"]).first()
            if prop is None:
                self.stderr.write(f"  skipping lease: unknown property '{spec['property']}'")
                continue
            tenant = users[spec["tenant"]]
            landlord = users[spec["landlord"]]
            start_date = add_months(first_of_month, -spec["months_ago"])
            end_date = add_months(start_date, spec["term_months"]) - timedelta(days=1)

            lease = Lease.objects.filter(property=prop, tenant=tenant).first()
            if lease is None:
                lease = Lease(
                    property=prop, tenant=tenant, landlord=landlord,
                    created_by=users["admin@mantbridges.com"],
                    start_date=start_date, end_date=end_date,
                    monthly_rent=spec["monthly_rent"],
                    service_charge=spec["service_charge"],
                    security_deposit=spec["security_deposit"],
                    currency="UGX",
                    billing_frequency=spec["billing_frequency"],
                    due_day_of_month=spec["due_day_of_month"],
                    grace_period_days=5,
                    late_fee_type=spec.get("late_fee_type", Lease.LateFeePolicy.INHERIT),
                    late_fee_flat=spec.get("late_fee_flat", Decimal("0")),
                    late_fee_percent=spec.get("late_fee_percent", Decimal("0")),
                    status=Lease.Status.ACTIVE,
                    terms=spec["terms"],
                    notes="Created by the demo seed command.",
                )
                lease.save()
                self.counts["leases"] += 1

            horizon = add_months(today, 1)
            created = generate_invoices_for_lease(lease, horizon)
            self.counts["invoices"] += len(created)
            leases.append(lease)
        self.stdout.write(
            f"  tenancies ready ({self.counts['leases']} leases, "
            f"{self.counts['invoices']} invoices)"
        )
        return leases

    def seed_payments(self, admin, leases):
        """Settle the older invoices, leave one partly paid, one awaiting review, one open."""
        for number, lease in enumerate(leases):
            invoices = list(
                lease.invoices.order_by("period_start").select_related("property", "tenant")
            )
            if len(invoices) < 3:
                continue
            for index, invoice in enumerate(invoices[:-3]):
                self.record_payment(admin, lease, invoice, invoice.total,
                                    Payment.Status.CONFIRMED, index)
            self.record_payment(admin, lease, invoices[-3],
                                (invoices[-3].total / 2).quantize(Decimal("0.01")),
                                Payment.Status.CONFIRMED, 700 + number)
            if number < 2:
                self.record_payment(admin, lease, invoices[-2],
                                    (invoices[-2].total / 2).quantize(Decimal("0.01")),
                                    Payment.Status.PENDING, 900 + number)

        self.stdout.write(
            f"  payments ready ({self.counts['payments']} recorded, "
            f"{self.counts['receipts']} receipts issued)"
        )

    def record_payment(self, admin, lease, invoice, amount, status, position):
        if Payment.objects.filter(invoice=invoice).exists():
            return None
        method = self.METHODS[position % len(self.METHODS)]
        paid_on = max(invoice.due_date - timedelta(days=position % 3), invoice.period_start)
        if status == Payment.Status.PENDING:
            paid_on = min(invoice.due_date, timezone.localdate())
        payment = Payment(
            invoice=invoice, lease=lease, tenant=lease.tenant, amount=amount,
            currency=invoice.currency, method=method,
            reference=self.reference(method, paid_on, position),
            paid_on=paid_on, recorded_by=admin, status=status,
            notes=("Recorded by the Mant Bridges rent desk." if status
                   == Payment.Status.CONFIRMED else
                   "Awaiting confirmation against the mobile money statement."),
        )
        payment.save()
        self.counts["payments"] += 1
        if status == Payment.Status.CONFIRMED:
            payment.confirm(user=admin)
            self.counts["receipts"] += 1
        return payment

    @staticmethod
    def reference(method, paid_on, position):
        prefix = {
            Payment.Method.CASH: "CASH",
            Payment.Method.BANK_TRANSFER: "BTRF",
            Payment.Method.MOBILE_MONEY: "MTNMM",
        }.get(method, "REF")
        return f"{prefix}-{paid_on:%Y%m%d}-{position:04d}"

    # -- communication -----------------------------------------------------
    def seed_conversations(self, users, properties):
        for spec in CONVERSATIONS:
            if Conversation.objects.filter(subject=spec["subject"]).exists():
                continue
            created_by = users[spec["from"]]
            conversation = get_or_create_conversation(
                participants=[users[spec["from"]], users[spec["to"]]],
                subject=spec["subject"],
                created_by=created_by,
                property_obj=properties.get(spec.get("property")),
                category=spec["category"],
            )
            for sender_email, body in spec["messages"]:
                post_message(conversation, users[sender_email], body)
            self.counts["conversations"] += 1
        self.stdout.write(f"  conversations ready ({self.counts['conversations']} created)")

    def seed_enquiries(self):
        for spec in ENQUIRIES:
            prop = None
            if spec["property"]:
                prop = Property.objects.filter(title=spec["property"]).first()
            _, created = Enquiry.objects.get_or_create(
                email=spec["email"], subject=spec["subject"],
                defaults={
                    "name": spec["name"], "phone": spec["phone"],
                    "message": spec["message"], "property": prop,
                    "status": Enquiry.Status.NEW,
                },
            )
            self.counts["enquiries"] += int(created)
        self.stdout.write(f"  enquiries ready ({self.counts['enquiries']} created)")

    # -- summary -----------------------------------------------------------
    def report(self, company, users, maintenance):
        line = self.style.SUCCESS
        self.stdout.write("")
        self.stdout.write(line("Mant Bridges LTD demo data is ready."))
        self.stdout.write(
            f"  Currency {company.currency} | late fee {company.get_late_fee_type_display()}"
            f" {company.late_fee_percent}% after {company.grace_period_days} day(s) grace"
        )
        self.stdout.write(
            f"  {Property.objects.count()} properties | {Lease.objects.count()} tenancies | "
            f"{Invoice.objects.count()} invoices"
        )
        self.stdout.write(
            f"  {Payment.objects.filter(status=Payment.Status.CONFIRMED).count()} confirmed "
            f"payments | {Receipt.objects.filter(is_void=False).count()} receipts | "
            f"{Payment.objects.filter(status=Payment.Status.PENDING).count()} awaiting review"
        )
        self.stdout.write(
            f"  {maintenance['invoices_marked_overdue']} invoice(s) marked overdue, "
            f"{maintenance['late_fees_applied']} late fee(s) applied"
        )
        self.stdout.write("")
        self.stdout.write("  Sign in with any of these accounts:")
        for email in ("admin@mantbridges.com", "ops@mantbridges.com",
                      "landlord@mantbridges.com", "tenant@mantbridges.com"):
            user = users[email]
            self.stdout.write(
                f"    {user.get_role_display():<15} {email:<28} {self.password}"
            )
        self.stdout.write("")
        self.stdout.write("  admin@mantbridges.com is also a Django superuser, so "
                          "`createsuperuser` is not needed.")
