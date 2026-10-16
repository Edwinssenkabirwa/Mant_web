"""Keeps invoices and receipts in step with payment records.

Using signals (rather than only the API layer) means payments confirmed from the
Django admin, a shell, or a management command all behave identically.
"""
from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from apps.billing.models import Invoice, Payment, Receipt


def sync_receipt(payment):
    """Create, refresh or void the receipt that belongs to a payment."""
    if payment.status != Payment.Status.CONFIRMED:
        receipt = getattr(payment, "receipt", None)
        if receipt and not receipt.is_void:
            receipt.void(reason=f"Payment {payment.number} was {payment.status.lower()}.")
        return None

    invoice = payment.invoice
    defaults = {
        "lease_id": payment.lease_id or (invoice.lease_id if invoice else None),
        "property_id": invoice.property_id if invoice else None,
        "tenant_id": payment.tenant_id,
        "amount": payment.amount,
        "currency": payment.currency,
        "method": payment.method,
        "reference": payment.reference,
        "paid_on": payment.paid_on,
        "issued_by_id": payment.confirmed_by_id or payment.recorded_by_id,
        "is_void": False,
        "void_reason": "",
        "voided_at": None,
    }
    receipt, created = Receipt.objects.get_or_create(payment=payment, defaults=defaults)
    if not created:
        for field, value in defaults.items():
            setattr(receipt, field, value)
        receipt.save()
    receipt.generate_pdf()
    return receipt


@receiver(post_save, sender=Payment)
def payment_saved(sender, instance, **kwargs):
    if instance.invoice_id:
        instance.invoice.recalculate()
    sync_receipt(instance)


@receiver(post_delete, sender=Payment)
def payment_deleted(sender, instance, **kwargs):
    if instance.invoice_id:
        invoice = Invoice.objects.filter(pk=instance.invoice_id).first()
        if invoice:
            invoice.recalculate()
