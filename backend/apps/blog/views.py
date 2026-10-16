from django.db.models import Count, F, Q, Sum
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from apps.accounts.permissions import IsAdminRole
from apps.blog.filters import PostFilter
from apps.blog.models import Category, Post
from apps.blog.serializers import (
    CategorySerializer,
    ManageCategorySerializer,
    ManagePostSerializer,
    PostDetailSerializer,
    PostListSerializer,
)


class PublicCategoryViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [AllowAny]
    serializer_class = CategorySerializer
    lookup_field = "slug"
    ordering = ["name"]

    def get_queryset(self):
        return Category.objects.annotate(
            published_count=Count(
                "posts",
                filter=Q(posts__status=Post.Status.PUBLISHED),
                distinct=True,
            )
        )


class PublicPostViewSet(viewsets.ReadOnlyModelViewSet):
    """Published articles for the public blog."""

    permission_classes = [AllowAny]
    serializer_class = PostListSerializer
    filterset_class = PostFilter
    lookup_field = "slug"
    ordering_fields = ["published_at", "views", "title"]
    ordering = ["-published_at"]

    def get_queryset(self):
        return Post.objects.published().select_related("author", "category")

    def get_serializer_class(self):
        if self.action == "retrieve":
            return PostDetailSerializer
        return PostListSerializer

    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        Post.objects.filter(pk=instance.pk).update(views=F("views") + 1)
        instance.refresh_from_db(fields=["views"])
        serializer = self.get_serializer(instance, context={"request": request})
        return Response(serializer.data)

    @action(detail=False, methods=["get"])
    def featured(self, request):
        queryset = (
            self.filter_queryset(self.get_queryset())
            .filter(is_featured=True)
            .order_by("-published_at")[:3]
        )
        serializer = PostListSerializer(queryset, many=True, context={"request": request})
        return Response(serializer.data)

    @action(detail=False, methods=["get"])
    def latest(self, request):
        queryset = self.get_queryset().order_by("-published_at")[:4]
        serializer = PostListSerializer(queryset, many=True, context={"request": request})
        return Response(serializer.data)

    @action(detail=False, methods=["get"])
    def tags(self, request):
        counts = {}
        for tags in Post.objects.published().values_list("tags", flat=True):
            for tag in tags or []:
                counts[tag] = counts.get(tag, 0) + 1
        ordered = sorted(counts.items(), key=lambda item: (-item[1], item[0]))
        return Response([{"tag": tag, "count": count} for tag, count in ordered[:30]])


class ManagePostViewSet(viewsets.ModelViewSet):
    """Blog publishing is an administrator function for Mant Bridges."""

    permission_classes = [IsAuthenticated, IsAdminRole]
    serializer_class = ManagePostSerializer
    filterset_class = PostFilter
    queryset = Post.objects.select_related("author", "category")
    ordering_fields = ["published_at", "created_at", "title", "views"]
    ordering = ["-created_at"]

    @action(detail=False, methods=["get"], url_path="stats")
    def stats(self, request):
        return Response({
            "total": Post.objects.count(),
            "published": Post.objects.filter(status=Post.Status.PUBLISHED).count(),
            "drafts": Post.objects.filter(status=Post.Status.DRAFT).count(),
            "featured": Post.objects.filter(is_featured=True).count(),
            "total_views": Post.objects.aggregate(total=Sum("views"))["total"] or 0,
        })


class ManageCategoryViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, IsAdminRole]
    serializer_class = ManageCategorySerializer
    queryset = Category.objects.annotate(post_count=Count("posts", distinct=True))
    ordering = ["name"]
