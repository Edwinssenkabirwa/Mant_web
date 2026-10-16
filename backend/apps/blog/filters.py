import django_filters as filters
from django.db.models import Q

from apps.blog.models import Post


class PostFilter(filters.FilterSet):
    q = filters.CharFilter(method="filter_free_text")
    category = filters.CharFilter(field_name="category__slug")
    category_id = filters.NumberFilter(field_name="category_id")
    tag = filters.CharFilter(method="filter_tag")
    featured = filters.BooleanFilter(field_name="is_featured")
    author = filters.NumberFilter(field_name="author_id")
    status = filters.ChoiceFilter(choices=Post.Status.choices)
    year = filters.NumberFilter(field_name="published_at", lookup_expr="year")

    class Meta:
        model = Post
        fields = ["q", "category", "category_id", "tag", "featured", "author", "status", "year"]

    def filter_free_text(self, queryset, name, value):
        for term in [word for word in value.split() if word]:
            queryset = queryset.filter(
                Q(title__icontains=term)
                | Q(excerpt__icontains=term)
                | Q(content__icontains=term)
                | Q(author__first_name__icontains=term)
                | Q(author__last_name__icontains=term)
            )
        return queryset

    def filter_tag(self, queryset, name, value):
        tag = value.strip()
        if not tag:
            return queryset
        return queryset.filter(tags__contains=[tag])
