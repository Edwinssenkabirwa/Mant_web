import { del, get, patch, post } from './client.js'

/**
 * Admin-only email surface. Everything here is behind IsAdminRole on the server;
 * the audience size, the recipient list and the delivery counts are all resolved by
 * Django, never estimated in the browser.
 */

export function listSubscribers(params) {
  return get('/manage/email/subscribers/', params)
}

export function subscriberStats() {
  return get('/manage/email/subscribers/stats/')
}

export function patchSubscriber(id, payload) {
  return patch(`/manage/email/subscribers/${id}/`, payload)
}

export function suppressSubscriber(id) {
  return post(`/manage/email/subscribers/${id}/suppress/`, {})
}

export function reactivateSubscriber(id) {
  return post(`/manage/email/subscribers/${id}/reactivate/`, {})
}

export function listCampaigns(params) {
  return get('/manage/email/campaigns/', params)
}

export function campaignById(id) {
  return get(`/manage/email/campaigns/${id}/`)
}

export function createCampaign(payload) {
  return post('/manage/email/campaigns/', payload)
}

export function updateCampaign(id, payload) {
  return patch(`/manage/email/campaigns/${id}/`, payload)
}

export function deleteCampaign(id) {
  return del(`/manage/email/campaigns/${id}/`)
}

export function campaignStats() {
  return get('/manage/email/campaigns/stats/')
}

export function estimateAudience(audiences) {
  return post('/manage/email/campaigns/audience-count/', { audiences })
}

export function campaignPreview(id) {
  return get(`/manage/email/campaigns/${id}/preview/`)
}

export function campaignRecipients(id, params) {
  return get(`/manage/email/campaigns/${id}/recipients/`, params)
}

export function sendCampaignTest(id, email) {
  return post(`/manage/email/campaigns/${id}/test/`, { email })
}

export function queueCampaign(id) {
  return post(`/manage/email/campaigns/${id}/queue/`, {})
}

export function cancelCampaign(id) {
  return post(`/manage/email/campaigns/${id}/cancel/`, {})
}
