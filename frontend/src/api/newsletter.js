import { post } from './client.js'

export function subscribeNewsletter(payload) {
  return post('/newsletter/subscribe/', payload)
}

export function confirmNewsletter(token) {
  return post('/newsletter/confirm/', { token })
}

export function unsubscribeNewsletter(token) {
  return post('/newsletter/unsubscribe/', { token })
}
