from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.billing.views import (
    AnalyticsView,
    InvoiceViewSet,
    PaymentViewSet,
    ReceiptViewSet,
    StatementView,
)

router = DefaultRouter()
router.register("invoices", InvoiceViewSet, basename="invoice")
router.register("payments", PaymentViewSet, basename="payment")
router.register("receipts", ReceiptViewSet, basename="receipt")

urlpatterns = [
    path("analytics/", AnalyticsView.as_view(), name="analytics"),
    path("statements/", StatementView.as_view(), name="statements"),
    path("", include(router.urls)),
]
