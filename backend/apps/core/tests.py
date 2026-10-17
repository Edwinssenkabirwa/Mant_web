"""Tests for admin-managed services and the public newsletter API."""
import re
from base64 import b64decode
from datetime import timedelta

from django.conf import settings
from django.core import mail
from django.core.cache import cache
from django.core.files.base import ContentFile
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import Role, User
from apps.core.models import NewsletterSubscription, Service
from apps.core.services import newsletter
from apps.core.testing import ApiTestCase

TINY_PNG = b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
)


class ServiceApiTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.admin = User.objects.create_user(
            email="admin@example.test", password="Passw0rd!", role=Role.ADMIN,
            first_name="Ada", last_name="Admin",
        )
        self.landlord = User.objects.create_user(
            email="landlord@example.test", password="Passw0rd!", role=Role.LANDLORD,
            first_name="Len", last_name="Owner",
        )
        self.client = APIClient()

    def publish(self, **overrides):
        payload = dict(
            name="Rent collection", summary="Short summary", description="Long description.",
            highlights=["One", "Two"], limitations="Nothing guaranteed.", order=1,
            is_published=True,
        )
        payload.update(overrides)
        return Service.objects.create(**payload)

    def test_public_list_returns_only_published(self):
        live = self.publish()
        hidden = self.publish(name="Draft service", is_published=False, order=2)

        response = self.client.get("/api/services/")
        self.assertEqual(response.status_code, 200)
        slugs = [row["slug"] for row in response.json()["results"]]
        self.assertEqual(slugs, [live.slug])
        self.assertNotIn(hidden.slug, slugs)

    def test_public_detail_rejects_unpublished_service(self):
        hidden = self.publish(name="Draft service", is_published=False)
        self.assertEqual(self.client.get(f"/api/services/{hidden.slug}/").status_code, 404)

        live = self.publish()
        detail = self.client.get(f"/api/services/{live.slug}/")
        self.assertEqual(detail.status_code, 200)
        body = detail.json()
        self.assertEqual(body["paragraphs"], ["Long description."])
        self.assertEqual(body["limitations"], "Nothing guaranteed.")

    def test_anonymous_and_landlord_cannot_write_services(self):
        service = self.publish()

        for user in (None, self.landlord):
            if user is None:
                self.client.credentials()
            else:
                self.client.force_authenticate(user)

            created = self.client.post(
                "/api/manage/services/", {"name": "Sneaky service"}, format="json"
            )
            self.assertIn(created.status_code, (401, 403), created.data)

            updated = self.client.patch(
                f"/api/manage/services/{service.pk}/", {"name": "Hijacked"}, format="json"
            )
            self.assertIn(updated.status_code, (401, 403), updated.data)

            deleted = self.client.delete(f"/api/manage/services/{service.pk}/")
            self.assertIn(deleted.status_code, (401, 403), deleted.data)

        service.refresh_from_db()
        self.assertEqual(service.name, "Rent collection")

    def test_admin_creates_service_and_uploads_an_image(self):
        self.client.force_authenticate(self.admin)
        response = self.client.post(
            "/api/manage/services/",
            {
                "name": "Land documentation",
                "category": Service.Category.LAND_DOCUMENTATION,
                "summary": "Paperwork support.",
                "description": "We assemble the file.",
                "highlights": ["Checklist", "Follow-up"],
                "limitations": "Not a land registry.",
                "image_alt": "Land file and forms",
                "order": 4,
                "is_published": True,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.data)
        body = response.json()
        self.assertEqual(body["slug"], "land-documentation")
        self.assertIsNone(body["image_url"])

        uploaded = self.client.patch(
            f"/api/manage/services/{body['id']}/",
            {"image": SimpleUploadedFile("land.png", TINY_PNG, "image/png")},
            format="multipart",
        )
        self.assertEqual(uploaded.status_code, 200, uploaded.data)
        self.assertTrue(uploaded.data["image_url"].startswith("http"))

        service = Service.objects.get(pk=body["id"])
        self.assertEqual(service.highlights, ["Checklist", "Follow-up"])
        self.assertIn("services/", service.image.name)

    def test_admin_updates_and_unpublishes_without_losing_the_image(self):
        service = self.publish()
        service.image.save("existing.png", ContentFile(TINY_PNG), save=True)
        self.client.force_authenticate(self.admin)

        response = self.client.patch(
            f"/api/manage/services/{service.pk}/",
            {"is_published": False, "summary": "Rewritten"},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)
        service.refresh_from_db()
        self.assertFalse(service.is_published)
        self.assertEqual(service.summary, "Rewritten")
        self.assertTrue(service.image.name.endswith("existing.png"))
        self.assertEqual(self.client.get("/api/services/").json()["count"], 0)

    def test_admin_can_delete_a_service(self):
        service = self.publish()
        self.client.force_authenticate(self.admin)
        self.assertEqual(
            self.client.delete(f"/api/manage/services/{service.pk}/").status_code, 204
        )
        self.assertFalse(Service.objects.filter(pk=service.pk).exists())

    def test_slug_is_generated_and_kept_unique(self):
        self.publish(name="Debt recovery")
        self.client.force_authenticate(self.admin)
        response = self.client.post(
            "/api/manage/services/", {"name": "Debt recovery"}, format="json"
        )
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.json()["slug"], "debt-recovery-2")

    def test_short_name_is_refused(self):
        self.client.force_authenticate(self.admin)
        response = self.client.post("/api/manage/services/", {"name": "x"}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("name", response.json()["errors"])


class SeedServicesCommandTests(ApiTestCase):
    def test_second_run_does_not_duplicate_or_overwrite_admin_edits(self):
        call_command("seed_services", verbosity=0)
        first_ids = set(Service.objects.values_list("id", flat=True))
        self.assertEqual(len(first_ids), 5)
        self.assertEqual(Service.objects.published().count(), 5)

        edited = Service.objects.get(name="Debt recovery")
        edited.summary = "Rewritten by an administrator."
        edited.is_published = False
        edited.save()

        call_command("seed_services", verbosity=0)

        self.assertEqual(set(Service.objects.values_list("id", flat=True)), first_ids)
        edited.refresh_from_db()
        self.assertEqual(edited.summary, "Rewritten by an administrator.")
        self.assertFalse(edited.is_published)

    def test_land_documentation_does_not_claim_registry_status(self):
        call_command("seed_services", verbosity=0)
        service = Service.objects.get(category=Service.Category.LAND_DOCUMENTATION)
        text = f"{service.summary} {service.description} {service.limitations}".lower()
        self.assertIn("not a land registry", text)
        self.assertNotIn("guarantee title", text)


class NewsletterTests(ApiTestCase):
    """Public double opt-in flow: sign-up, confirmation, expiry, unsubscribe, suppression."""

    def setUp(self):
        super().setUp()
        # Throttling keys live in the cache, which survives per-test rollback.
        cache.clear()
        self.client = APIClient()

    def subscribe(self, email="reader@example.test", **overrides):
        payload = {"email": email, "first_name": "Rita", "consent": True, "source": "homepage"}
        payload.update(overrides)
        return self.client.post("/api/newsletter/subscribe/", payload, format="json")

    @staticmethod
    def token_from_mail(message):
        html = message.alternatives[0][0]
        return re.search(r"token=([A-Za-z0-9_\-]+)", html).group(1)

    def test_sign_up_creates_pending_row_and_emails_confirmation(self):
        response = self.subscribe()
        self.assertEqual(response.status_code, 200)
        subscription = NewsletterSubscription.objects.get(email="reader@example.test")
        self.assertEqual(subscription.status, NewsletterSubscription.Status.PENDING_CONFIRMATION)
        self.assertIsNotNone(subscription.consent_given_at)
        self.assertIsNone(subscription.confirmed_at)
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ["reader@example.test"])
        self.assertIn("text/html", [m[1] for m in mail.outbox[0].alternatives])

    def test_invalid_email_and_missing_consent_are_rejected(self):
        self.assertEqual(self.subscribe(email="not-an-email").status_code, 400)
        self.assertEqual(self.subscribe(consent=False).status_code, 400)
        self.assertEqual(NewsletterSubscription.objects.count(), 0)
        self.assertEqual(len(mail.outbox), 0)

    def test_email_is_normalised(self):
        self.subscribe(email="  Reader@Example.TEST ")
        self.assertTrue(NewsletterSubscription.objects.filter(email="reader@example.test").exists())

    def test_confirmation_activates_once(self):
        self.subscribe()
        token = self.token_from_mail(mail.outbox[0])
        response = self.client.post("/api/newsletter/confirm/", {"token": token}, format="json")
        self.assertEqual(response.status_code, 200)
        subscription = NewsletterSubscription.objects.get(email="reader@example.test")
        self.assertEqual(subscription.status, NewsletterSubscription.Status.SUBSCRIBED)
        self.assertIsNotNone(subscription.confirmed_at)
        self.assertEqual(NewsletterSubscription.objects.subscribed().count(), 1)

        replay = self.client.post("/api/newsletter/confirm/", {"token": token}, format="json")
        self.assertEqual(replay.status_code, 400)
        self.assertEqual(replay.json()["status"], "invalid")

    def test_expired_confirmation_link_is_refused(self):
        self.subscribe()
        token = self.token_from_mail(mail.outbox[0])
        subscription = NewsletterSubscription.objects.get(email="reader@example.test")
        subscription.confirm_token_created_at = timezone.now() - timedelta(
            hours=settings.NEWSLETTER_CONFIRM_HOURS + 1
        )
        subscription.save(update_fields=["confirm_token_created_at"])

        response = self.client.post("/api/newsletter/confirm/", {"token": token}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["status"], "expired")
        subscription.refresh_from_db()
        self.assertEqual(subscription.status, NewsletterSubscription.Status.PENDING_CONFIRMATION)

    def test_unknown_token_is_refused(self):
        response = self.client.post("/api/newsletter/confirm/", {"token": "guessme"}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["status"], "invalid")

    def test_duplicates_do_not_create_rows_or_resend_mail(self):
        first = self.subscribe()
        self.assertEqual(first.status_code, 200)
        self.client.post("/api/newsletter/confirm/", {"token": self.token_from_mail(mail.outbox[0])}, format="json")
        mail.outbox.clear()

        second = self.subscribe()
        self.assertEqual(second.status_code, 200)
        self.assertEqual(NewsletterSubscription.objects.count(), 1)
        self.assertEqual(len(mail.outbox), 0)
        # The answer is word-for-word the same, so the endpoint cannot confirm an address is listed.
        self.assertEqual(first.json(), second.json())

    def test_previous_unsubscribe_is_never_silently_reactivated(self):
        self.subscribe()
        self.client.post("/api/newsletter/confirm/", {"token": self.token_from_mail(mail.outbox[0])}, format="json")
        subscription = NewsletterSubscription.objects.get(email="reader@example.test")
        raw = newsletter.unsubscribe_token(subscription.email)
        self.client.post("/api/newsletter/unsubscribe/", {"token": raw}, format="json")
        mail.outbox.clear()

        self.subscribe()
        subscription.refresh_from_db()
        self.assertEqual(subscription.status, NewsletterSubscription.Status.PENDING_CONFIRMATION)
        self.assertEqual(NewsletterSubscription.objects.subscribed().count(), 0)
        self.assertEqual(len(mail.outbox), 1)

    def test_suppressed_and_bounced_addresses_stay_blocked(self):
        for index, status_value in enumerate(
            (
                NewsletterSubscription.Status.SUPPRESSED,
                NewsletterSubscription.Status.BOUNCED,
            )
        ):
            email = f"blocked{index}@example.test"
            NewsletterSubscription.objects.create(email=email, status=status_value)
            response = self.subscribe(email=email)
            self.assertEqual(response.status_code, 200)
            subscription = NewsletterSubscription.objects.get(email=email)
            self.assertEqual(subscription.status, status_value)
        self.assertEqual(len(mail.outbox), 0)

    def test_unsubscribe_needs_no_login_and_stops_mail(self):
        self.subscribe()
        self.client.post("/api/newsletter/confirm/", {"token": self.token_from_mail(mail.outbox[0])}, format="json")
        subscription = NewsletterSubscription.objects.get(email="reader@example.test")
        raw = newsletter.unsubscribe_token(subscription.email)

        response = self.client.post("/api/newsletter/unsubscribe/", {"token": raw}, format="json")
        self.assertEqual(response.status_code, 200)
        subscription.refresh_from_db()
        self.assertEqual(subscription.status, NewsletterSubscription.Status.UNSUBSCRIBED)
        self.assertIsNotNone(subscription.unsubscribed_at)
        self.assertEqual(NewsletterSubscription.objects.subscribed().count(), 0)

        replay = self.client.post("/api/newsletter/unsubscribe/", {"token": raw}, format="json")
        self.assertEqual(replay.status_code, 200)
        self.assertEqual(replay.json()["status"], "already_unsubscribed")

    def test_unsubscribe_hash_is_stored_not_the_raw_token(self):
        self.subscribe()
        subscription = NewsletterSubscription.objects.get(email="reader@example.test")
        self.assertEqual(len(subscription.unsubscribe_token_hash), 64)
        self.assertNotIn(newsletter.unsubscribe_token(subscription.email), subscription.unsubscribe_token_hash)
        self.assertNotIn(subscription.unsubscribe_token_hash, mail.outbox[0].alternatives[0][0])

    def test_no_public_route_lists_or_reads_subscribers(self):
        self.subscribe()
        self.assertEqual(self.client.get("/api/newsletter/subscribe/").status_code, 405)
        self.assertEqual(self.client.get("/api/newsletter/subscribers/").status_code, 404)
        self.assertEqual(self.client.get("/api/newsletter/confirm/").status_code, 405)
        self.assertNotContains(self.client.get("/api/lookups/"), "reader@example.test")
