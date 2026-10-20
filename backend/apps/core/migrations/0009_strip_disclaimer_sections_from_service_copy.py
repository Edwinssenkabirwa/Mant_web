"""Take the two disclaimer sections out of the published service copy.

Debt recovery closed with "The line we hold" and land documentation with "Where our role
stops". Both read as hedging next to an offer, so they are gone from seed_services.py; this
rewrite drops the same paragraphs from databases that were seeded before the change. Services
that never carried either heading are left untouched, whitespace included.
"""
from django.db import migrations

PARA_SEPARATOR = "\n\n"
REMOVED_HEADINGS = ("The line we hold", "Where our role stops")


def _heading(chunk):
    first = chunk.splitlines()[0].strip()
    return first[3:].strip() if first.startswith("## ") else None


def strip_disclaimer_sections(apps, schema_editor):
    Service = apps.get_model("core", "Service")
    for service in Service.objects.all():
        chunks = [chunk.strip() for chunk in (service.description or "").split(PARA_SEPARATOR) if chunk.strip()]
        if not any(_heading(chunk) in REMOVED_HEADINGS for chunk in chunks):
            continue
        kept, dropping = [], False
        for chunk in chunks:
            heading = _heading(chunk)
            if heading is not None:
                dropping = heading in REMOVED_HEADINGS
            if not dropping:
                kept.append(chunk)
        service.description = PARA_SEPARATOR.join(kept)
        service.save(update_fields=["description"])


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0008_alter_service_category"),
    ]

    operations = [
        migrations.RunPython(strip_disclaimer_sections, migrations.RunPython.noop),
    ]
