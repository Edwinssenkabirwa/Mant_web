import { del, get, patch, post, put, upload } from './client.js'

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
 * The image is an ImageField, so a freshly picked file travels as multipart on
 * its own; text edits stay JSON because a multipart body cannot carry the
 * `highlights` list.
 */
export function uploadServiceImage(id, file) {
  const form = new FormData()
  form.append('image', file)
  return upload(`/manage/services/${id}/`, form)
}
