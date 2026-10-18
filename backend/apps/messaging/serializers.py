from rest_framework import serializers

from apps.accounts.models import Role, User
from apps.accounts.serializers import UserBriefSerializer
from apps.core.helpers import absolute_media_url
from apps.leases.models import Lease
from apps.messaging.models import Conversation, Message
from apps.messaging.services import post_message
from apps.properties.models import Property


class MessageSerializer(serializers.ModelSerializer):
    sender_detail = UserBriefSerializer(source="sender", read_only=True)
    sender_name = serializers.CharField(source="sender.full_name", read_only=True)
    sender_role = serializers.CharField(source="sender.role", read_only=True)
    is_read = serializers.SerializerMethodField()
    attachment_url = serializers.SerializerMethodField()

    class Meta:
        model = Message
        fields = ["id", "conversation", "sender", "sender_detail", "sender_name",
                  "sender_role", "body", "attachment", "attachment_url", "is_read",
                  "created_at"]
        read_only_fields = ["id", "conversation", "sender", "created_at"]
        extra_kwargs = {
            "attachment": {"write_only": True, "required": False, "allow_null": True},
        }

    def get_is_read(self, obj):
        user = getattr(self.context.get("request"), "user", None)
        if user is None or not user.is_authenticated:
            return False
        return obj.is_read_by(user)

    def get_attachment_url(self, obj):
        return absolute_media_url(self.context.get("request"), obj.attachment)


class MessageCreateSerializer(serializers.Serializer):
    body = serializers.CharField()
    attachment = serializers.FileField(required=False, allow_null=True)

    def validate_body(self, value):
        if len(value.strip()) < 2:
            raise serializers.ValidationError("Write a message before sending.")
        return value.strip()


class ConversationSerializer(serializers.ModelSerializer):
    participants_detail = UserBriefSerializer(source="participants", many=True, read_only=True)
    counterpart = serializers.SerializerMethodField()
    unread_count = serializers.SerializerMethodField()
    message_count = serializers.SerializerMethodField()
    last_message = serializers.SerializerMethodField()
    created_by_name = serializers.CharField(source="created_by.full_name", read_only=True)
    property_title = serializers.CharField(source="property.title", read_only=True, default="")
    property_slug = serializers.CharField(source="property.slug", read_only=True, default="")
    lease_number = serializers.CharField(source="lease.number", read_only=True, default="")
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    category_display = serializers.CharField(source="get_category_display", read_only=True)

    class Meta:
        model = Conversation
        fields = [
            "id", "subject", "category", "category_display", "status", "status_display",
            "created_by", "created_by_name", "participants_detail", "counterpart",
            "property", "property_title", "property_slug", "lease", "lease_number",
            "unread_count", "message_count", "last_message",
            "last_message_at", "closed_at", "created_at",
        ]

    def _current_user(self):
        return getattr(self.context.get("request"), "user", None)

    def get_counterpart(self, obj):
        """The other person in the thread, so each side sees a sensible name."""
        user = self._current_user()
        participants = list(obj.participants.all())
        others = [person for person in participants if user is None or person.pk != user.pk]
        return UserBriefSerializer(others[0] if others else participants[0]).data if participants else None

    def get_unread_count(self, obj):
        user = self._current_user()
        return obj.unread_count(user) if user is not None else 0

    def get_message_count(self, obj):
        return obj.messages.count()

    def get_last_message(self, obj):
        message = obj.last_message()
        if message is None:
            return None
        return MessageSerializer(message, context=self.context).data


class ConversationDetailSerializer(ConversationSerializer):
    messages = MessageSerializer(many=True, read_only=True)

    class Meta(ConversationSerializer.Meta):
        fields = ConversationSerializer.Meta.fields + ["messages"]


class ConversationCreateSerializer(serializers.Serializer):
    recipient = serializers.PrimaryKeyRelatedField(queryset=User.objects.filter(is_active=True))
    subject = serializers.CharField(max_length=200)
    body = serializers.CharField()
    category = serializers.ChoiceField(
        choices=Conversation.Category.choices, default=Conversation.Category.GENERAL
    )
    property = serializers.PrimaryKeyRelatedField(
        queryset=Property.objects.all(), required=False, allow_null=True
    )
    lease = serializers.PrimaryKeyRelatedField(
        queryset=Lease.objects.all(), required=False, allow_null=True
    )

    def validate_recipient(self, value):
        user = self.context["request"].user
        if value.pk == user.pk:
            raise serializers.ValidationError("You cannot start a conversation with yourself.")
        if user.role != Role.ADMIN and value.role != Role.ADMIN:
            raise serializers.ValidationError(
                "Landlords and tenants should contact the Mant Bridges administration team."
            )
        return value

    def validate_subject(self, value):
        if len(value.strip()) < 3:
            raise serializers.ValidationError("Add a short subject for this conversation.")
        return value.strip()

    def validate_body(self, value):
        if len(value.strip()) < 2:
            raise serializers.ValidationError("Write a message before sending.")
        return value.strip()

    def validate(self, attrs):
        user = self.context["request"].user
        lease = attrs.get("lease")
        if lease is not None and user.role == Role.TENANT and lease.tenant_id != user.pk:
            raise serializers.ValidationError(
                {"lease": "You can only attach a tenancy that belongs to you."}
            )
        if lease is not None and user.role == Role.LANDLORD and lease.landlord_id != user.pk:
            raise serializers.ValidationError(
                {"lease": "You can only attach a tenancy that belongs to you."}
            )
        return attrs

    def create(self, validated_data):
        user = self.context["request"].user
        conversation = Conversation.objects.create(
            subject=validated_data["subject"],
            category=validated_data.get("category", Conversation.Category.GENERAL),
            created_by=user,
            property=validated_data.get("property"),
            lease=validated_data.get("lease"),
        )
        conversation.participants.set([user, validated_data["recipient"]])
        post_message(conversation, user, validated_data["body"])
        return conversation
