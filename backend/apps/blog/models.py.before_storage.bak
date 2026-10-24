from django.conf import settings
from django.db import models
from django.utils import timezone

from apps.core.helpers import unique_slug
from apps.core.models import TimeStampedModel


class Category(TimeStampedModel):
    name = models.CharField(max_length=100, unique=True)
    slug = models.SlugField(max_length=120, unique=True, blank=True)
    description = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        ordering = ("name",)
        verbose_name_plural = "Categories"

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = unique_slug(Category, self.name, instance=self)
        super().save(*args, **kwargs)


class PostQuerySet(models.QuerySet):
    def published(self):
        return self.filter(status=Post.Status.PUBLISHED, published_at__lte=timezone.now())


class PostManager(models.Manager):
    def get_queryset(self):
        return PostQuerySet(self.model, using=self._db)

    def published(self):
        return self.get_queryset().published()


class Post(TimeStampedModel):
    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        PUBLISHED = "PUBLISHED", "Published"

    title = models.CharField(max_length=200)
    slug = models.SlugField(max_length=220, unique=True, blank=True)
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                               related_name="blog_posts")
    category = models.ForeignKey(Category, on_delete=models.SET_NULL, null=True, blank=True,
                                 related_name="posts")
    excerpt = models.CharField(
        max_length=400, blank=True, default="",
        help_text="Teaser shown on cards and in search results.",
    )
    content = models.TextField(
        help_text="Plain text. Separate paragraphs with a blank line.",
    )
    cover_image = models.ImageField(upload_to="blog/%Y/%m/", blank=True, null=True)
    tags = models.JSONField(default=list, blank=True)
    status = models.CharField(max_length=12, choices=Status.choices,
                              default=Status.DRAFT, db_index=True)
    is_featured = models.BooleanField(default=False)
    allow_comments = models.BooleanField(default=False)
    views = models.PositiveIntegerField(default=0)
    published_at = models.DateTimeField(null=True, blank=True, db_index=True)

    objects = PostManager()

    class Meta:
        ordering = ("-published_at", "-created_at")
        indexes = [models.Index(fields=["status", "published_at"])]

    def __str__(self):
        return self.title

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = unique_slug(Post, self.title, instance=self)
        if self.status == Post.Status.PUBLISHED and self.published_at is None:
            self.published_at = timezone.now()
        if self.status == Post.Status.DRAFT:
            self.is_featured = False
        super().save(*args, **kwargs)

    @property
    def reading_time_minutes(self):
        words = len(self.content.split())
        return max(1, round(words / 200))

    @property
    def short_excerpt(self):
        if self.excerpt:
            return self.excerpt
        plain = " ".join(self.content.split())
        return (plain[:240] + "...") if len(plain) > 240 else plain

    @property
    def paragraphs(self):
        return [chunk.strip() for chunk in self.content.split("\n\n") if chunk.strip()]

    def related(self, limit=3):
        queryset = Post.objects.published().exclude(pk=self.pk)
        if self.category_id:
            queryset = queryset.filter(category_id=self.category_id)
        related_posts = list(queryset[:limit])
        if len(related_posts) < limit:
            seen = {post.pk for post in related_posts} | {self.pk}
            extra = Post.objects.published().exclude(pk__in=seen)[:limit - len(related_posts)]
            related_posts.extend(extra)
        return related_posts
