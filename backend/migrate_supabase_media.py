
"""
Safely migrate database-referenced media from local Django storage
to Supabase Storage.

Default: DRY RUN only. No files are uploaded unless --execute is supplied.
Local files and database records are never deleted or modified.
"""

import argparse
import sys
from pathlib import Path

from django.core.files import File
from django.core.management.base import CommandError
from django.db import close_old_connections

from apps.properties.models import PropertyImage
from apps.blog.models import Post
from apps.core.models import Company, Service
from apps.billing.models import Receipt
from apps.messaging.models import Message
from apps.core.storage_backends import (
    SupabasePublicMediaStorage,
    SupabasePrivateFilesStorage,
)


PUBLIC_BUCKET = "mant-public-media"
PRIVATE_BUCKET = "mant-private-media"

# Each entry is (description, queryset, field name, destination storage).
def build_jobs():
    public_storage = SupabasePublicMediaStorage()
    private_storage = SupabasePrivateFilesStorage()

    return [
        ("Property image", PropertyImage.objects.exclude(image=""), "image", public_storage),
        ("Blog cover", Post.objects.exclude(cover_image=""), "cover_image", public_storage),
        ("Company logo", Company.objects.exclude(logo=""), "logo", public_storage),
        ("Service image", Service.objects.exclude(image=""), "image", public_storage),
        ("Receipt PDF", Receipt.objects.exclude(pdf=""), "pdf", private_storage),
        ("Message attachment", Message.objects.exclude(attachment=""), "attachment", private_storage),
    ]


def main():
    parser = argparse.ArgumentParser(
        description="Safely migrate local media files to Supabase Storage."
    )
    parser.add_argument(
        "--execute",
        action="store_true",
        help="Actually upload files. Without this flag, only a dry run is performed.",
    )
    args = parser.parse_args()

    from django.conf import settings

    media_root = Path(settings.MEDIA_ROOT).resolve()
    mode = "EXECUTE" if args.execute else "DRY RUN"

    print("=" * 68)
    print(f"Supabase media migration — {mode}")
    print(f"Local media root: {media_root}")
    print(f"Public bucket:    {PUBLIC_BUCKET}")
    print(f"Private bucket:   {PRIVATE_BUCKET}")
    print("=" * 68)

    jobs = build_jobs()

    planned = 0
    already_remote = 0
    uploaded_count = 0
    missing_local = 0
    failures = 0
    name_collisions = 0
    seen = set()

    for description, queryset, field_name, storage in jobs:
        bucket = storage.bucket_name

        expected_bucket = (
            PUBLIC_BUCKET if description in {
                "Property image", "Blog cover", "Company logo", "Service image"
            } else PRIVATE_BUCKET
        )

        if bucket != expected_bucket:
            raise CommandError(
                f"{description}: configured bucket is {bucket!r}; "
                f"expected {expected_bucket!r}. No files were migrated."
            )

        for record in queryset.iterator():
            field = getattr(record, field_name)
            name = field.name

            if not name:
                continue

            identity = (bucket, name)
            if identity in seen:
                print(f"SKIP duplicate database reference: {bucket}/{name}")
                continue
            seen.add(identity)

            local_path = (media_root / name).resolve()

            # Ensure a database path cannot escape MEDIA_ROOT.
            if not local_path.is_relative_to(media_root):
                print(f"ERROR unsafe media path: {name}")
                failures += 1
                continue

            if not local_path.is_file():
                print(f"MISSING local file: {name}")
                missing_local += 1
                continue

            try:
                exists = storage.exists(name)
            except Exception as exc:
                print(f"ERROR checking remote object {bucket}/{name}: {exc}")
                failures += 1
                continue

            if exists:
                print(f"SKIP already remote: {bucket}/{name}")
                already_remote += 1
                continue

            planned += 1
            size = local_path.stat().st_size

            if not args.execute:
                print(f"WOULD UPLOAD [{size:,} bytes]: {bucket}/{name}")
                continue

            try:
                with local_path.open("rb") as source:
                    saved_name = storage.save(name, File(source))

                if saved_name != name:
                    print(
                        f"ERROR destination name changed: requested {name!r}, "
                        f"saved as {saved_name!r}. Check remote storage manually."
                    )
                    failures += 1
                    continue

                if not storage.exists(name):
                    print(f"ERROR remote verification failed: {bucket}/{name}")
                    failures += 1
                    continue

                print(f"UPLOADED and verified: {bucket}/{name}")
                uploaded_count += 1

            except Exception as exc:
                print(f"ERROR uploading {bucket}/{name}: {type(exc).__name__}: {exc}")
                failures += 1

    print("\n" + "=" * 68)
    print(f"Mode:                  {mode}")
    print(f"New files planned:     {planned}")
    print(f"Already remote:        {already_remote}")
    print(f"Uploaded and verified: {uploaded_count}")
    print(f"Missing local files:   {missing_local}")
    print(f"Errors:                {failures}")
    print("Local files deleted:   0")
    print("Database records changed: 0")
    print("=" * 68)

    if not args.execute:
        print("DRY RUN COMPLETE — no uploads were performed.")
        print("Review the report before running with --execute.")

    close_old_connections()

    if failures or missing_local:
        sys.exit(1)


if __name__ == "__main__":
    main()
