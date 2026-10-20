"""Rent collection engine.

Everything that involves arithmetic on rent lives here: billing schedules, late
fees, arrears, tenant statements and dashboard analytics. Views and management
commands are thin wrappers around these functions so the same rules apply no
matter how the operation is triggered.
"""
import calendar
from datetime import timedelta
from decimal import Decimal

from django.db.models import Count, F, Q, Sum
from django.utils import timezone

from apps.accounts.models import Role
from apps.billing.models import ZERO, Invoice, Payment
from apps.core.helpers import to_decimal
from apps.core.models import Company
from apps.leases.models import Lease, add_months
from apps.properties.models import Property

OUTSTANDING = F("total") - F("amount_paid")


# ---------------------------------------------------------------------------
# Billing schedules
# ---------------------------------------------------------------------------
def iter_periods(lease, horizon):
    """Yield (period_start, period_end) pairs from the lease start up to `horizon`."""
    step = lease.months_per_invoice
    start = lease.start_date
    while start <= horizon:
        end = add_months(start, step) - timedelta(days=1)
        if lease.end_date and end > lease.end_date:
            end = lease.end_date
        yield start, end
        if lease.end_date and end >= lease.end_date:
            break
        start = add_months(start, step)


def due_date_for(lease, period_start):
    day = min(
        lease.due_day_of_month or 1,
        calendar.monthrange(period_start.year, period_start.month)[1],
    )
    return max(period_start.replace(day=day), period_start)


def generate_invoices_for_lease(lease, horizon=None):
    """Create every missing invoice from the lease start up to `horizon` (default today)."""
    if not lease.start_date or not lease.end_date:
        return []
    today = timezone.localdate()
    horizon = min(horizon or today, lease.end_date)
    if horizon < lease.start_date:
        return []

    already_billed = set(
        Invoice.objects.filter(lease=lease)
        .exclude(status=Invoice.Status.CANCELLED)
        .values_list("period_start", flat=True)
    )
    created = []
    months = lease.months_per_invoice
    for period_start, period_end in iter_periods(lease, horizon):
        if period_start in already_billed:
            continue
        invoice = Invoice(
            lease=lease,
            property_id=lease.property_id,
            tenant_id=lease.tenant_id,
            landlord_id=lease.landlord_id,
            period_start=period_start,
            period_end=period_end,
            issue_date=period_start,
            due_date=due_date_for(lease, period_start),
            rent_amount=to_decimal(lease.monthly_rent) * months,
            service_charge=to_decimal(lease.service_charge) * months,
            currency=lease.currency,
            status=Invoice.Status.UNPAID,
        )
        invoice.save()
        created.append(invoice)
    return created


def generate_all_invoices(horizon=None):
    """Sweep every active lease. Safe to run repeatedly - existing periods are skipped."""
    leases = Lease.objects.filter(status=Lease.Status.ACTIVE).select_related(
        "property", "tenant", "landlord"
    )
    total = 0
    touched = 0
    for lease in leases:
        created = generate_invoices_for_lease(lease, horizon)
        if created:
            touched += 1
            total += len(created)
    return {"leases": touched, "invoices": total}


# ---------------------------------------------------------------------------
# Late fees and status sweeps
# ---------------------------------------------------------------------------
def late_fee_for(invoice, as_of=None):
    """One-off late fee, charged once the grace period has elapsed."""
    as_of = as_of or timezone.localdate()
    lease = invoice.lease
    if lease is None:
        return ZERO
    if invoice.status in (Invoice.Status.CANCELLED, Invoice.Status.DRAFT):
        return ZERO
    if invoice.balance <= ZERO:
        return ZERO
    if not invoice.due_date or as_of <= invoice.due_date:
        return ZERO

    policy = lease.late_fee_settings
    grace = policy["grace_period_days"] or 0
    if (as_of - invoice.due_date).days <= grace:
        return ZERO

    if policy["type"] == Company.PERCENT:
        base = to_decimal(invoice.rent_amount) or to_decimal(invoice.total)
        return (base * to_decimal(policy["percent"]) / Decimal("100")).quantize(
            Decimal("0.01")
        )
    if policy["type"] == Company.FLAT:
        return to_decimal(policy["flat"])
    return ZERO


