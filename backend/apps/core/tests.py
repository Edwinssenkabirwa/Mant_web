"""Tests for admin-managed services, the newsletter and email campaigns, the landlord
portal's access rules and the property recommendation queue."""
import json
import os
import re
import zlib
from base64 import a85decode, b64decode
from datetime import date, timedelta
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
from apps.billing.models import Invoice, Payment
from apps.core.models import (
    Company,
    EmailCampaign,
    EmailCampaignRecipient,
    NewsletterSubscription,
    Service,
)
from apps.core.services import campaigns, newsletter
from apps.core.services.documents import render_invoice_pdf, render_receipt_pdf
from apps.core.testing import ApiTestCase
from apps.leases.models import Lease
from apps.messaging.services import get_or_create_conversation
from apps.properties.models import Enquiry, Property, PropertyRecommendation

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
                "Land & property documentation",
                "Contracting & lobbying",
                "Debt recovery",
            ],
        )

    def test_rent_desk_payouts_are_published_with_their_terms(self):
        """The dated-promise bullets only read honestly next to the terms that bound them."""
        call_command("seed_services", verbosity=0)
        service = Service.objects.get(slug="property-management")
        text = f"{service.summary} {service.description}".lower()
        self.assertIn("using the property as collateral", text)
        self.assertIn("stress-free life", text)
        self.assertIn("not a bank product", text)

    def test_debt_recovery_guarantees_progress_not_the_sum(self):
        call_command("seed_services", verbosity=0)
        service = Service.objects.get(slug="debt-recovery")
        self.assertIn("guarantee these individuals' progress", service.description)
        self.assertIn("no outcome can be guaranteed", service.limitations.lower())

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


def last_month():
    """(first day, last day) of the month before this one — always inside the trend window."""
    this_month = timezone.localdate().replace(day=1)
    previous = this_month - timedelta(days=1)
    return previous.replace(day=1), previous


