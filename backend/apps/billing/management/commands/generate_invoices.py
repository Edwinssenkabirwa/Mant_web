from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone
from django.utils.dateparse import parse_date

from apps.billing.services import generate_all_invoices, generate_invoices_for_lease
from apps.leases.models import Lease, add_months


class Command(BaseCommand):
    help = (
        "Generate rent invoices for active tenancies. Idempotent: periods that are "
        "already invoiced are skipped."
    )

    def add_arguments(self, parser):
        parser.add_argument("--lease", help="Generate for one lease only (number or id).")
        parser.add_argument(
            "--until",
            help="Bill up to this date, YYYY-MM-DD. Defaults to today.",
        )
        parser.add_argument(
            "--months",
            type=int,
            help="Bill this many months ahead of today instead of up to today.",
        )

    def handle(self, *args, **options):
        horizon = timezone.localdate()
        if options["until"]:
            parsed = parse_date(options["until"])
            if parsed is None:
                raise CommandError("--until must be a date in YYYY-MM-DD format.")
            horizon = parsed
        elif options["months"]:
            horizon = add_months(horizon, options["months"])

        if options["lease"]:
            lease = (
                Lease.objects.filter(number=options["lease"]).first()
                or Lease.objects.filter(pk=options["lease"]).first()
            )
            if lease is None:
                raise CommandError(f"No lease found for '{options['lease']}'.")
            created = generate_invoices_for_lease(lease, horizon)
            self._report(created, f"lease {lease.number}")
            return

        result = generate_all_invoices(horizon)
        self.stdout.write(self.style.SUCCESS(
            f"Generated {result['invoices']} invoice(s) across {result['leases']} lease(s), "
            f"billed up to {horizon:%d %b %Y}."
        ))

    def _report(self, created, scope):
        if not created:
            self.stdout.write(f"No new invoices for {scope}; already billed to date.")
            return
        for invoice in created:
            self.stdout.write(f"  {invoice.number}  {invoice.period_label}  {invoice.total}")
        self.stdout.write(self.style.SUCCESS(
            f"Generated {len(created)} invoice(s) for {scope}."
        ))
