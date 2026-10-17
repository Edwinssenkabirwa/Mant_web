"""Attach the artwork in backend/seed_images/posts/ to the matching articles.

Files are matched by name against ``Post.slug``. By default an article that
already has a cover keeps it; pass ``--replace`` to swap the cover over, which is
how the placeholder art from ``seed_demo`` was retired. The file the old cover
pointed at stays in MEDIA_ROOT — nothing is deleted.
"""
from pathlib import Path

from django.conf import settings
from django.core.files import File
from django.core.management.base import BaseCommand

from apps.blog.models import Post

SOURCE_DIRNAME = Path("seed_images") / "posts"


class Command(BaseCommand):
    help = "Attach seed_images/posts artwork as article covers."

    def add_arguments(self, parser):
        parser.add_argument(
            "--replace",
            action="store_true",
            help="Swap the cover even when the article already has one.",
        )
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
            post = Post.objects.filter(slug=path.stem).first()
            if post is None:
                missing.append(path.name)
                continue
            if post.cover_image and not options["replace"]:
                kept.append(post.slug)
                continue
            if not options["dry_run"]:
                with path.open("rb") as handle:
                    post.cover_image.save(f"{post.slug}.jpg", File(handle), save=False)
                post.save(update_fields=["cover_image", "updated_at"])
            attached.append(post.slug)

        if not verbose:
            return
        verb = "Would attach" if options["dry_run"] else "Attached"
        self.stdout.write(self.style.SUCCESS(
            f"{verb} {len(attached)} cover(s); {len(kept)} article(s) kept their cover; "
            f"{len(missing)} file(s) matched no article."
        ))
        for slug in attached:
            self.stdout.write(f"  + {slug}")
        for slug in kept:
            self.stdout.write(f"  = {slug} (cover kept)")
        for name in missing:
            self.stdout.write(self.style.WARNING(f"  ? {name} (no article with slug {Path(name).stem})"))
