from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.properties.views import (
    EnquiryCreateView,
    ManageEnquiryViewSet,
    ManagePropertyViewSet,
    PropertyImageViewSet,
    PublicPropertyViewSet,
)

public_router = DefaultRouter()
public_router.register("properties", PublicPropertyViewSet, basename="property")

manage_router = DefaultRouter()
manage_router.register("manage/properties", ManagePropertyViewSet, basename="manage-property")
manage_router.register(
    "manage/property-images", PropertyImageViewSet, basename="manage-property-image"
)
manage_router.register("manage/enquiries", ManageEnquiryViewSet, basename="manage-enquiry")

urlpatterns = [
    path("enquiries/", EnquiryCreateView.as_view(), name="enquiry-create"),
    path("", include(public_router.urls)),
    path("", include(manage_router.urls)),
]