def apply_late_fees(as_of=None, invoices=None):
    """Charge a late fee on overdue invoices that do not already carry one."""
    as_of = as_of or timezone.localdate()
    queryset = (
        invoices
        if invoices is not None
        else Invoice.objects.exclude(
            status__in=[Invoice.Status.CANCELLED, Invoice.Status.DRAFT]
        )
    )
    candidates = queryset.filter(
        due_date__lt=as_of, late_fee=0, total__gt=F("amount_paid")
    ).select_related("lease")
    updated = []
    for invoice in list(candidates):
        fee = late_fee_for(invoice, as_of)
        if fee > ZERO:
            invoice.late_fee = fee
            invoice.save()
            updated.append(invoice)
    return updated


def refresh_overdue_invoices(invoices=None, as_of=None):
    """Flip unpaid/partial invoices past their due date to OVERDUE."""
    today = as_of or timezone.localdate()
    queryset = invoices if invoices is not None else Invoice.objects.all()
    targets = queryset.exclude(
        status__in=[
            Invoice.Status.CANCELLED,
            Invoice.Status.DRAFT,
            Invoice.Status.PAID,
            Invoice.Status.OVERDUE,
        ]
    ).filter(due_date__lt=today, total__gt=F("amount_paid"))
    count = targets.count()
    targets.update(status=Invoice.Status.OVERDUE)
    return count


def expire_leases():
    today = timezone.localdate()
    expired = list(
        Lease.objects.filter(status=Lease.Status.ACTIVE, end_date__lt=today)
    )
    for lease in expired:
        lease.refresh_status()
    return len(expired)


def daily_maintenance(as_of=None):
    """Run the full nightly sweep: expire leases, mark overdue, apply late fees."""
    return {
        "leases_expired": expire_leases(),
        "invoices_marked_overdue": refresh_overdue_invoices(as_of=as_of),
        "late_fees_applied": len(apply_late_fees(as_of=as_of)),
    }


# ---------------------------------------------------------------------------
# Statements
# ---------------------------------------------------------------------------
def tenant_statement(invoices, payments, currency="UGX"):
    """Chronological ledger of charges and receipts with a running balance."""
    entries = []
    for invoice in invoices:
        entries.append({
            "date": invoice.issue_date,
            "type": "INVOICE",
            "reference": invoice.number,
            "description": f"Rent for {invoice.period_label}",
            "property": invoice.property.title if invoice.property_id else "",
            "debit": to_decimal(invoice.total),
            "credit": ZERO,
            "status": invoice.effective_status,
        })
    for payment in payments:
        receipt = getattr(payment, "receipt", None)
        entries.append({
            "date": payment.paid_on,
            "type": "PAYMENT",
            "reference": payment.number,
            "description": f"Payment received via {payment.get_method_display()}",
            "receipt": receipt.number if receipt else "",
            "debit": ZERO,
            "credit": to_decimal(payment.amount),
            "status": payment.status,
        })

    entries.sort(key=lambda entry: (entry["date"], 0 if entry["type"] == "INVOICE" else 1))
    running = ZERO
    for entry in entries:
        running += entry["debit"] - entry["credit"]
        entry["balance"] = running

    total_charged = sum((entry["debit"] for entry in entries), ZERO)
    total_paid = sum((entry["credit"] for entry in entries), ZERO)
    return {
        "entries": entries,
        "currency": currency,
        "totals": {
            "charged": total_charged,
            "paid": total_paid,
            "balance": total_charged - total_paid,
            "entries": len(entries),
        },
    }


# ---------------------------------------------------------------------------
# Analytics
# ---------------------------------------------------------------------------
def _aging_buckets(invoices, today):
    buckets = [
        ("not_due", "Not yet due", Q(due_date__gte=today)),
        ("days_1_30", "1 - 30 days", Q(due_date__lt=today, due_date__gte=today - timedelta(days=30))),
        ("days_31_60", "31 - 60 days", Q(due_date__lt=today - timedelta(days=30),
                                         due_date__gte=today - timedelta(days=60))),
        ("days_61_90", "61 - 90 days", Q(due_date__lt=today - timedelta(days=60),
                                         due_date__gte=today - timedelta(days=90))),
        ("over_90", "Over 90 days", Q(due_date__lt=today - timedelta(days=90))),
    ]
    base = invoices.exclude(status=Invoice.Status.CANCELLED).filter(total__gt=F("amount_paid"))
    result = []
    for key, label, condition in buckets:
        rows = base.filter(condition)
        result.append({
            "key": key,
            "label": label,
            "count": rows.count(),
            "amount": rows.aggregate(total=Sum(OUTSTANDING))["total"] or ZERO,
        })
    return result