class LandlordPortalAccessTests(ApiTestCase):
    """What an owner may see of his own book: the trend and the occupancy, never the office's
    invoices, receipts or a tenant's details."""

    OVERVIEW = "/api/landlord/overview/"
    RENT_BOOK = [
        "/api/invoices/", "/api/payments/", "/api/receipts/", "/api/leases/",
        "/api/analytics/", "/api/statements/",
    ]

    def setUp(self):
        super().setUp()
        self.client = APIClient()
        self.admin = User.objects.create_user(
            email="office@example.test", password="Passw0rd!", role=Role.ADMIN,
            first_name="Ada", last_name="Admin",
        )
        self.landlord = User.objects.create_user(
            email="owner@example.test", password="Passw0rd!", role=Role.LANDLORD,
            first_name="Len", last_name="Owner", phone="+256700000001",
        )
        self.neighbour = User.objects.create_user(
            email="neighbour@example.test", password="Passw0rd!", role=Role.LANDLORD,
            first_name="Nina", last_name="Owner",
        )
        self.tenant = User.objects.create_user(
            email="renter@example.test", password="Passw0rd!", role=Role.TENANT,
            first_name="Tom", last_name="Renter", phone="+256700000002",
        )

    def let_property(self, landlord, title, rent, paid=None):
        """One occupied unit, one tenancy, one invoice for last month and part-payment against it."""
        month_start, month_end = last_month()
        prop = Property.objects.create(
            owner=landlord, title=title, description="A test unit.", price=rent,
            address="1 Test Road", city="Kampala", status=Property.Status.OCCUPIED,
        )
        lease = Lease.objects.create(
            property=prop, tenant=self.tenant, landlord=landlord,
            start_date=month_start.replace(day=1),
            end_date=month_end.replace(year=month_end.year + 5), monthly_rent=rent,
        )
        invoice = Invoice.objects.create(
            lease=lease, property=prop, tenant=self.tenant, landlord=landlord,
            period_start=month_start, period_end=month_end,
            issue_date=month_start, due_date=month_start + timedelta(days=4),
            rent_amount=rent,
        )
        if paid:
            Payment.objects.create(
                invoice=invoice, lease=lease, tenant=self.tenant, amount=paid,
                status=Payment.Status.CONFIRMED, paid_on=month_start + timedelta(days=2),
                recorded_by=self.admin, confirmed_by=self.admin,
            )
        return prop, lease, invoice

    def test_a_landlord_is_locked_out_of_every_rent_book_endpoint(self):
        self.let_property(self.landlord, "Nakawa apartment", 1_000_000, paid=500_000)
        self.client.force_authenticate(self.landlord)
        for path in self.RENT_BOOK:
            self.assertEqual(self.client.get(path).status_code, 403, path)

    def test_the_office_and_the_tenant_still_reach_the_rent_book(self):
        self.let_property(self.landlord, "Nakawa apartment", 1_000_000, paid=500_000)
        for user in (self.admin, self.tenant):
            self.client.force_authenticate(user)
            for path in self.RENT_BOOK:
                self.assertEqual(self.client.get(path).status_code, 200, f"{user.role} {path}")

    def test_a_landlord_cannot_write_money_records_or_download_tenant_documents(self):
        _, _, invoice = self.let_property(self.landlord, "Nakawa apartment", 1_000_000)
        payment = Payment.objects.create(
            invoice=invoice, lease=invoice.lease, tenant=self.tenant, amount=250_000,
            paid_on=last_month()[0] + timedelta(days=3),
        )
        self.client.force_authenticate(self.landlord)
        self.assertEqual(self.client.post("/api/invoices/", {}, format="json").status_code, 403)
        self.assertEqual(
            self.client.post(f"/api/payments/{payment.pk}/confirm/", {}, format="json").status_code,
            403,
        )
        payment.refresh_from_db()
        self.assertEqual(payment.status, Payment.Status.PENDING)
        self.assertEqual(self.client.get(f"/api/invoices/{invoice.pk}/pdf/").status_code, 403)

    def test_overview_reports_his_own_collection_and_occupancy_only(self):
        self.let_property(self.landlord, "Nakawa apartment", 1_000_000, paid=600_000)
        self.let_property(self.neighbour, "Entebbe bungalow", 4_000_000, paid=4_000_000)
        self.client.force_authenticate(self.landlord)

        body = self.client.get(self.OVERVIEW).json()
        self.assertEqual(float(body["collection"]["collected"]), 600_000)
        self.assertEqual(float(body["collection"]["outstanding"]), 400_000)
        self.assertEqual(body["occupancy"]["properties"], 1)
        self.assertEqual(body["occupancy"]["occupied"], 1)
        self.assertEqual([row["title"] for row in body["occupancy"]["by_property"]],
                         ["Nakawa apartment"])

        # The trend is the point of the page, and it must carry the month it belongs to.
        billed_month = last_month()[0].strftime("%Y-%m")
        rows = [row for row in body["collection"]["monthly"] if row["month"] == billed_month]
        self.assertEqual(len(rows), 1)
        self.assertEqual(float(rows[0]["invoiced"]), 1_000_000)
        self.assertEqual(float(rows[0]["collected"]), 600_000)

        joined = json.dumps(body)
        for secret in ("Tom Renter", "renter@example.test", "+256700000002", "Entebbe bungalow"):
            self.assertNotIn(secret, joined)

    def test_overview_is_closed_to_every_other_role(self):
        self.client.credentials()
        self.assertEqual(self.client.get(self.OVERVIEW).status_code, 401)
        for other in (self.admin, self.tenant):
            self.client.force_authenticate(other)
            self.assertEqual(self.client.get(self.OVERVIEW).status_code, 403)

    def test_a_landlords_inbox_excludes_threads_that_hold_a_tenant(self):
        get_or_create_conversation(
            participants=[self.landlord, self.admin], subject="Rent desk", created_by=self.admin,
        )
        get_or_create_conversation(
            participants=[self.landlord, self.admin, self.tenant],
            subject="Arrears call", created_by=self.admin,
        )
        self.client.force_authenticate(self.landlord)
        subjects = [row["subject"] for row in self.client.get("/api/conversations/").json()["results"]]
        self.assertEqual(subjects, ["Rent desk"])

        self.client.force_authenticate(self.admin)
        admin_subjects = [
            row["subject"] for row in self.client.get("/api/conversations/").json()["results"]
        ]
        self.assertEqual(sorted(admin_subjects), ["Arrears call", "Rent desk"])


