import { del, get, patch, patchUpload, post, put } from './client.js'

/* ---------- Public website ------------------------------------------------ */

export function listServices(params) {
  return get('/services/', params)
}

export function serviceBySlug(slug) {
  return get(`/services/${encodeURIComponent(slug)}/`)
}

/* ---------- Administration ------------------------------------------------ */

export function manageServices(params) {
  return get('/manage/services/', params)
}

export function manageServiceById(id) {
  return get(`/manage/services/${id}/`)
}

export function createService(payload) {
  return post('/manage/services/', payload)
}

export function updateService(id, payload) {
  return put(`/manage/services/${id}/`, payload)
}

/** Publish, unpublish and re-order without resending the whole record. */
export function patchService(id, payload) {
  return patch(`/manage/services/${id}/`, payload)
}

export function deleteService(id) {
  return del(`/manage/services/${id}/`)
}

/**
 * The image is an ImageField, so a freshly picked file travels as a multipart PATCH on its
 * own and the text edits travel as JSON. The detail route has no POST handler — only
 * retrieve, update, partial update and delete — so this is the verb that replaces a picture.
 */
export function uploadServiceImage(id, file) {
  const form = new FormData()
  form.append('image', file)
  return patchUpload(`/manage/services/${id}/`, form)
}
