from rest_framework import serializers

from apps.accounts.models import Role, User
from apps.accounts.serializers import UserBriefSerializer
from apps.blog.models import Category, Post
from apps.core.helpers import absolute_media_url


class CategorySerializer(serializers.ModelSerializer):
    post_count = serializers.SerializerMethodField()

    class Meta:
        model = Category
        fields = ["id", "name", "slug", "description", "post_count"]

    def get_post_count(self, obj):
        annotated = getattr(obj, "published_count", None)
        if annotated is not None:
            return annotated
        return obj.posts.filter(status=Post.Status.PUBLISHED).count()


class PostListSerializer(serializers.ModelSerializer):
    cover_image_url = serializers.SerializerMethodField()
    excerpt_text = serializers.CharField(source="short_excerpt", read_only=True)
    author_name = serializers.CharField(source="author.full_name", read_only=True)
    author_id = serializers.IntegerField(source="author.id", read_only=True)
    category_name = serializers.CharField(source="category.name", read_only=True, default="")
    category_slug = serializers.CharField(source="category.slug", read_only=True, default="")
    reading_time = serializers.IntegerField(source="reading_time_minutes", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        model = Post
        fields = [
            "id", "title", "slug", "excerpt_text", "cover_image_url", "tags",
            "author_id", "author_name", "category", "category_name", "category_slug",
            "status", "status_display", "is_featured", "views", "reading_time",
            "published_at", "created_at",
        ]

    def get_cover_image_url(self, obj):
        return absolute_media_url(self.context.get("request"), obj.cover_image)


class PostDetailSerializer(PostListSerializer):
    author = UserBriefSerializer(read_only=True)
    paragraphs = serializers.ListField(child=serializers.CharField(), read_only=True)
    related_posts = serializers.SerializerMethodField()

    class Meta(PostListSerializer.Meta):
        fields = PostListSerializer.Meta.fields + [
            "content", "paragraphs", "author", "allow_comments", "related_posts",
            "updated_at",
        ]

    def get_related_posts(self, obj):
        posts = obj.related(limit=3)
        return PostListSerializer(posts, many=True, context=self.context).data


class ManagePostSerializer(serializers.ModelSerializer):
    author = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.filter(role__in=[Role.ADMIN, Role.LANDLORD]),
        required=False,
    )
    cover_image_url = serializers.SerializerMethodField()
    author_name = serializers.CharField(source="author.full_name", read_only=True)
    category_name = serializers.CharField(source="category.name", read_only=True, default="")

    class Meta:
        model = Post
        fields = [
            "id", "title", "slug", "author", "author_name", "category", "category_name",
            "excerpt", "content", "cover_image", "cover_image_url", "tags", "status",
            "is_featured", "allow_comments", "views", "published_at",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "slug", "views", "author_name", "category_name",
                            "cover_image_url", "created_at", "updated_at"]
        extra_kwargs = {
            "cover_image": {"required": False, "allow_null": True},
            "published_at": {"required": False, "allow_null": True},
        }

    def get_cover_image_url(self, obj):
        return absolute_media_url(self.context.get("request"), obj.cover_image)

    def validate_title(self, value):
        if len(value.strip()) < 5:
            raise serializers.ValidationError("Give the article a descriptive title.")
        return value.strip()

    def validate_content(self, value):
        if len(value.strip()) < 20:
            raise serializers.ValidationError("The article body is too short.")
        return value.strip()

    def validate_tags(self, value):
        if value in (None, ""):
            return []
        if isinstance(value, str):
            value = [item.strip() for item in value.split(",") if item.strip()]
        if not isinstance(value, (list, tuple)):
            raise serializers.ValidationError("Tags must be a list of words.")
        return [str(item) for item in value][:10]

    def validate_author(self, value):
        request = self.context.get("request")
        user = getattr(request, "user", None)
        if user is not None and user.role != Role.ADMIN and value.pk != user.pk:
            raise serializers.ValidationError("You can only publish under your own name.")
        return value

    def create(self, validated_data):
        request = self.context.get("request")
        if validated_data.get("author") is None and request is not None:
            validated_data["author"] = request.user
        return super().create(validated_data)


class ManageCategorySerializer(serializers.ModelSerializer):
    post_count = serializers.IntegerField(source="posts.count", read_only=True)

    class Meta:
        model = Category
        fields = ["id", "name", "slug", "description", "post_count"]
        read_only_fields = ["id", "slug"]