def _monthly_series(invoices, payments, months):
    today = timezone.localdate()
    series = []
    for offset in range(months - 1, -1, -1):
        month_start = add_months(today.replace(day=1), -offset)
        month_end = add_months(month_start, 1) - timedelta(days=1)
        invoiced = invoices.filter(
            issue_date__gte=month_start, issue_date__lte=month_end
        ).exclude(status=Invoice.Status.CANCELLED).aggregate(total=Sum("total"))["total"] or ZERO
        collected = payments.filter(
            status=Payment.Status.CONFIRMED,
            paid_on__gte=month_start,
            paid_on__lte=month_end,
        ).aggregate(total=Sum("amount"))["total"] or ZERO
        series.append({
            "month": f"{month_start:%Y-%m}",
            "label": f"{month_start:%b %Y}",
            "invoiced": invoiced,
            "collected": collected,
        })
    return series


def rent_analytics(invoices, payments, leases=None, months=6):
    """Collection performance for whatever scope the caller provides."""
    today = timezone.localdate()
    billable = invoices.exclude(status=Invoice.Status.CANCELLED)

    invoiced_total = billable.aggregate(total=Sum("total"))["total"] or ZERO
    collected_total = payments.filter(status=Payment.Status.CONFIRMED).aggregate(
        total=Sum("amount")
    )["total"] or ZERO
    outstanding_total = billable.filter(total__gt=F("amount_paid")).aggregate(
        total=Sum(OUTSTANDING)
    )["total"] or ZERO
    overdue_rows = billable.filter(total__gt=F("amount_paid"), due_date__lt=today)

    collection_rate = (
        round(float(collected_total) / float(invoiced_total) * 100, 2)
        if invoiced_total else 0.0
    )

    status_counts = {
        "paid": billable.filter(total__lte=F("amount_paid")).count(),
        "overdue": overdue_rows.count(),
        "partial": billable.filter(
            total__gt=F("amount_paid"), amount_paid__gt=0, due_date__gte=today
        ).count(),
        "unpaid": billable.filter(
            total__gt=F("amount_paid"), amount_paid=0, due_date__gte=today
        ).count(),
        "draft": invoices.filter(status=Invoice.Status.DRAFT).count(),
        "cancelled": invoices.filter(status=Invoice.Status.CANCELLED).count(),
    }

    debtors = (
        overdue_rows.values(
            "tenant_id", "tenant__first_name", "tenant__last_name", "tenant__email",
            "tenant__phone",
        )
        .annotate(outstanding=Sum(OUTSTANDING), invoices=Count("id"))
        .order_by("-outstanding")[:10]
    )

    by_property = (
        overdue_rows.values("property_id", "property__title", "property__reference")
        .annotate(outstanding=Sum(OUTSTANDING), invoices=Count("id"))
        .order_by("-outstanding")[:10]
    )

    by_method = (
        payments.filter(status=Payment.Status.CONFIRMED)
        .values("method")
        .annotate(total=Sum("amount"), count=Count("id"))
        .order_by("-total")
    )

    payload = {
        "currency": Company.load().currency,
        "as_of": today.isoformat(),
        "totals": {
            "invoiced": invoiced_total,
            "collected": collected_total,
            "outstanding": outstanding_total,
            "overdue": overdue_rows.aggregate(total=Sum(OUTSTANDING))["total"] or ZERO,
            "collection_rate": collection_rate,
            "invoices": invoices.count(),
            "payments": payments.count(),
            "pending_payments": payments.filter(status=Payment.Status.PENDING).count(),
        },
        "status_counts": status_counts,
        "aging": _aging_buckets(invoices, today),
        "monthly": _monthly_series(invoices, payments, months),
        "top_debtors": [
            {
                "tenant_id": row["tenant_id"],
                "name": f"{row['tenant__first_name']} {row['tenant__last_name']}".strip(),
                "email": row["tenant__email"],
                "phone": row["tenant__phone"],
                "outstanding": row["outstanding"],
                "invoices": row["invoices"],
            }
            for row in debtors
        ],
        "by_property": [
            {
                "property_id": row["property_id"],
                "title": row["property__title"],
                "reference": row["property__reference"],
                "outstanding": row["outstanding"],
                "invoices": row["invoices"],
            }
            for row in by_property
        ],
        "by_method": [
            {"method": row["method"], "total": row["total"], "count": row["count"]}
            for row in by_method
        ],
    }

    if leases is not None:
        active = leases.filter(status=Lease.Status.ACTIVE)
        payload["leases"] = {
            "total": leases.count(),
            "active": active.count(),
            "expiring_soon": active.filter(
                end_date__lte=today + timedelta(days=30), end_date__gte=today
            ).count(),
            "expired": leases.filter(status=Lease.Status.EXPIRED).count(),
        }
    return payload


