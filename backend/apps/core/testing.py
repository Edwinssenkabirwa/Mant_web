"""Shared test helpers."""
import shutil
import tempfile

from django.test import TestCase, override_settings


class MediaTempMixin:
    """Writes uploads under MEDIA_ROOT into a throwaway directory.

    Without this, test uploads land in the developer's real media folder.
    """

    def setUp(self):
        super().setUp()
        media_root = tempfile.mkdtemp(prefix="mant-bridges-test-media-")
        override = override_settings(MEDIA_ROOT=media_root)
        override.enable()
        self.addCleanup(override.disable)
        self.addCleanup(shutil.rmtree, media_root, True)


class ApiTestCase(MediaTempMixin, TestCase):
    """Database-backed test case with isolated media, for API tests."""