class PropertyRecommendationTests(ApiTestCase):
    """Owners recommend, the office verifies. A recommendation becomes a public listing
    only when an administrator says so — never when the owner types it in."""

    OWN = "/api/landlord/recommendations/"
    QUEUE = "/api/manage/recommendations/"
    CATALOGUE = "/api/manage/properties/"

    COMPLETE = {
        "title": "Kisenyi two-bedroom maisonette",
        "description": "A finished maisonette on a quiet street, close to the town centre.",
        "listing_kind": "RENT",
        "property_type": "HOUSE",
        "bedrooms": 2,
        "bathrooms": 2,
        "area": 140,
        "address": "Plot 14, Kisenyi Road",
        "city": "Kampala",
        "district": "Central",
        "ownership": "OWN",
        "occupancy": "VACANT",
        "paperwork": "TITLE",
        "price_expectation": 1800000,
        "price_period": "MONTHLY",
        "currency": "UGX",
        "inspection_contact": "Call the owner on +256 700 000 001",
    }

    def setUp(self):
        super().setUp()
        self.client = APIClient()
        self.admin = User.objects.create_user(
            email="desk@example.test", password="Passw0rd!", role=Role.ADMIN,
            first_name="Ada", last_name="Admin",
        )
        self.landlord = User.objects.create_user(
            email="owner@example.test", password="Passw0rd!", role=Role.LANDLORD,
            first_name="Len", last_name="Owner", phone="+256700000001",
        )
        self.neighbour = User.objects.create_user(
            email="neighbour@example.test", password="Passw0rd!", role=Role.LANDLORD,
            first_name="Nina", last_name="Owner",
        )

    def sent(self, user=None, **overrides):
        """A recommendation the owner has already handed to the desk."""
        answers = dict(self.COMPLETE)
        answers.update(overrides)
        return PropertyRecommendation.objects.create(
            recommender=user or self.landlord, status=PropertyRecommendation.Status.SUBMITTED,
            submitted_at=timezone.now(), **answers
        )

    def signup_draft(self, user):
        return PropertyRecommendation.objects.get(recommender=user)

    def ids(self, response):
        return [row["id"] for row in response.json()["results"]]

    # --- what an account opening leaves behind --------------------------------
    def test_a_new_landlord_finds_an_empty_draft_and_a_new_tenant_an_enquiry(self):
        fresh = User.objects.create_user(
            email="newowner@example.test", password="Passw0rd!", role=Role.LANDLORD,
            first_name="New", last_name="Owner",
        )
        renter = User.objects.create_user(
            email="newrenter@example.test", password="Passw0rd!", role=Role.TENANT,
            first_name="New", last_name="Renter", phone="+256700000009",
        )
        drafts = PropertyRecommendation.objects.filter(recommender=fresh)
        self.assertEqual(drafts.count(), 1)
        self.assertEqual(drafts.first().status, PropertyRecommendation.Status.DRAFT)
        self.assertEqual(drafts.first().title, "")

        enquiries = Enquiry.objects.filter(email=renter.email)
        self.assertEqual(enquiries.count(), 1)
        self.assertEqual(enquiries.first().status, Enquiry.Status.NEW)
        self.assertIn("property brief", enquiries.first().subject.lower())

    def test_an_administrator_opens_without_paperwork(self):
        # One draft each for the two landlords created above, and nothing for the administrator.
        self.assertEqual(PropertyRecommendation.objects.count(), 2)
        self.assertEqual(
            PropertyRecommendation.objects.filter(recommender=self.admin).count(), 0
        )
        self.assertEqual(Enquiry.objects.count(), 0)

    # --- the owner's own copies ----------------------------------------------
    def test_the_owner_sees_his_own_drafts_and_nothing_else(self):
        self.sent(self.neighbour)
        self.client.force_authenticate(self.landlord)
        rows = self.client.get(self.OWN).json()["results"]
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["status"], "DRAFT")
        self.assertEqual(rows[0]["recommender"], self.landlord.pk)

    def test_the_queue_starts_where_the_owners_work_stops(self):
        draft = self.signup_draft(self.landlord)
        submitted = self.sent()
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.ids(self.client.get(self.QUEUE)), [submitted.pk])
        self.assertIn(draft.pk, self.ids(self.client.get(self.QUEUE + "?status=DRAFT")))

    def test_a_half_filled_recommendation_is_not_sent(self):
        self.client.force_authenticate(self.landlord)
        created = self.client.post(self.OWN, {"title": "Something on Nakawa"}, format="json")
        self.assertEqual(created.status_code, 201, created.json())
        pk = created.json()["id"]
        refused = self.client.post(f"{self.OWN}{pk}/submit/", {}, format="json")
        self.assertEqual(refused.status_code, 400)
        self.assertIn("Still needed", refused.json()["detail"])
        self.assertEqual(
            PropertyRecommendation.objects.get(pk=pk).status,
            PropertyRecommendation.Status.DRAFT,
        )

    def test_a_complete_recommendation_reaches_the_desk(self):
        self.client.force_authenticate(self.landlord)
        created = self.client.post(self.OWN, self.COMPLETE, format="json")
        self.assertEqual(created.status_code, 201, created.json())
        pk = created.json()["id"]
        sent = self.client.post(f"{self.OWN}{pk}/submit/", {}, format="json")
        self.assertEqual(sent.status_code, 200, sent.json())
        self.assertEqual(sent.json()["status"], "SUBMITTED")
        self.assertIsNotNone(sent.json()["submitted_at"])

        self.client.force_authenticate(self.admin)
        self.assertIn(pk, self.ids(self.client.get(self.QUEUE)))

    def test_an_owner_cannot_put_a_listing_into_the_catalogue_himself(self):
        own = Property.objects.create(
            owner=self.landlord, title="His own unit", description="Test.", price=900_000,
            address="1 Road", city="Kampala",
        )
        self.client.force_authenticate(self.landlord)
        self.assertEqual(self.client.get(self.CATALOGUE).status_code, 200)
        payload = {"title": "Published by me", "description": "Test.", "price": 100,
                   "address": "1 Road", "city": "Kampala"}
        self.assertEqual(self.client.post(self.CATALOGUE, payload, format="json").status_code, 403)
        self.assertEqual(
            self.client.patch(f"{self.CATALOGUE}{own.pk}/", {"title": "Renamed"},
                              format="json").status_code, 403,
        )
        self.assertEqual(self.client.delete(f"{self.CATALOGUE}{own.pk}/").status_code, 403)
        self.assertEqual(
            self.client.post(f"{self.CATALOGUE}{own.pk}/images/").status_code, 403,
        )
        own.refresh_from_db()
        self.assertEqual(own.title, "His own unit")

    def test_one_owners_recommendation_is_invisible_to_the_next(self):
        other = self.sent(self.neighbour)
        self.client.force_authenticate(self.landlord)
        self.assertEqual(self.client.get(f"{self.OWN}{other.pk}/").status_code, 404)
        self.assertEqual(
            self.client.patch(f"{self.OWN}{other.pk}/", {"title": "Mine now"},
                              format="json").status_code, 404,
        )
        self.assertEqual(
            PropertyRecommendation.objects.get(pk=other.pk).title,
            "Kisenyi two-bedroom maisonette",
        )

    def test_an_owner_cannot_decide_his_own_recommendation(self):
        recommendation = self.sent()
        self.client.force_authenticate(self.landlord)
        for verb in ("verify", "decline", "review"):
            self.assertEqual(
                self.client.post(f"{self.OWN}{recommendation.pk}/{verb}/", {},
                                 format="json").status_code, 404, verb,
            )
        self.assertEqual(self.client.get(self.QUEUE).status_code, 403)
        recommendation.refresh_from_db()
        self.assertEqual(recommendation.status, PropertyRecommendation.Status.SUBMITTED)

    # --- the desk's side ------------------------------------------------------
    def test_verifying_publishes_a_listing_owned_by_the_landlord(self):
        recommendation = self.sent()
        self.client.force_authenticate(self.admin)
        answer = self.client.post(f"{self.QUEUE}{recommendation.pk}/verify/", {}, format="json")
        self.assertEqual(answer.status_code, 200, answer.json())
        body = answer.json()
        self.assertEqual(body["status"], "VERIFIED")
        self.assertEqual(body["decided_by_name"], "Ada Admin")

        listing = Property.objects.get(pk=body["listing"])
        self.assertEqual(listing.owner, self.landlord)
        self.assertTrue(listing.is_published)
        self.assertEqual(listing.status, Property.Status.AVAILABLE)
        self.assertEqual(float(listing.price), 1800000)
        self.assertEqual(listing.listing_type, Property.ListingType.RENT)
        self.assertEqual(listing.property_type, Property.PropertyType.HOUSE)
        self.assertEqual(listing.city, "Kampala")
        self.assertEqual(listing.reference, f"MB-P{listing.pk:05d}")

        public = APIClient().get("/api/properties/").json()["results"]
        self.assertIn(listing.slug, [row["slug"] for row in public])

    def test_verifying_twice_does_not_make_two_listings(self):
        recommendation = self.sent()
        self.client.force_authenticate(self.admin)
        self.assertEqual(
            self.client.post(f"{self.QUEUE}{recommendation.pk}/verify/", {}, format="json").status_code,
            200,
        )
        again = self.client.post(f"{self.QUEUE}{recommendation.pk}/verify/", {}, format="json")
        self.assertEqual(again.status_code, 400)
        self.assertEqual(Property.objects.filter(title=recommendation.title).count(), 1)

    def test_a_sale_and_rent_offer_needs_the_desk_to_pick_one(self):
        recommendation = self.sent(listing_kind=PropertyRecommendation.ListingKind.BOTH)
        self.client.force_authenticate(self.admin)
        blocked = self.client.post(f"{self.QUEUE}{recommendation.pk}/verify/", {}, format="json")
        self.assertEqual(blocked.status_code, 400)
        self.assertIn("sale and to rent", blocked.json()["detail"])

        chosen = self.client.post(
            f"{self.QUEUE}{recommendation.pk}/verify/",
            {"listing_type": "SALE", "price": 250000000, "currency": "UGX"}, format="json",
        )
        self.assertEqual(chosen.status_code, 200, chosen.json())
        listing = Property.objects.get(pk=chosen.json()["listing"])
        self.assertEqual(listing.listing_type, Property.ListingType.SALE)
        self.assertEqual(float(listing.price), 250000000)

    def test_a_draft_cannot_be_verified_and_a_price_is_needed_to_publish(self):
        self.client.force_authenticate(self.admin)
        draft = self.signup_draft(self.landlord)
        self.assertEqual(
            self.client.post(f"{self.QUEUE}{draft.pk}/verify/", {}, format="json").status_code, 400,
        )
        unpriced = self.sent(price_expectation=None)
        refused = self.client.post(f"{self.QUEUE}{unpriced.pk}/verify/", {}, format="json")
        self.assertEqual(refused.status_code, 400)
        self.assertIn("price", refused.json()["detail"].lower())

    def test_the_desk_can_correct_a_recommendation_before_publishing_it(self):
        recommendation = self.sent()
        self.client.force_authenticate(self.admin)
        corrected = self.client.patch(
            f"{self.QUEUE}{recommendation.pk}/",
            {"title": "Kisenyi maisonette, two bedrooms", "admin_note": "Checked the title."},
            format="json",
        )
        self.assertEqual(corrected.status_code, 200, corrected.json())
        self.assertEqual(corrected.json()["admin_note"], "Checked the title.")

        published = self.client.post(
            f"{self.QUEUE}{recommendation.pk}/verify/", {"price": 2000000}, format="json",
        )
        self.assertEqual(published.status_code, 200, published.json())
        listing = Property.objects.get(pk=published.json()["listing"])
        self.assertEqual(listing.title, "Kisenyi maisonette, two bedrooms")
        self.assertEqual(float(listing.price), 2000000)

    def test_declining_records_the_note_and_locks_the_form(self):
        recommendation = self.sent()
        self.client.force_authenticate(self.admin)
        thin = self.client.post(f"{self.QUEUE}{recommendation.pk}/decline/", {"note": "no"},
                                format="json")
        self.assertEqual(thin.status_code, 400)
        answer = self.client.post(
            f"{self.QUEUE}{recommendation.pk}/decline/",
            {"note": "The title is registered to a third party, so we cannot list it."},
            format="json",
        )
        self.assertEqual(answer.status_code, 200, answer.json())
        self.assertEqual(answer.json()["status"], "DECLINED")

        self.client.force_authenticate(self.landlord)
        later = self.client.patch(f"{self.OWN}{recommendation.pk}/", {"title": "Changed"},
                                  format="json")
        self.assertEqual(later.status_code, 400)
        self.assertIn("decided", later.json()["detail"].lower())
        self.assertEqual(
            PropertyRecommendation.objects.get(pk=recommendation.pk).title,
            "Kisenyi two-bedroom maisonette",
        )

    def test_a_draft_the_owner_never_fills_in_can_be_thrown_away(self):
        draft = self.signup_draft(self.landlord)
        submitted = self.sent()
        self.client.force_authenticate(self.landlord)
        self.assertEqual(self.client.delete(f"{self.OWN}{submitted.pk}/").status_code, 400)
        self.assertEqual(self.client.delete(f"{self.OWN}{draft.pk}/").status_code, 204)
        self.assertFalse(PropertyRecommendation.objects.filter(pk=draft.pk).exists())

    def test_the_desk_reports_what_is_waiting(self):
        self.sent()
        self.sent(self.neighbour, title="Entebbe half a hectare", listing_kind="SALE",
                  property_type="LAND", price_expectation=90000000, price_period="ONE_OFF")
        self.client.force_authenticate(self.admin)
        body = self.client.get(self.QUEUE + "stats/").json()
        self.assertEqual(body["SUBMITTED"], 2)
        self.assertEqual(body["DRAFT"], 2)  # one waiting on each owner since their accounts opened
        self.assertEqual(body["total"], 4)
        self.assertEqual(body["waiting"], 4)


