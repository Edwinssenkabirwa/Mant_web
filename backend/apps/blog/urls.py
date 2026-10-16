from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.blog.views import (
    ManageCategoryViewSet,
    ManagePostViewSet,
    PublicCategoryViewSet,
    PublicPostViewSet,
)

public_router = DefaultRouter()
public_router.register("blog/posts", PublicPostViewSet, basename="post")
public_router.register("blog/categories", PublicCategoryViewSet, basename="category")

manage_router = DefaultRouter()
manage_router.register("manage/posts", ManagePostViewSet, basename="manage-post")
manage_router.register("manage/blog-categories", ManageCategoryViewSet,
                       basename="manage-category")

urlpatterns = [
    path("", include(public_router.urls)),
    path("", include(manage_router.urls)),
]
