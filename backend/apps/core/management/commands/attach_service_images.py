"""Attach the artwork in backend/seed_images/services/ to the matching services.

Pictures are matched by file name against ``Service.slug``. A service that already
has an image is left alone, so an upload made in the admin interface is never
overwritten and the command can be re-run safely.
"""
from pathlib import Path

from django.conf import settings
from django.core.files import File
from django.core.management.base import BaseCommand

from apps.core.models import Service

SOURCE_DIRNAME = Path("seed_images") / "services"


class Command(BaseCommand):
    help = "Attach seed_images/services artwork to services that have no picture yet."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Report what would be attached without writing anything.",
        )

    def handle(self, *args, **options):
        folder = Path(settings.BASE_DIR) / SOURCE_DIRNAME
        if not folder.is_dir():
            self.stdout.write(self.style.WARNING(f"No image folder at {folder} — nothing to do."))
            return

        verbose = options["verbosity"] > 0
        attached, kept, missing = [], [], []

        for path in sorted(folder.glob("*.jpg")) + sorted(folder.glob("*.png")):
            service = Service.objects.filter(slug=path.stem).first()
            if service is None:
                missing.append(path.name)
                continue
            if service.image:
                kept.append(service.slug)
                continue
            if not options["dry_run"]:
                with path.open("rb") as handle:
                    service.image.save(f"{service.slug}.jpg", File(handle), save=False)
                if not service.image_alt:
                    service.image_alt = f"{service.name} — illustrative artwork"
                service.save()
            attached.append(service.slug)

        if not verbose:
            return
        verb = "Would attach" if options["dry_run"] else "Attached"
        self.stdout.write(self.style.SUCCESS(
            f"{verb} {len(attached)} image(s); {len(kept)} service(s) already had a picture; "
            f"{len(missing)} file(s) matched no service."
        ))
        for slug in attached:
            self.stdout.write(f"  + {slug}")
        for slug in kept:
            self.stdout.write(f"  = {slug} (image kept)")
        for name in missing:
            self.stdout.write(self.style.WARNING(f"  ? {name} (no service with slug {Path(name).stem})"))
