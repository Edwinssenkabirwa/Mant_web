from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.billing.views import (
    AnalyticsView,
    InvoiceViewSet,
    LandlordOverviewView,
    PaymentViewSet,
    ReceiptViewSet,
    RentReminderViewSet,
    StatementView,
)

router = DefaultRouter()
router.register("invoices", InvoiceViewSet, basename="invoice")
router.register("reminders", RentReminderViewSet, basename="rent-reminder")
router.register("payments", PaymentViewSet, basename="payment")
router.register("receipts", ReceiptViewSet, basename="receipt")

urlpatterns = [
    path("analytics/", AnalyticsView.as_view(), name="analytics"),
    path("statements/", StatementView.as_view(), name="statements"),
    # The landlord's own read-only view of his book — see apps.billing.services.landlord_overview.
    path("landlord/overview/", LandlordOverviewView.as_view(), name="landlord-overview"),
    path("", include(router.urls)),
]
