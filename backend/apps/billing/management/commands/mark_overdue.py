from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone
from django.utils.dateparse import parse_date

from apps.billing.services import daily_maintenance


class Command(BaseCommand):
    help = (
        "Nightly rent sweep: expire finished leases, flag overdue invoices and apply "
        "late fees. Schedule this with cron or Task Scheduler."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--as-of",
            help="Run the sweep as at this date, YYYY-MM-DD. Defaults to today.",
        )

    def handle(self, *args, **options):
        as_of = None
        if options["as_of"]:
            as_of = parse_date(options["as_of"])
            if as_of is None:
                raise CommandError("--as-of must be a date in YYYY-MM-DD format.")

        result = daily_maintenance(as_of=as_of)
        self.stdout.write(self.style.SUCCESS(
            "Rent sweep complete as at "
            f"{(as_of or timezone.localdate()):%d %b %Y}:\n"
            f"  leases expired          : {result['leases_expired']}\n"
            f"  invoices marked overdue : {result['invoices_marked_overdue']}\n"
            f"  late fees applied       : {result['late_fees_applied']}"
        ))
