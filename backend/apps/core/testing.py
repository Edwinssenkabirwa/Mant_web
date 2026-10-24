"""Shared test helpers."""
import shutil
import tempfile

from django.apps import apps
from django.conf import settings
from django.core.files.storage import FileSystemStorage
from django.db.models import FileField
from django.test import TestCase, override_settings

from apps.core.storage_backends import (
    SupabasePrivateFilesStorage,
    SupabasePublicMediaStorage,
)


class MediaTempMixin:
    """Writes uploads into a throwaway directory, off the disk and out of the buckets.

    Two things have to be pinned down. ``default`` storage is Supabase now, so
    ``MEDIA_ROOT`` alone no longer diverts an upload: it would land in
    ``mant-public-media``. And the receipt and attachment fields each hold their own
    storage instance, chosen when the model was defined, which no setting can reach.
    """

    def setUp(self):
        super().setUp()
        media_root = tempfile.mkdtemp(prefix="mant-bridges-test-media-")
        override = override_settings(
            MEDIA_ROOT=media_root,
            STORAGES={
                **settings.STORAGES,
                "default": {
                    "BACKEND": "django.core.files.storage.FileSystemStorage",
                    "OPTIONS": {
                        "location": media_root,
                        "base_url": settings.MEDIA_URL,
                    },
                },
            },
        )
        override.enable()
        self.addCleanup(override.disable)
        self.addCleanup(shutil.rmtree, media_root, True)
        self._detach_bucket_storages(media_root)

    def _detach_bucket_storages(self, media_root):
        """Swap every field that was handed a bucket for the duration of one test."""
        replacement = FileSystemStorage(
            location=tempfile.mkdtemp(prefix="mant-bridges-test-private-", dir=media_root)
        )
        for model in apps.get_models():
            for field in model._meta.local_fields:
                if not isinstance(field, FileField):
                    continue
                if not isinstance(field.storage, (SupabasePublicMediaStorage, SupabasePrivateFilesStorage)):
                    continue
                original = field.storage
                field.storage = replacement
                self.addCleanup(setattr, field, "storage", original)


class ApiTestCase(MediaTempMixin, TestCase):
    """Database-backed test case with isolated media, for API tests."""
