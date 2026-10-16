from django.contrib import admin

from apps.messaging.models import Conversation, Message


class MessageInline(admin.TabularInline):
    model = Message
    extra = 0
    readonly_fields = ("sender", "created_at")
    fields = ("sender", "body", "attachment", "created_at")
    ordering = ("created_at", "id")


@admin.register(Conversation)
class ConversationAdmin(admin.ModelAdmin):
    list_display = ("subject", "category", "status", "created_by", "property",
                    "message_count", "last_message_at")
    list_filter = ("status", "category")
    search_fields = ("subject", "messages__body", "created_by__email",
                     "created_by__first_name", "created_by__last_name",
                     "property__title", "lease__number")
    autocomplete_fields = ("property", "lease")
    readonly_fields = ("last_message_at", "closed_at", "created_at", "updated_at")
    filter_horizontal = ("participants",)
    inlines = [MessageInline]
    date_hierarchy = "created_at"

    @admin.display(description="Messages", ordering="messages")
    def message_count(self, obj):
        return obj.messages.count()

    def get_queryset(self, request):
        return super().get_queryset(request).select_related(
            "created_by", "property", "lease"
        )


@admin.register(Message)
class MessageAdmin(admin.ModelAdmin):
    list_display = ("conversation", "sender", "body_preview", "created_at")
    list_filter = ("sender__role",)
    search_fields = ("body", "sender__email", "sender__first_name", "sender__last_name",
                     "conversation__subject")
    autocomplete_fields = ("conversation", "sender")
    readonly_fields = ("read_by", "created_at", "updated_at")
    filter_horizontal = ("read_by",)
    date_hierarchy = "created_at"

    @admin.display(description="Message")
    def body_preview(self, obj):
        text = obj.body.strip().replace("\n", " ")
        return text[:80] + ("..." if len(text) > 80 else "")

    def get_queryset(self, request):
        return super().get_queryset(request).select_related("conversation", "sender")
