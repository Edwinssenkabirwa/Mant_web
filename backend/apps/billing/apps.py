from django.apps import AppConfig


class BillingConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.billing"
    label = "billing"
    verbose_name = "Rent Collection & Receipts"

    def ready(self):
        from apps.billing import signals  # noqa: F401
