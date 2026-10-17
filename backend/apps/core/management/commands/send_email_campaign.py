"""Batched campaign sending. Run it from cron / Task Scheduler, never from a web request."""
from django.core.management.base import BaseCommand, CommandError

from apps.core.models import EmailCampaign
from apps.core.services.campaigns import deliver_campaign

RUNNABLE = [
    EmailCampaign.Status.QUEUED,
    EmailCampaign.Status.SENDING,
]


class Command(BaseCommand):
    help = (
        "Send queued email campaigns in batches. Each run picks up where the last one left "
        "off, so schedule it repeatedly (for example every five minutes) instead of trying to "
        "send everything at once."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--campaign",
            type=int,
            help="Send only this campaign id. By default every queued or in-progress campaign is sent.",
        )
        parser.add_argument(
            "--limit",
            type=int,
            default=200,
            help="Maximum messages per campaign on this run (default 200).",
        )
        parser.add_argument(
            "--delay",
            type=float,
            default=0.0,
            help="Seconds to wait between messages, for provider rate limits (default 0).",
        )
        parser.add_argument(
            "--passes",
            type=int,
            default=1,
            help="Batches to send per campaign on this run (default 1).",
        )

    def handle(self, *args, **options):
        limit = options["limit"]
        delay = options["delay"]
        passes = options["passes"]
        if limit < 1:
            raise CommandError("--limit must be at least 1.")
        if passes < 1:
            raise CommandError("--passes must be at least 1.")
        if delay < 0:
            raise CommandError("--delay cannot be negative.")

        campaigns = EmailCampaign.objects.filter(status__in=RUNNABLE).order_by("queued_at", "id")
        if options["campaign"]:
            campaigns = campaigns.filter(pk=options["campaign"])
            if not campaigns.exists():
                raise CommandError(
                    f"Campaign {options['campaign']} is not queued or in progress."
                )

        totals = {"sent": 0, "failed": 0, "skipped": 0}
        completed = 0
        ran_any = False

        for campaign in list(campaigns):
            label = f"Campaign {campaign.pk} - {campaign.name}"
            remaining = 0
            for _ in range(passes):
                result = deliver_campaign(campaign, limit=limit, delay=delay)
                if not result["claimed"]:
                    self.stdout.write(f"{label}: another worker already holds it, skipped.")
                    break
                ran_any = True
                totals["sent"] += result["sent"]
                totals["failed"] += result["failed"]
                totals["skipped"] += result["skipped"]
                remaining = result["remaining"]
                if remaining == 0:
                    completed += 1
                    self.stdout.write(self.style.SUCCESS(f"{label}: completed."))
                    break
            if remaining:
                self.stdout.write(
                    f"{label}: {remaining} recipient(s) still waiting, run the command again."
                )

        if not ran_any:
            self.stdout.write(self.style.WARNING("No queued campaigns to send."))
            return

        self.stdout.write(self.style.SUCCESS(
            "Campaign sending pass complete:\n"
            f"  campaigns finished : {completed}\n"
            f"  accepted by server : {totals['sent']}\n"
            f"  failed             : {totals['failed']}\n"
            f"  skipped            : {totals['skipped']}\n"
            "\n'Accepted by server' means the mail provider took the message. It is not proof "
            "of inbox delivery."
        ))
