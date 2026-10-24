
import os
from urllib.parse import quote

from django.core.exceptions import ImproperlyConfigured
from storages.backends.s3 import S3Storage


# ---------------------------------------------------------
# Supabase Storage configuration
# ---------------------------------------------------------

SUPABASE_PROJECT_REF = "fxqkfwgpkvpnkegtlvmj"

SUPABASE_S3_ENDPOINT_URL = os.environ.get(
    "SUPABASE_S3_ENDPOINT_URL",
    f"https://{SUPABASE_PROJECT_REF}.storage.supabase.co/storage/v1/s3",
)

SUPABASE_S3_REGION = os.environ.get(
    "SUPABASE_S3_REGION",
    "eu-west-1",
)

SUPABASE_S3_ACCESS_KEY_ID = os.environ.get(
    "SUPABASE_S3_ACCESS_KEY_ID"
)

SUPABASE_S3_SECRET_ACCESS_KEY = os.environ.get(
    "SUPABASE_S3_SECRET_ACCESS_KEY"
)


def validate_supabase_credentials():
    """Fail at boot rather than let an upload die on the first save."""
    missing = []

    if not SUPABASE_S3_ACCESS_KEY_ID:
        missing.append("SUPABASE_S3_ACCESS_KEY_ID")

    if not SUPABASE_S3_SECRET_ACCESS_KEY:
        missing.append("SUPABASE_S3_SECRET_ACCESS_KEY")

    if missing:
        raise ImproperlyConfigured(
            "Missing Supabase Storage environment variables: "
            + ", ".join(missing)
            + ". Locally they belong in backend/.env.supabase; on a hosted"
            " deployment they must be project environment variables, because"
            " the .env files are not deployed."
        )


# ---------------------------------------------------------
# Public storage: property, blog, service and company images
# Bucket: mant-public-media
# ---------------------------------------------------------

class SupabasePublicMediaStorage(S3Storage):
    bucket_name = "mant-public-media"
    signature_version = "s3v4"
    endpoint_url = SUPABASE_S3_ENDPOINT_URL
    region_name = SUPABASE_S3_REGION
    access_key = SUPABASE_S3_ACCESS_KEY_ID
    secret_key = SUPABASE_S3_SECRET_ACCESS_KEY
    addressing_style = "path"
    default_acl = None
    file_overwrite = False

    # Public objects use normal public URLs, not signed URLs.
    querystring_auth = False

    def __init__(self, **settings):
        validate_supabase_credentials()
        super().__init__(**settings)

    def url(
        self,
        name,
        parameters=None,
        expire=None,
        http_method=None,
    ):
        """
        Return the public URL for an object in mant-public-media.

        Example:
        https://<project-ref>.supabase.co/storage/v1/object/public/
        mant-public-media/properties/example.jpg
        """
        encoded_name = quote(str(name).lstrip("/"), safe="/")

        return (
            f"https://{SUPABASE_PROJECT_REF}.supabase.co/"
            "storage/v1/object/public/"
            f"{self.bucket_name}/{encoded_name}"
        )


# ---------------------------------------------------------
# Private storage: receipts and message attachments
# Bucket: mant-private-files
# ---------------------------------------------------------

class SupabasePrivateFilesStorage(S3Storage):
    bucket_name = "mant-private-media"

    endpoint_url = SUPABASE_S3_ENDPOINT_URL
    region_name = SUPABASE_S3_REGION
    access_key = SUPABASE_S3_ACCESS_KEY_ID
    secret_key = SUPABASE_S3_SECRET_ACCESS_KEY
    signature_version = "s3v4"
    
    addressing_style = "path"
    default_acl = None
    file_overwrite = False

    # Private objects should use time-limited signed URLs.
    querystring_auth = True
    querystring_expire = 300

    def __init__(self, **settings):
        validate_supabase_credentials()
        super().__init__(**settings)
