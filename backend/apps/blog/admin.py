from django.contrib import admin

from apps.blog.models import Category, Post


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ("name", "slug", "description")
    search_fields = ("name", "description")
    prepopulated_fields = {"slug": ("name",)}


@admin.register(Post)
class PostAdmin(admin.ModelAdmin):
    list_display = ("title", "author", "category", "status", "is_featured", "views",
                    "published_at")
    list_filter = ("status", "is_featured", "category", "published_at")
    search_fields = ("title", "excerpt", "content")
    prepopulated_fields = {"slug": ("title",)}
    autocomplete_fields = ("author", "category")
    readonly_fields = ("views", "created_at", "updated_at")
    date_hierarchy = "published_at"
    list_editable = ("status", "is_featured")
    fieldsets = (
        ("Article", {"fields": ("title", "slug", "author", "category", "excerpt", "content")}),
        ("Media", {"fields": ("cover_image",)}),
        ("Taxonomy", {"fields": ("tags",)}),
        ("Publishing", {"fields": ("status", "published_at", "is_featured", "allow_comments",
                                    "views")}),
    )