def drawn_text(pdf_bytes):
    """Everything a PDF puts on paper, as plain text.

    ReportLab writes its page content as ASCII-85 then Flate, so the strings the
    letterhead draws are not readable in the raw file.
    """
    chunks = []
    for match in re.finditer(rb"stream\r?\n(.*?)endstream", pdf_bytes, re.S):
        body = match.group(1).rstrip()
        for decode in (
            lambda data: zlib.decompress(a85decode(data, adobe=True)),
            zlib.decompress,
        ):
            try:
                chunks.append(decode(body))
                break
            except Exception:
                continue
    return b"\n".join(chunks).decode("latin-1")


class LetterheadTests(ApiTestCase):
    """Every document the platform prints goes out on the same letterhead: the logo lockup
    and the contact block across the top, the navy rule with its red end-cap, the mark behind
    the page and the PROFESSIONAL / TRUSTED / RESULT DRIVEN band along the foot."""

    def setUp(self):
        super().setUp()
        self.company = Company.load()
        self.company.name = "Mant Bridges LTD"
        self.company.tagline = "Bridging Gaps"
        self.company.email = "desk@mantbridges.test"
        self.company.phone = "+256700000000"
        self.company.alt_phone = "+256700000001"
        self.company.address = "Cham Towers, Kampala Road"
        self.company.city = "Kampala"
        self.company.website = "https://mantbridges.test"
        self.company.logo = None
        self.company.save()

    def sample(self, renderer):
        return renderer({
            "number": "MB-TEST-0001",
            "company": self.company,
            "meta_groups": [("Billed to", [("Tenant", "Tom Renter")])],
            "line_items": [
                {"description": "Rent", "period": "November 2026", "amount": "UGX 950,000"},
            ],
            "totals": [("Total due", "UGX 950,000", True)],
        }).read()

    def give_a_logo(self, width=1400, height=900):
        from io import BytesIO

        from PIL import Image

        canvas = BytesIO()
        Image.new("RGBA", (width, height), (11, 37, 69, 255)).save(canvas, format="PNG")
        self.company.logo.save("lockup.png", ContentFile(canvas.getvalue()))

    def test_the_receipt_and_the_invoice_share_one_letterhead(self):
        for renderer, title in ((render_invoice_pdf, "RENT INVOICE"),
                                (render_receipt_pdf, "PAYMENT RECEIPT")):
            with self.subTest(document=title):
                page = drawn_text(self.sample(renderer))
                self.assertIn(title, page)
                self.assertIn("PROFESSIONAL", page)
                self.assertIn("TRUSTED", page)
                self.assertIn("RESULT DRIVEN", page)
                self.assertIn("MB-TEST-0001", page)
                self.assertIn("Page 1", page)

    def test_the_contact_block_prints_every_line_the_profile_carries(self):
        page = drawn_text(self.sample(render_invoice_pdf))
        self.assertIn("Cham Towers, Kampala Road, Kampala", page)
        self.assertIn("+256700000000 / +256700000001", page)
        self.assertIn("desk@mantbridges.test", page)
        self.assertIn("mantbridges.test", page)
        self.assertNotIn("https://", page)  # the site prints without its scheme

    def test_the_brand_band_is_letterspaced_and_the_spacing_is_switched_back_off(self):
        page = drawn_text(self.sample(render_invoice_pdf))
        self.assertIn("1.6 Tc", page)
        self.assertIn("0 Tc", page)  # otherwise the leak spaces out the foot line too
        self.assertIn("Computer-generated document", page)

    def test_the_logo_is_scaled_down_before_it_is_embedded(self):
        self.give_a_logo()
        pdf = self.sample(render_invoice_pdf)
        self.assertIn(b"/DCTDecode", pdf)
        self.assertLess(len(pdf), 300_000)
        cached = os.path.join(settings.MEDIA_ROOT, "company", "mb_pdf_logo.jpg")
        self.assertTrue(os.path.exists(cached))
        self.assertLess(os.path.getsize(cached), 100_000)

    def test_a_bigger_logo_is_rescaled_rather_than_reused(self):
        self.give_a_logo()
        self.sample(render_invoice_pdf)
        cached = os.path.join(settings.MEDIA_ROOT, "company", "mb_pdf_logo.jpg")
        from PIL import Image

        with Image.open(cached) as asset:
            self.assertEqual(asset.size[0], 620)

    def test_a_profile_without_a_logo_still_prints_the_company_name(self):
        page = drawn_text(self.sample(render_invoice_pdf))
        self.assertIn("Mant Bridges LTD", page)
        self.assertIn("Bridging Gaps", page)

