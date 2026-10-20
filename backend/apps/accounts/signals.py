"""Gives a new account its first piece of paper.

A landlord's portal opens on an empty recommendation draft rather than a blank page, and a
tenant's account lands in the desk's enquiry queue so nobody has to remember to write the
lead up. Both are created at the model layer, so self-registration, the admin's add-user
form and a seeded demo all behave the same way.
"""
from django.db.models.signals import post_save
from django.dispatch import receiver

from apps.accounts.models import Role, User
from apps.properties.models import Enquiry, PropertyRecommendation


@receiver(post_save, sender=User)
def open_account_paperwork(sender, instance, created, **kwargs):
    if not created:
        return

    if instance.role == Role.LANDLORD:
        PropertyRecommendation.objects.create(recommender=instance)
        return

    if instance.role == Role.TENANT:
        Enquiry.objects.create(
            name=instance.full_name,
            email=instance.email,
            phone=instance.phone,
            subject="New tenant account — property brief",
            message=(
                "A tenant account was opened through self-registration. The name, e-mail "
                "address and phone number are as recorded on the account; what they want to "
                "rent or buy is not known yet. The desk should contact them, write the brief "
                "down here, and match it to a verified listing."
            ),
            status=Enquiry.Status.NEW,
        )
