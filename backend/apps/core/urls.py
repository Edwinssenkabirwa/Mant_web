from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.core.views import (
    CompanyAPIView,
    HealthAPIView,
    LookupsAPIView,
    ManageServiceViewSet,
    NewsletterConfirmView,
    NewsletterSubscribeView,
    NewsletterUnsubscribeView,
    PublicServiceViewSet,
)

public_router = DefaultRouter()
public_router.register("services", PublicServiceViewSet, basename="service")

manage_router = DefaultRouter()
manage_router.register("manage/services", ManageServiceViewSet, basename="manage-service")

urlpatterns = [
    path("company/", CompanyAPIView.as_view(), name="company"),
    path("lookups/", LookupsAPIView.as_view(), name="lookups"),
    path("health/", HealthAPIView.as_view(), name="health"),
    path("newsletter/subscribe/", NewsletterSubscribeView.as_view(), name="newsletter-subscribe"),
    path("newsletter/confirm/", NewsletterConfirmView.as_view(), name="newsletter-confirm"),
    path("newsletter/unsubscribe/", NewsletterUnsubscribeView.as_view(), name="newsletter-unsubscribe"),
    path("", include(public_router.urls)),
    path("", include(manage_router.urls)),
]
