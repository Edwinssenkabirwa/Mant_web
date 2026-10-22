"""Rent reminders, on two channels, with a record of what the desk actually did.

One function renders the words, so the inbox copy and the WhatsApp copy can never drift apart.
The inbox channel is fully observable: the message is stored here, so a row may say it was
written. WhatsApp is not observable at all — the API hands the desk a click-to-chat address and
nothing comes back — so a WhatsApp row tops out at ``OPENED``, meaning the desk clicked the link
in their own browser. Nothing in this module, and no status on ``RentReminder``, means "the
tenant received it".
"""
import re
from functools import partial
from urllib.parse import quote

from django.utils import timezone

from apps.billing.models import RentReminder
from apps.core.helpers import format_money
from apps.messaging.services import get_or_create_conversation, post_message

# The rent book is Ugandan. A number that already carries a country code is dialled exactly as
# written; this code is only ever prepended to a bare national number.
UGANDA_DIAL_CODE = "256"

# E.164: a country code and a subscriber number together never exceed 15 digits. Anything under
# 8 cannot be a dialable subscriber number either.
MAX_DIALABLE_DIGITS = 15
MIN_DIALABLE_DIGITS = 8


def normalise_msisdn(raw, dial_code=UGANDA_DIAL_CODE):
    """Return the number as E.164 digits ready for ``wa.me``, or ``None`` when it can't be read.

    Understands ``+256 704 771 220``, ``00256 704 771 220``, ``256704771220``, ``0704 771 220``
    and ``704 771 220``. The last two are read as Ugandan because that is the shape a Ugandan
    mobile number has — that is the one assumption this function makes, and it is only made for
    that exact shape. Anything else is refused rather than guessed: a click-to-chat link dials
    the digits it is given, so a wrong guess opens a chat with a stranger.
    """
    text = str(raw or "").strip()
    digits = re.sub(r"\D", "", text)
    if not digits:
        return None

    if text.startswith("+") or text.startswith("00"):
        dialable = digits[2:] if text.startswith("00") else digits
        return dialable if _is_dialable(dialable) else None

    if digits.startswith(dial_code) and _is_dialable(digits):
        return digits

    subscriber = digits[1:] if digits.startswith("0") else digits
    if len(subscriber) != 9 or not subscriber.startswith("7"):
        return None
    return f"{dial_code}{subscriber}"


def _is_dialable(digits):
    return MIN_DIALABLE_DIGITS <= len(digits) <= MAX_DIALABLE_DIGITS


def whatsapp_link(number, text):
    """The address that opens a WhatsApp chat, pre-filled with ``text``.

    There is no WhatsApp account, token or phone-home behind this: the desk's own WhatsApp sends
    the message after a human presses the send button.
    """
    return f"https://wa.me/{number}?text={quote(text, safe='')}"


def reminder_text(invoice):
    """The words of a rent reminder, rendered once for every channel."""
    money = partial(format_money, currency_symbol=invoice.currency)
    return (
        f"Dear {invoice.tenant.short_name},\n\n"
        f"This is a reminder from Mant Bridges LTD regarding invoice {invoice.number} "
        f"for {invoice.property.title}, covering {invoice.period_label}.\n\n"
        f"Amount charged: {money(invoice.total)}\n"
        f"Received to date: {money(invoice.amount_paid)}\n"
        f"Outstanding balance: {money(invoice.balance)}\n"
        f"Due date: {invoice.due_date:%d %b %Y}"
        + (f" ({invoice.days_overdue} days overdue)" if invoice.is_overdue else "")
        + "\n\nPlease pay at your earliest convenience and quote the invoice number. "
          "If you have already paid, send us the transaction reference so we can "
          "reconcile your account and issue your receipt.\n\n"
          "Regards,\nMant Bridges LTD"
    )


def _write_to_inbox(invoice, actor, body):
    conversation = get_or_create_conversation(
        participants=[invoice.tenant, actor],
        subject=f"Rent reminder - {invoice.number}",
        created_by=actor,
        property_obj=invoice.property,
        lease=invoice.lease,
    )
    post_message(conversation, actor, body)
    return conversation


def _record(invoice, actor, channel, status, body, phone=""):
    return RentReminder.objects.create(
        invoice=invoice, channel=channel, status=status, body=body, phone=phone,
        created_by=actor,
    )


def send_inbox_reminder(invoice, actor):
    """Post the reminder into the tenant's thread and record that it was written."""
    body = reminder_text(invoice)
    conversation = _write_to_inbox(invoice, actor, body)
    reminder = _record(invoice, actor, RentReminder.Channel.INBOX, RentReminder.Status.WRITTEN,
                       body)
    invoice.mark_reminder_sent()
    return reminder, conversation


def open_whatsapp_reminder(invoice, actor):
    """Post the same reminder into the tenant's thread and hand the desk a chat to open.

    The inbox copy is written whichever channel the desk reaches for, so the thread always holds
    the reminder — including when the tenant's number turns out to be unusable and ``link`` comes
    back ``None``.
    """
    body = reminder_text(invoice)
    conversation = _write_to_inbox(invoice, actor, body)
    number = normalise_msisdn(invoice.tenant.phone)
    if number is None:
        reminder = _record(invoice, actor, RentReminder.Channel.WHATSAPP,
                           RentReminder.Status.NO_NUMBER, body)
        link = None
    else:
        reminder = _record(invoice, actor, RentReminder.Channel.WHATSAPP,
                           RentReminder.Status.LINK_READY, body, phone=number)
        link = whatsapp_link(number, body)
    invoice.mark_reminder_sent()
    return reminder, conversation, link


def mark_chat_opened(reminder):
    """Record that the desk clicked the chat link, once, and never rewrite history."""
    if reminder.status != RentReminder.Status.LINK_READY:
        return reminder
    reminder.status = RentReminder.Status.OPENED
    reminder.opened_at = timezone.now()
    reminder.save(update_fields=["status", "opened_at", "updated_at"])
    return reminder
