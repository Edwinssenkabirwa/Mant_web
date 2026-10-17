"""Attach the illustrative renders in backend/seed_images/ to their listings.

The pictures are AI-generated stand-ins, so each one is stored with
is_illustrative=True and a caption saying it is not a photograph of the property.
Nothing is deleted: existing images (including anything an owner uploaded) stay
attached, and a listing that already has an illustrative cover is skipped, so the
command is safe to re-run.
"""
from pathlib import Path

from django.conf import settings
from django.core.files import File
from django.core.management.base import BaseCommand

from apps.properties.models import Property, PropertyImage

CAPTION = "Illustrative render — not a photograph of this property."
SOURCE_DIRNAME = Path("seed_images") / "properties"


class Command(BaseCommand):
    help = "Attach seed_images/property renders as additional, labelled listing images."

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
        attached, skipped, missing = [], [], []

        for path in sorted(folder.glob("*.jpg")) + sorted(folder.glob("*.png")):
            property_obj = Property.objects.filter(slug=path.stem).first()
            if property_obj is None:
                missing.append(path.name)
                continue
            if property_obj.images.filter(is_illustrative=True).exists():
                skipped.append(property_obj.slug)
                continue
            if options["dry_run"]:
                attached.append(property_obj.slug)
                continue
            with path.open("rb") as handle:
                PropertyImage.objects.create(
                    property=property_obj,
                    image=File(handle, name=f"{property_obj.slug}-illustrative.jpg"),
                    caption=CAPTION,
                    alt_text=f"{property_obj.title} — illustrative render, not a photograph",
                    is_illustrative=True,
                    is_primary=True,
                )
            attached.append(property_obj.slug)

        if not verbose:
            return
        verb = "Would attach" if options["dry_run"] else "Attached"
        self.stdout.write(self.style.SUCCESS(
            f"{verb} {len(attached)} image(s); {len(skipped)} listing(s) already had one; "
            f"{len(missing)} file(s) matched no listing."
        ))
        for slug in attached:
            self.stdout.write(f"  + {slug}")
        for slug in skipped:
            self.stdout.write(f"  = {slug}")
        for name in missing:
            self.stdout.write(self.style.WARNING(f"  ? {name} (no listing with slug {Path(name).stem})"))
