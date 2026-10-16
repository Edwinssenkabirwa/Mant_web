from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.models import Role, User
from apps.accounts.serializers import UserBriefSerializer
from apps.messaging.filters import ConversationFilter
from apps.messaging.models import Conversation, Message
from apps.messaging.serializers import (
    ConversationCreateSerializer,
    ConversationDetailSerializer,
    ConversationSerializer,
    MessageCreateSerializer,
    MessageSerializer,
)
from apps.messaging.services import mark_conversation_read, post_message


class ConversationViewSet(mixins.CreateModelMixin, mixins.DestroyModelMixin,
                          viewsets.ReadOnlyModelViewSet):
    """Inbox threads between tenants, landlords and the Mant Bridges team."""

    permission_classes = [IsAuthenticated]
    serializer_class = ConversationSerializer
    filterset_class = ConversationFilter
    ordering_fields = ["last_message_at", "created_at", "status", "subject"]
    ordering = ["-last_message_at", "-id"]

    def get_queryset(self):
        user = self.request.user
        queryset = Conversation.objects.select_related(
            "created_by", "property", "lease"
        ).prefetch_related("participants", "messages__sender", "messages__read_by")
        if user.role == Role.ADMIN and self.request.query_params.get("scope") == "all":
            return queryset
        return queryset.filter(participants=user)

    def get_serializer_class(self):
        if self.action == "create":
            return ConversationCreateSerializer
        if self.action == "retrieve":
            return ConversationDetailSerializer
        return ConversationSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        conversation = serializer.save()
        return Response(ConversationSerializer(conversation, context={"request": request}).data,
                        status=status.HTTP_201_CREATED)

    def retrieve(self, request, *args, **kwargs):
        conversation = self.get_object()
        mark_conversation_read(conversation, request.user)
        return Response(self.get_serializer(conversation).data)

    def destroy(self, request, *args, **kwargs):
        if request.user.role != Role.ADMIN:
            raise PermissionDenied("Only administrators can delete conversations.")
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=["get", "post"])
    def messages(self, request, pk=None):
        conversation = self.get_object()
        if request.method == "GET":
            messages = list(conversation.messages.all())
            return Response(MessageSerializer(messages, many=True,
                                              context={"request": request}).data)

        form = MessageCreateSerializer(data=request.data)
        form.is_valid(raise_exception=True)
        if conversation.status == Conversation.Status.CLOSED:
            if request.user.role != Role.ADMIN:
                return Response(
                    {"detail": "This conversation is closed. Start a new one to continue."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            Conversation.objects.filter(pk=conversation.pk).update(
                status=Conversation.Status.OPEN, closed_at=None
            )
            conversation.status = Conversation.Status.OPEN
            conversation.closed_at = None

        message = post_message(
            conversation, request.user,
            form.validated_data["body"],
            form.validated_data.get("attachment"),
        )
        mark_conversation_read(conversation, request.user)
        return Response(MessageSerializer(message, context={"request": request}).data,
                        status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], url_path="mark-read")
    def mark_read(self, request, pk=None):
        conversation = self.get_object()
        marked = mark_conversation_read(conversation, request.user)
        return Response({"detail": f"{marked} message(s) marked as read.",
                         "marked_read": marked})

    @action(detail=True, methods=["post"])
    def close(self, request, pk=None):
        conversation = self.get_object()
        if request.user.role != Role.ADMIN and conversation.created_by_id != request.user.pk:
            raise PermissionDenied("Only an administrator or the person who started this "
                                   "conversation can close it.")
        if conversation.status == Conversation.Status.CLOSED:
            return Response({"detail": "This conversation is already closed."},
                            status=status.HTTP_400_BAD_REQUEST)
        conversation.close()
        conversation.refresh_from_db()
        return Response(self.get_serializer(conversation).data)

    @action(detail=False, methods=["get"], url_path="unread-count")
    def unread_count(self, request):
        queryset = self.get_queryset()
        unread = Message.objects.filter(conversation__in=queryset).exclude(
            sender=request.user
        ).exclude(read_by=request.user).count()
        return Response({
            "unread": unread,
            "open": queryset.filter(status=Conversation.Status.OPEN).count(),
            "total": queryset.count(),
        })

    @action(detail=False, methods=["get"])
    def recipients(self, request):
        """Who the signed-in user is allowed to start a conversation with."""
        if request.user.role == Role.ADMIN:
            queryset = User.objects.filter(
                is_active=True, role__in=[Role.LANDLORD, Role.TENANT]
            )
        else:
            queryset = User.objects.filter(is_active=True, role=Role.ADMIN)
        queryset = queryset.order_by("first_name", "last_name")[:50]
        return Response(UserBriefSerializer(queryset, many=True).data)
