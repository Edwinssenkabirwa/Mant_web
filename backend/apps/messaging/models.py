from django.conf import settings
from django.db import models

from apps.core.models import TimeStampedModel


class Conversation(TimeStampedModel):
    """A thread between a landlord or tenant and the Mant Bridges team."""

    class Status(models.TextChoices):
        OPEN = "OPEN", "Open"
        CLOSED = "CLOSED", "Closed"

    class Category(models.TextChoices):
        GENERAL = "GENERAL", "General"
        RENT = "RENT", "Rent & payments"
        MAINTENANCE = "MAINTENANCE", "Maintenance"
        VIEWING = "VIEWING", "Viewing request"
        DOCUMENTS = "DOCUMENTS", "Documents"
        COMPLAINT = "COMPLAINT", "Complaint"

    subject = models.CharField(max_length=200)
    category = models.CharField(max_length=15, choices=Category.choices,
                                default=Category.GENERAL)
    status = models.CharField(max_length=10, choices=Status.choices,
                              default=Status.OPEN, db_index=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                                   related_name="conversations_started")
    participants = models.ManyToManyField(settings.AUTH_USER_MODEL,
                                          related_name="conversations", blank=True)
    property = models.ForeignKey("properties.Property", on_delete=models.SET_NULL,
                                 null=True, blank=True, related_name="conversations")
    lease = models.ForeignKey("leases.Lease", on_delete=models.SET_NULL,
                              null=True, blank=True, related_name="conversations")
    last_message_at = models.DateTimeField(null=True, blank=True)
    closed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ("-last_message_at", "-created_at")

    def __str__(self):
        return self.subject

    def is_participant(self, user):
        return self.participants.filter(pk=user.pk).exists()

    def unread_count(self, user):
        return self.messages.exclude(sender=user).exclude(read_by=user).count()

    def last_message(self):
        return self.messages.order_by("-created_at").first()

    def close(self):
        from django.utils import timezone

        self.status = Conversation.Status.CLOSED
        self.closed_at = timezone.now()
        Conversation.objects.filter(pk=self.pk).update(status=self.status,
                                                       closed_at=self.closed_at)
        return self


class Message(TimeStampedModel):
    conversation = models.ForeignKey(Conversation, on_delete=models.CASCADE,
                                     related_name="messages")
    sender = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                               related_name="messages_sent")
    body = models.TextField()
    attachment = models.FileField(upload_to="messages/%Y/%m/", blank=True, null=True)
    read_by = models.ManyToManyField(settings.AUTH_USER_MODEL, related_name="messages_read",
                                     blank=True)

    class Meta:
        ordering = ("created_at", "id")

    def __str__(self):
        return f"{self.sender.full_name}: {self.body[:40]}"

    def save(self, *args, **kwargs):
        was_new = self.pk is None
        super().save(*args, **kwargs)
        if was_new:
            Conversation.objects.filter(pk=self.conversation_id).update(
                last_message_at=self.created_at
            )

    def is_read_by(self, user):
        if self.sender_id == user.pk:
            return True
        cache = getattr(self, "_prefetched_objects_cache", None)
        if cache and "read_by" in cache:
            return any(reader.pk == user.pk for reader in self.read_by.all())
        return self.read_by.filter(pk=user.pk).exists()
