import { del, get, post, upload } from './client.js'

export function listConversations(params) {
  return get('/conversations/', params)
}

export function conversationById(id) {
  return get(`/conversations/${id}/`)
}

export function unreadCount() {
  return get('/conversations/unread-count/')
}

/** Admins pass `scope: 'all'` to see every thread. */
export function recipients() {
  return get('/conversations/recipients/')
}

export function createConversation(payload) {
  return post('/conversations/', payload)
}

export function listMessages(conversationId) {
  return get(`/conversations/${conversationId}/messages/`)
}

/** `attachment` is a FileField, so a file has to travel as multipart. */
export function sendMessage(conversationId, body, attachment) {
  if (attachment) {
    const form = new FormData()
    form.append('body', body)
    form.append('attachment', attachment)
    return upload(`/conversations/${conversationId}/messages/`, form)
  }
  return post(`/conversations/${conversationId}/messages/`, { body })
}

export function markRead(conversationId) {
  return post(`/conversations/${conversationId}/mark-read/`, {})
}

export function closeConversation(conversationId) {
  return post(`/conversations/${conversationId}/close/`, {})
}

export function deleteConversation(conversationId) {
  return del(`/conversations/${conversationId}/`)
}

export const CONVERSATION_ORDERING = [
  { value: '-last_message_at', label: 'Latest activity' },
  { value: 'last_message_at', label: 'Oldest activity' },
  { value: '-created_at', label: 'Newest threads' },
  { value: 'status', label: 'Status' },
]
