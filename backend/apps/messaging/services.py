"""Conversation helpers shared by the API and by other apps (e.g. rent reminders)."""
from apps.messaging.models import Conversation, Message


def get_or_create_conversation(participants, subject, created_by, property_obj=None,
                               lease=None, category=Conversation.Category.GENERAL):
    """Reuse an open thread between exactly these people, or start a new one."""
    users = [user for user in participants if user is not None]
    wanted = {user.pk for user in users}

    candidates = Conversation.objects.filter(status=Conversation.Status.OPEN)
    if lease is not None:
        candidates = candidates.filter(lease=lease)
    elif property_obj is not None:
        candidates = candidates.filter(property=property_obj)

    for conversation in candidates.prefetch_related("participants"):
        if {participant.pk for participant in conversation.participants.all()} == wanted:
            return conversation

    conversation = Conversation.objects.create(
        subject=subject,
        category=category,
        created_by=created_by,
        property=property_obj,
        lease=lease,
    )
    conversation.participants.set(users)
    return conversation


def post_message(conversation, sender, body, attachment=None):
    message = Message.objects.create(
        conversation=conversation,
        sender=sender,
        body=body.strip(),
        attachment=attachment,
    )
    if not conversation.participants.filter(pk=sender.pk).exists():
        conversation.participants.add(sender)
    message.read_by.add(sender)
    return message


def mark_conversation_read(conversation, user):
    """Flag every message the user did not send as read."""
    unread = conversation.messages.exclude(sender=user).exclude(read_by=user)
    count = unread.count()
    for message in unread:
        message.read_by.add(user)
    return count
