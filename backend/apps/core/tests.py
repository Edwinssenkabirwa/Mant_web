"""Tests for admin-managed services, the public newsletter API and email campaigns."""
import json
import re
from base64 import b64decode
from datetime import timedelta
from io import StringIO
from smtplib import SMTPServerDisconnected

from django.conf import settings
from django.core import mail
from django.core.cache import cache
from django.core.files.base import ContentFile
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.mail.backends.base import BaseEmailBackend
from django.core.management import call_command
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import Role, User
from apps.core.models import (
    EmailCampaign,
    EmailCampaignRecipient,
    NewsletterSubscription,
    Service,
)
from apps.core.services import campaigns, newsletter
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
        live = self.publish(icon=Service.Icon.BUILDING)
        hidden = self.publish(name="Draft service", is_published=False, order=2)

        response = self.client.get("/api/services/")
        self.assertEqual(response.status_code, 200)
        slugs = [row["slug"] for row in response.json()["results"]]
        self.assertEqual(slugs, [live.slug])
        self.assertNotIn(hidden.slug, slugs)
        self.assertEqual(response.json()["results"][0]["icon"], Service.Icon.BUILDING)

    def test_an_icon_outside_the_whitelist_is_refused(self):
        self.client.force_authenticate(self.admin)
        response = self.client.post(
            "/api/manage/services/",
            {"name": "Rocket services", "icon": "rocket"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("icon", response.json()["errors"])

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
                "category": Service.Category.OTHER,
                "icon": Service.Icon.DOCUMENT,
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
        self.assertEqual(body["icon"], Service.Icon.DOCUMENT)
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

    def test_seeded_names_are_the_published_offers_in_brochure_order(self):
        call_command("seed_services", verbosity=0)
        self.assertEqual(
            list(Service.objects.order_by("order").values_list("name", flat=True)),
            [
                "Rent collection & property management",
                "Real estate",
                "Contracting & lobbying",
                "Land & property documentation",
                "Debt recovery",
            ],
        )

    def test_icons_stay_inside_the_whitelist_the_frontend_renders(self):
        call_command("seed_services", verbosity=0)
        allowed = {value for value, _ in Service.Icon.choices}
        for service in Service.objects.all():
            self.assertIn(service.icon, allowed)

    def test_lobbying_does_not_offer_influence_for_sale(self):
        call_command("seed_services", verbosity=0)
        service = Service.objects.get(category=Service.Category.LOBBYING_ADVOCACY)
        text = f"{service.summary} {service.description} {service.limitations}".lower()
        self.assertIn("cannot guarantee an award", text)
        self.assertIn("written instruction", text)
        self.assertNotIn("guarantee a win", text)

    def test_land_documentation_does_not_claim_registry_or_advocate_status(self):
        call_command("seed_services", verbosity=0)
        service = Service.objects.get(slug="land-documentation")
        text = f"{service.summary} {service.description} {service.limitations}".lower()
        self.assertIn("not a land registry", text)
        self.assertIn("licensed advocate", text)
        self.assertNotIn("guarantee title", text)

    def test_no_service_describes_the_billing_system_to_clients(self):
        """Invoice and receipt mechanics are staff tooling; the published copy sells outcomes."""
        call_command("seed_services", verbosity=0)
        for service in Service.objects.all():
            text = f"{service.summary} {service.description} {service.limitations}".lower()
            for term in ("invoice", "receipt", "ledger"):
                self.assertNotIn(term, text, f"{service.slug} mentions {term}")

    def test_no_service_copy_names_government(self):
        """No published line of any service names government — in prose or in the bullet lists."""
        call_command("seed_services", verbosity=0)
        for service in Service.objects.all():
            for text in (
                service.summary,
                service.description,
                service.limitations,
                " ".join(service.highlights or []),
            ):
                self.assertNotIn("government", (text or "").lower(), f"{service.slug} names government")


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


class FailingEmailBackend(BaseEmailBackend):
    """Stands in for a provider outage so retry handling can be tested."""

    def send_messages(self, messages):
        raise SMTPServerDisconnected("provider refused the connection")


class CampaignEngineTests(ApiTestCase):
    """Audience resolution, queueing and batched delivery. No provider, locmem mail only."""

    def setUp(self):
        super().setUp()
        self.admin = User.objects.create_user(
            email="campaigns@example.test", password="Passw0rd!", role=Role.ADMIN,
            first_name="Camm", last_name="Sender",
        )

    def subscriber(self, email, status=None, first_name="Rita"):
        confirmed = status is None or status == NewsletterSubscription.Status.SUBSCRIBED
        return NewsletterSubscription.objects.create(
            email=email,
            first_name=first_name,
            status=status or NewsletterSubscription.Status.SUBSCRIBED,
            consent_given_at=timezone.now(),
            confirmed_at=timezone.now() if confirmed else None,
        )

    def opt_in(self, email, role=Role.TENANT, marketing=True):
        return User.objects.create_user(
            email=email, password="Passw0rd!", role=role,
            first_name=email.split("@")[0].title(), last_name="Person",
            marketing_opt_in=marketing,
            marketing_opt_in_at=timezone.now() if marketing else None,
        )

    def campaign(self, **overrides):
        payload = {
            "name": "October note",
            "subject": "October opportunities at Mant Bridges",
            "body": "First paragraph.\n\nSecond paragraph.",
            "audiences": [EmailCampaign.Audience.NEWSLETTER_SUBSCRIBERS],
            "created_by": self.admin,
        }
        payload.update(overrides)
        return EmailCampaign.objects.create(**payload)

    def test_subscribers_audience_only_includes_confirmed_addresses(self):
        self.subscriber("yes@example.test")
        self.subscriber("pending@example.test", status=NewsletterSubscription.Status.PENDING_CONFIRMATION)
        self.subscriber("left@example.test", status=NewsletterSubscription.Status.UNSUBSCRIBED)

        preview = campaigns.resolve_audiences([EmailCampaign.Audience.NEWSLETTER_SUBSCRIBERS])
        self.assertEqual([row["email"] for row in preview.recipients], ["yes@example.test"])
        # Unsubscribed addresses never reach the list in the first place: the subscribers
        # queryset only returns SUBSCRIBED rows.
        self.assertEqual(preview.excluded_suppressed, 0)

    def test_registered_users_are_included_only_after_an_explicit_marketing_opt_in(self):
        self.opt_in("opted@example.test")
        self.opt_in("quiet@example.test", marketing=False)

        preview = campaigns.resolve_audiences([EmailCampaign.Audience.OPTED_IN_USERS])
        self.assertEqual([row["email"] for row in preview.recipients], ["opted@example.test"])

    def test_landing_twice_across_audiences_sends_one_message(self):
        self.subscriber("both@example.test")
        self.opt_in("both@example.test")
        self.subscriber("Deactivated@Example.TEST")

        preview = campaigns.resolve_audiences(
            [EmailCampaign.Audience.NEWSLETTER_SUBSCRIBERS, EmailCampaign.Audience.OPTED_IN_USERS]
        )
        self.assertEqual([row["email"] for row in preview.recipients],
                         ["both@example.test", "deactivated@example.test"])
        self.assertEqual(preview.duplicates, 1)

    def test_a_suppressed_address_wins_over_any_other_audience(self):
        self.subscriber("block@other.test", status=NewsletterSubscription.Status.SUPPRESSED)
        self.opt_in("block@other.test")
        self.subscriber("bounce@other.test", status=NewsletterSubscription.Status.BOUNCED)

        preview = campaigns.resolve_audiences(
            [EmailCampaign.Audience.NEWSLETTER_SUBSCRIBERS, EmailCampaign.Audience.OPTED_IN_USERS]
        )
        self.assertEqual(preview.recipients, [])
        self.assertEqual(preview.excluded_suppressed, 1)

    def test_unknown_audience_key_is_reported_instead_of_silently_ignored(self):
        preview = campaigns.resolve_audiences(["EVERYONE"])
        self.assertEqual(preview.recipients, [])
        self.assertEqual(preview.unknown_audiences, ["EVERYONE"])

    def test_queueing_freezes_the_audience_and_is_idempotent(self):
        self.subscriber("one@example.test")
        self.subscriber("two@example.test")
        campaign = self.campaign()

        self.assertTrue(campaigns.queue_campaign(campaign))
        campaign.refresh_from_db()
        self.assertEqual(campaign.status, EmailCampaign.Status.QUEUED)
        self.assertEqual(campaign.recipient_count, 2)
        self.assertEqual(campaign.recipients.count(), 2)

        # A new sign-up after queueing does not join a campaign already in flight,
        # and queueing twice cannot double the recipient rows.
        self.subscriber("three@example.test")
        self.assertFalse(campaigns.queue_campaign(campaign))
        self.assertEqual(campaign.recipients.count(), 2)

    def test_delivery_sends_one_private_message_per_recipient(self):
        self.subscriber("a@example.test", first_name="Aisha")
        self.subscriber("b@example.test")
        campaign = self.campaign()
        campaigns.queue_campaign(campaign)

        result = campaigns.deliver_campaign(campaign)
        self.assertTrue(result["claimed"])
        self.assertEqual(result["sent"], 2)
        self.assertEqual(result["remaining"], 0)

        campaign.refresh_from_db()
        self.assertEqual(campaign.status, EmailCampaign.Status.COMPLETED)
        self.assertEqual(campaign.accepted_count, 2)
        self.assertIsNotNone(campaign.completed_at)

        self.assertEqual(len(mail.outbox), 2)
        for message in mail.outbox:
            self.assertEqual(len(message.to), 1)
            self.assertFalse(message.cc)
            self.assertFalse(message.bcc)

        html = mail.outbox[0].alternatives[0][0]
        self.assertIn("First paragraph.", html)
        self.assertIn("Second paragraph.", html)
        self.assertIn("Unsubscribe", html)
        self.assertIn("token=", html)

    def test_limit_batches_the_send_and_leaves_the_campaign_in_progress(self):
        self.subscriber("a@example.test")
        self.subscriber("b@example.test")
        self.subscriber("c@example.test")
        campaign = self.campaign()
        campaigns.queue_campaign(campaign)

        first = campaigns.deliver_campaign(campaign, limit=2)
        self.assertEqual(first["sent"], 2)
        self.assertEqual(first["remaining"], 1)
        campaign.refresh_from_db()
        self.assertEqual(campaign.status, EmailCampaign.Status.SENDING)

        second = campaigns.deliver_campaign(campaign, limit=2)
        self.assertEqual(second["sent"], 1)
        self.assertEqual(second["remaining"], 0)

    def test_unsubscribing_after_queueing_skips_the_address(self):
        self.subscriber("stay@example.test")
        leaving = self.subscriber("leave@example.test")
        campaign = self.campaign()
        campaigns.queue_campaign(campaign)

        leaving.status = NewsletterSubscription.Status.UNSUBSCRIBED
        leaving.save(update_fields=["status", "updated_at"])

        result = campaigns.deliver_campaign(campaign)
        self.assertEqual(result["sent"], 1)
        self.assertEqual(result["skipped"], 1)
        self.assertNotIn("leave@example.test", [m.to[0] for m in mail.outbox])
        skipped = campaign.recipients.get(email="leave@example.test")
        self.assertEqual(skipped.status, EmailCampaignRecipient.Status.SKIPPED)

    @override_settings(EMAIL_BACKEND="apps.core.tests.FailingEmailBackend")
    def test_provider_failure_retries_then_fails_without_losing_the_campaign(self):
        self.subscriber("retry@example.test")
        campaign = self.campaign()
        campaigns.queue_campaign(campaign)

        for expected_attempts in (1, 2):
            result = campaigns.deliver_campaign(campaign)
            self.assertEqual(result["failed"], 0)
            campaign.refresh_from_db()
            self.assertEqual(campaign.status, EmailCampaign.Status.SENDING)
            recipient = campaign.recipients.get()
            self.assertEqual(recipient.attempts, expected_attempts)
            self.assertEqual(recipient.status, EmailCampaignRecipient.Status.PENDING)

        result = campaigns.deliver_campaign(campaign)
        self.assertEqual(result["failed"], 1)
        campaign.refresh_from_db()
        self.assertEqual(campaign.status, EmailCampaign.Status.COMPLETED)
        self.assertEqual(campaign.failed_count, 1)
        recipient = campaign.recipients.get()
        self.assertEqual(recipient.status, EmailCampaignRecipient.Status.FAILED)
        self.assertIn("provider refused", recipient.error)

    def test_a_second_worker_cannot_claim_the_same_campaign(self):
        self.subscriber("solo@example.test")
        campaign = self.campaign()
        campaigns.queue_campaign(campaign)
        campaigns.deliver_campaign(campaign)  # moves QUEUED -> SENDING

        other = EmailCampaign.objects.get(pk=campaign.pk)
        other.status = EmailCampaign.Status.QUEUED
        result = campaigns.deliver_campaign(other)
        self.assertFalse(result["claimed"])

    def test_send_test_never_touches_recipient_rows(self):
        self.subscriber("real@example.test")
        campaign = self.campaign()

        campaigns.send_test(campaign, "me@example.test")
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ["me@example.test"])
        self.assertTrue(mail.outbox[0].subject.startswith("[TEST] "))
        self.assertEqual(campaign.recipients.count(), 0)
        campaign.refresh_from_db()
        self.assertEqual(campaign.status, EmailCampaign.Status.DRAFT)

    def test_cancel_stops_a_queued_campaign(self):
        self.subscriber("never@example.test")
        campaign = self.campaign()
        campaigns.queue_campaign(campaign)

        self.assertTrue(campaigns.cancel_campaign(campaign))
        campaign.refresh_from_db()
        self.assertEqual(campaign.status, EmailCampaign.Status.CANCELLED)
        self.assertEqual(campaigns.deliver_campaign(campaign)["sent"], 0)
        self.assertEqual(len(mail.outbox), 0)

    def test_body_is_escaped_in_the_html_alternative(self):
        self.subscriber("xss@example.test")
        campaign = self.campaign(body='<script>alert("hi")</script>')
        campaigns.send_test(campaign, "xss@example.test")

        message = mail.outbox[0]
        html = message.alternatives[0][0]
        self.assertNotIn("<script>alert", html)
        self.assertIn("&lt;script&gt;", html)
        # The plain-text alternative is not markup, so it carries the body verbatim.
        self.assertIn('<script>alert("hi")</script>', message.body)

    def test_management_command_sends_every_queued_campaign(self):
        self.subscriber("command@example.test")
        campaign = self.campaign()
        campaigns.queue_campaign(campaign)

        out = StringIO()
        call_command("send_email_campaign", stdout=out)
        self.assertIn("completed", out.getvalue())
        campaign.refresh_from_db()
        self.assertEqual(campaign.status, EmailCampaign.Status.COMPLETED)
        self.assertEqual(len(mail.outbox), 1)

    def test_management_command_reports_nothing_to_send(self):
        out = StringIO()
        call_command("send_email_campaign", stdout=out)
        self.assertIn("No queued campaigns", out.getvalue())

    def test_empty_audience_queue_completes_without_sending(self):
        campaign = self.campaign()
        campaigns.queue_campaign(campaign)

        result = campaigns.deliver_campaign(campaign)
        self.assertEqual(result["sent"], 0)
        self.assertEqual(result["remaining"], 0)
        campaign.refresh_from_db()
        self.assertEqual(campaign.status, EmailCampaign.Status.COMPLETED)
        self.assertEqual(len(mail.outbox), 0)


class EmailAdminApiTests(ApiTestCase):
    """Who may reach /api/manage/email/*, and what the admin screens can rely on."""

    SUBSCRIBERS = "/api/manage/email/subscribers/"
    CAMPAIGNS = "/api/manage/email/campaigns/"

    def setUp(self):
        super().setUp()
        cache.clear()
        self.client = APIClient()
        self.admin = User.objects.create_user(
            email="emailadmin@example.test", password="Passw0rd!", role=Role.ADMIN,
            first_name="Ella", last_name="Admin",
        )
        self.landlord = User.objects.create_user(
            email="landowner@example.test", password="Passw0rd!", role=Role.LANDLORD,
            first_name="Len", last_name="Owner",
        )
        self.tenant = User.objects.create_user(
            email="renter@example.test", password="Passw0rd!", role=Role.TENANT,
            first_name="Tom", last_name="Renter",
        )
        self.subscription = NewsletterSubscription.objects.create(
            email="reader@example.test", first_name="Rita",
            status=NewsletterSubscription.Status.SUBSCRIBED,
            consent_given_at=timezone.now(), confirmed_at=timezone.now(),
        )

    def draft(self, **overrides):
        payload = {
            "name": "October note",
            "subject": "October opportunities",
            "body": "First paragraph.\n\nSecond paragraph.",
            "audiences": [EmailCampaign.Audience.NEWSLETTER_SUBSCRIBERS],
        }
        payload.update(overrides)
        self.client.force_authenticate(self.admin)
        response = self.client.post(self.CAMPAIGNS, payload, format="json")
        self.assertEqual(response.status_code, 201, response.json())
        return response.json()["id"]

    def test_anonymous_landlord_and_tenant_cannot_reach_the_email_admin(self):
        for path in (self.SUBSCRIBERS, self.CAMPAIGNS, f"{self.CAMPAIGNS}stats/"):
            self.client.force_authenticate(user=None)
            self.assertEqual(self.client.get(path).status_code, 401, path)
            for other in (self.landlord, self.tenant):
                self.client.force_authenticate(other)
                self.assertEqual(self.client.get(path).status_code, 403, path)

    def test_subscriber_rows_never_carry_token_material(self):
        newsletter.subscribe(email="pending@example.test", first_name="Pen")
        pending = NewsletterSubscription.objects.get(email="pending@example.test")
        # Signing up fills both token hashes, so the leak check has something to find.
        newsletter.send_confirmation_email(pending)
        pending.refresh_from_db()
        self.assertTrue(pending.confirm_token_hash)
        self.assertTrue(pending.unsubscribe_token_hash)

        self.client.force_authenticate(self.admin)
        body = self.client.get(self.SUBSCRIBERS).json()["results"]
        joined = json.dumps(body)
        self.assertEqual(len(body), 2)
        for key in ("confirm_token_hash", "unsubscribe_token_hash", "confirm_token_created_at"):
            self.assertNotIn(key, joined)
        for row in body:
            self.assertEqual([key for key in row if "token" in key], [])
        self.assertNotIn(pending.confirm_token_hash, joined)
        self.assertNotIn(pending.unsubscribe_token_hash, joined)

    def test_subscribers_can_be_searched_and_filtered(self):
        NewsletterSubscription.objects.create(
            email="gone@example.test", status=NewsletterSubscription.Status.UNSUBSCRIBED,
            consent_given_at=timezone.now(), unsubscribed_at=timezone.now(),
        )
        self.client.force_authenticate(self.admin)

        self.assertEqual(
            [row["email"] for row in self.client.get(self.SUBSCRIBERS, {"status": "UNSUBSCRIBED"}).json()["results"]],
            ["gone@example.test"],
        )
        self.assertEqual(
            [row["email"] for row in self.client.get(self.SUBSCRIBERS, {"search": "reader"}).json()["results"]],
            ["reader@example.test"],
        )

    def test_only_notes_is_editable_on_a_subscriber(self):
        self.client.force_authenticate(self.admin)

        response = self.client.patch(
            f"{self.SUBSCRIBERS}{self.subscription.pk}/",
            {"notes": "Asked to stop manual reminders", "status": "SUPPRESSED",
             "email": "hijack@example.test"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.subscription.refresh_from_db()
        self.assertEqual(self.subscription.notes, "Asked to stop manual reminders")
        self.assertEqual(self.subscription.status, NewsletterSubscription.Status.SUBSCRIBED)
        self.assertEqual(self.subscription.email, "reader@example.test")

    def test_subscribers_cannot_be_created_replaced_or_deleted_through_the_api(self):
        self.client.force_authenticate(self.admin)
        self.assertEqual(
            self.client.post(self.SUBSCRIBERS, {"email": "typed@example.test"}, format="json").status_code,
            405,
        )
        self.assertEqual(
            self.client.put(
                f"{self.SUBSCRIBERS}{self.subscription.pk}/",
                {"email": "reader@example.test", "status": "SUPPRESSED"},
                format="json",
            ).status_code,
            405,
        )
        self.assertEqual(self.client.delete(f"{self.SUBSCRIBERS}{self.subscription.pk}/").status_code, 405)
        self.assertTrue(NewsletterSubscription.objects.filter(pk=self.subscription.pk).exists())

    def test_suppress_action_stops_mail_and_kills_the_pending_link(self):
        pending = NewsletterSubscription.objects.create(
            email="wait@example.test", status=NewsletterSubscription.Status.PENDING_CONFIRMATION,
            consent_given_at=timezone.now(),
        )
        newsletter.send_confirmation_email(pending)
        pending.refresh_from_db()
        self.assertTrue(pending.confirm_token_hash)

        self.client.force_authenticate(self.admin)
        response = self.client.post(f"{self.SUBSCRIBERS}{pending.pk}/suppress/")
        self.assertEqual(response.status_code, 200)
        pending.refresh_from_db()
        self.assertEqual(pending.status, NewsletterSubscription.Status.SUPPRESSED)
        self.assertEqual(pending.confirm_token_hash, "")

        self.client.credentials()
        replay = self.client.post("/api/newsletter/confirm/",
                                  {"token": self.token_from_mail(mail.outbox[0])}, format="json")
        self.assertEqual(replay.status_code, 400)
        self.assertEqual(replay.json()["status"], "invalid")

    def test_reactivate_requires_a_fresh_confirmation_click(self):
        self.client.force_authenticate(self.admin)
        refused = self.client.post(f"{self.SUBSCRIBERS}{self.subscription.pk}/reactivate/")
        self.assertEqual(refused.status_code, 400)

        self.subscription.status = NewsletterSubscription.Status.UNSUBSCRIBED
        self.subscription.unsubscribed_at = timezone.now()
        self.subscription.save(update_fields=["status", "unsubscribed_at", "updated_at"])

        response = self.client.post(f"{self.SUBSCRIBERS}{self.subscription.pk}/reactivate/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "PENDING_CONFIRMATION")

        self.subscription.refresh_from_db()
        self.assertEqual(self.subscription.status, NewsletterSubscription.Status.PENDING_CONFIRMATION)
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(
            campaigns.resolve_audiences([EmailCampaign.Audience.NEWSLETTER_SUBSCRIBERS]).eligible, 0
        )

        self.client.credentials()
        confirm = self.client.post(
            "/api/newsletter/confirm/",
            {"token": self.token_from_mail(mail.outbox[0])},
            format="json",
        )
        self.assertEqual(confirm.status_code, 200)
        self.subscription.refresh_from_db()
        self.assertEqual(self.subscription.status, NewsletterSubscription.Status.SUBSCRIBED)

    @staticmethod
    def token_from_mail(message):
        html = message.alternatives[0][0]
        return re.search(r"token=([A-Za-z0-9_\-]+)", html).group(1)

    def test_campaign_draft_crud_stays_editable_until_queued(self):
        self.client.force_authenticate(self.admin)
        campaign_id = self.draft()

        update = self.client.patch(
            f"{self.CAMPAIGNS}{campaign_id}/", {"subject": "Changed subject"}, format="json"
        )
        self.assertEqual(update.status_code, 200)
        self.assertEqual(update.json()["subject"], "Changed subject")
        self.assertTrue(update.json()["is_editable"])
        self.assertEqual(EmailCampaign.objects.get(pk=campaign_id).created_by, self.admin)

        bad = self.client.patch(
            f"{self.CAMPAIGNS}{campaign_id}/", {"audiences": []}, format="json"
        )
        self.assertEqual(bad.status_code, 400)
        missing = self.client.post(self.CAMPAIGNS, {"name": "abc", "subject": "abcd",
                                                    "body": "abcdefghij"}, format="json")
        self.assertEqual(missing.status_code, 400)

    def test_audience_count_is_resolved_on_the_server(self):
        self.client.force_authenticate(self.admin)
        estimate = self.client.post(f"{self.CAMPAIGNS}audience-count/",
                                    {"audiences": [EmailCampaign.Audience.NEWSLETTER_SUBSCRIBERS]},
                                    format="json")
        self.assertEqual(estimate.status_code, 200)
        self.assertEqual(estimate.json()["eligible"], 1)

        self.opted_in = User.objects.create_user(
            email="optin@example.test", password="Passw0rd!", role=Role.TENANT,
            first_name="Olive", last_name="In", marketing_opt_in=True,
        )
        both = self.client.post(
            f"{self.CAMPAIGNS}audience-count/",
            {"audiences": [EmailCampaign.Audience.NEWSLETTER_SUBSCRIBERS,
                           EmailCampaign.Audience.OPTED_IN_USERS]},
            format="json",
        ).json()
        self.assertEqual(both["eligible"], 2)

        nobody = self.client.post(f"{self.CAMPAIGNS}audience-count/",
                                  {"audiences": ["EVERYONE"]}, format="json")
        self.assertEqual(nobody.status_code, 400)

    def test_preview_and_test_send_are_available_to_admins(self):
        self.client.force_authenticate(self.admin)
        campaign_id = self.draft()

        preview = self.client.get(f"{self.CAMPAIGNS}{campaign_id}/preview/")
        self.assertEqual(preview.status_code, 200)
        self.assertIn("First paragraph.", preview.json()["html"])
        self.assertIn("/newsletter/unsubscribe?token=", preview.json()["html"])

        send = self.client.post(f"{self.CAMPAIGNS}{campaign_id}/test/",
                                {"email": "boss@example.test"}, format="json")
        self.assertEqual(send.status_code, 200)
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ["boss@example.test"])
        self.assertTrue(mail.outbox[0].subject.startswith("[TEST] "))
        self.assertEqual(EmailCampaign.objects.get(pk=campaign_id).recipients.count(), 0)

    def test_queueing_locks_the_campaign_and_repeats_are_refused(self):
        self.client.force_authenticate(self.admin)
        campaign_id = self.draft()

        queued = self.client.post(f"{self.CAMPAIGNS}{campaign_id}/queue/")
        self.assertEqual(queued.status_code, 200)
        self.assertEqual(queued.json()["status"], "QUEUED")
        self.assertEqual(queued.json()["recipient_count"], 1)

        again = self.client.post(f"{self.CAMPAIGNS}{campaign_id}/queue/")
        self.assertEqual(again.status_code, 409)

        edit = self.client.patch(f"{self.CAMPAIGNS}{campaign_id}/",
                                {"subject": "Too late"}, format="json")
        self.assertEqual(edit.status_code, 400)

        delete = self.client.delete(f"{self.CAMPAIGNS}{campaign_id}/")
        self.assertEqual(delete.status_code, 403)
        self.assertTrue(EmailCampaign.objects.filter(pk=campaign_id).exists())

    def test_queueing_an_empty_audience_is_refused(self):
        self.subscription.delete()
        self.client.force_authenticate(self.admin)
        campaign_id = self.draft()
        response = self.client.post(f"{self.CAMPAIGNS}{campaign_id}/queue/")
        self.assertEqual(response.status_code, 400)
        campaign = EmailCampaign.objects.get(pk=campaign_id)
        self.assertEqual(campaign.status, EmailCampaign.Status.DRAFT)

    def test_cancel_stops_a_queued_campaign(self):
        self.client.force_authenticate(self.admin)
        campaign_id = self.draft()
        self.client.post(f"{self.CAMPAIGNS}{campaign_id}/queue/")

        cancel = self.client.post(f"{self.CAMPAIGNS}{campaign_id}/cancel/")
        self.assertEqual(cancel.status_code, 200)
        self.assertEqual(cancel.json()["status"], "CANCELLED")
        self.assertEqual(self.client.post(f"{self.CAMPAIGNS}{campaign_id}/cancel/").status_code, 409)

    def test_recipient_report_is_scoped_to_the_campaign(self):
        User.objects.create_user(
            email="optin@example.test", password="Passw0rd!", role=Role.TENANT,
            first_name="Olive", last_name="In", marketing_opt_in=True,
        )
        self.client.force_authenticate(self.admin)
        subscribers = self.draft()
        opted_in = self.draft(
            name="Tenant note", audiences=[EmailCampaign.Audience.OPTED_IN_USERS],
        )
        self.client.post(f"{self.CAMPAIGNS}{subscribers}/queue/")
        self.client.post(f"{self.CAMPAIGNS}{opted_in}/queue/")

        rows = self.client.get(f"{self.CAMPAIGNS}{subscribers}/recipients/").json()["results"]
        self.assertEqual([row["email"] for row in rows], ["reader@example.test"])
        self.assertEqual(rows[0]["status"], "PENDING")

        other = self.client.get(f"{self.CAMPAIGNS}{opted_in}/recipients/").json()["results"]
        self.assertEqual([row["email"] for row in other], ["optin@example.test"])

    def test_campaign_stats_tell_the_truth_about_the_mail_backend(self):
        self.client.force_authenticate(self.admin)
        stats = self.client.get(f"{self.CAMPAIGNS}stats/").json()
        self.assertEqual(stats["email_backend"], "locmem.EmailBackend")
        self.assertFalse(stats["sends_real_mail"])
        self.assertEqual(stats["total"], 0)

        with override_settings(EMAIL_BACKEND="django.core.mail.backends.smtp.EmailBackend"):
            smtp = self.client.get(f"{self.CAMPAIGNS}stats/").json()
            self.assertTrue(smtp["sends_real_mail"])

        with override_settings(EMAIL_BACKEND="django.core.mail.backends.console.EmailBackend"):
            console = self.client.get(f"{self.CAMPAIGNS}stats/").json()
            self.assertEqual(console["email_backend"], "console.EmailBackend")
            self.assertFalse(console["sends_real_mail"])
