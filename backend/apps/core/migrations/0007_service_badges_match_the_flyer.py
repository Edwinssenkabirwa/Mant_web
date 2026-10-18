"""Debt recovery badge: the flyer shows a document with a money disc, not a gavel.

The gavel photograph stays on the service; only the circular badge key changes, so the
four badges read building / keys / landmark / coins exactly as they do on the flyer.
"""
from django.db import migrations

FLYER_ICONS = {
    "property-management": "building",
    "real-estate-management": "keys",
    "lobbying-and-advocacy": "landmark",
    "debt-recovery": "coins",
}

PREVIOUS_ICONS = {
    "property-management": "building",
    "real-estate-management": "keys",
    "lobbying-and-advocacy": "landmark",
    "debt-recovery": "gavel",
}


def set_icons(apps, schema_editor, wanted=FLYER_ICONS):
    Service = apps.get_model("core", "Service")
    for slug, icon in wanted.items():
        Service.objects.filter(slug=slug).update(icon=icon)


def reverse_icons(apps, schema_editor):
    set_icons(apps, schema_editor, PREVIOUS_ICONS)


class Migration(migrations.Migration):
    dependencies = [("core", "0006_fold_services_to_brochure_offers")]

    operations = [migrations.RunPython(set_icons, reverse_icons)]
