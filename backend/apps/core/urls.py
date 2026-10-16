from django.urls import path

from apps.core.views import CompanyAPIView, HealthAPIView, LookupsAPIView

urlpatterns = [
    path("company/", CompanyAPIView.as_view(), name="company"),
    path("lookups/", LookupsAPIView.as_view(), name="lookups"),
    path("health/", HealthAPIView.as_view(), name="health"),
]