def scope_for(user):
    """Return (invoices, payments, leases) limited to what `user` is allowed to see."""
    invoices = Invoice.objects.all()
    payments = Payment.objects.all()
    leases = Lease.objects.all()
    if user.role == Role.LANDLORD:
        invoices = invoices.filter(landlord=user)
        payments = payments.filter(Q(lease__landlord=user) | Q(invoice__landlord=user)).distinct()
        leases = leases.filter(landlord=user)
    elif user.role == Role.TENANT:
        invoices = invoices.filter(tenant=user)
        payments = payments.filter(tenant=user)
        leases = leases.filter(tenant=user)
    return invoices, payments, leases


def landlord_overview(user, months=6):
    """What an owner is shown about his own book: the collection trend and the occupancy of his
    properties. Deliberately aggregate — the invoices, payments and receipts behind it name a
    tenant and stay with the office.
    """
    today = timezone.localdate()
    invoices = Invoice.objects.filter(landlord=user).exclude(status=Invoice.Status.CANCELLED)
    payments = Payment.objects.filter(
        Q(lease__landlord=user) | Q(invoice__landlord=user), status=Payment.Status.CONFIRMED
    ).distinct()
    properties = Property.objects.filter(owner=user)
    leases = Lease.objects.filter(landlord=user)

    invoiced_total = invoices.aggregate(total=Sum("total"))["total"] or ZERO
    collected_total = payments.aggregate(total=Sum("amount"))["total"] or ZERO
    unpaid = invoices.filter(total__gt=F("amount_paid"))
    outstanding_total = unpaid.aggregate(total=Sum(OUTSTANDING))["total"] or ZERO
    overdue_total = unpaid.filter(due_date__lt=today).aggregate(
        total=Sum(OUTSTANDING)
    )["total"] or ZERO

    collected_by_property = {
        row["lease__property_id"]: row["total"]
        for row in payments.exclude(lease__isnull=True)
        .values("lease__property_id").annotate(total=Sum("amount"))
    }
    outstanding_by_property = {
        row["property_id"]: row["outstanding"]
        for row in unpaid.values("property_id").annotate(outstanding=Sum(OUTSTANDING))
    }

    occupied = properties.filter(status=Property.Status.OCCUPIED).count()
    lettable = properties.exclude(
        status__in=[Property.Status.SOLD, Property.Status.OFF_MARKET]
    ).count()

    return {
        "currency": Company.load().currency,
        "as_of": today.isoformat(),
        "collection": {
            "invoiced": invoiced_total,
            "collected": collected_total,
            "outstanding": outstanding_total,
            "overdue": overdue_total,
            "collection_rate": (
                round(float(collected_total) / float(invoiced_total) * 100, 2)
                if invoiced_total else 0.0
            ),
            "monthly": _monthly_series(invoices, payments, months),
        },
        "occupancy": {
            "properties": properties.count(),
            "occupied": occupied,
            "available": properties.filter(status=Property.Status.AVAILABLE).count(),
            "pending": properties.filter(status=Property.Status.PENDING).count(),
            "sold": properties.filter(status=Property.Status.SOLD).count(),
            "off_market": properties.filter(status=Property.Status.OFF_MARKET).count(),
            "rate": round(occupied / lettable * 100, 1) if lettable else 0.0,
            "active_leases": leases.filter(status=Lease.Status.ACTIVE).count(),
            "leases_expiring_soon": leases.filter(
                status=Lease.Status.ACTIVE,
                end_date__gte=today,
                end_date__lte=today + timedelta(days=60),
            ).count(),
            "by_property": [
                {
                    "id": prop.id,
                    "title": prop.title,
                    "reference": prop.reference,
                    "city": prop.city,
                    "status": prop.status,
                    "status_display": prop.get_status_display(),
                    "listing_type": prop.listing_type,
                    "listing_display": prop.get_listing_type_display(),
                    "is_published": prop.is_published,
                    "collected": collected_by_property.get(prop.id, ZERO),
                    "outstanding": outstanding_by_property.get(prop.id, ZERO),
                }
                for prop in properties.order_by("-created_at")[:50]
            ],
        },
    }
