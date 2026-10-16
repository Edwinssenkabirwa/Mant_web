import { del, get, patch, patchUpload, post, put } from './client.js'

export function companyProfile() {
  return get('/company/')
}

/**
 * The company profile is a singleton, so partial saves keep the fields that are
 * not shown. Picking a logo file sends the same patch as multipart in one
 * request, so the text and the image cannot drift apart.
 */
export function patchCompany(payload, logoFile) {
  if (!logoFile) return patch('/company/', payload)
  const form = new FormData()
  for (const [key, value] of Object.entries(payload)) {
    form.append(key, value ?? '')
  }
  form.append('logo', logoFile)
  return patchUpload('/company/', form)
}

export function lookups() {
  return get('/lookups/')
}

export function health() {
  return get('/health/')
}

/** Public enquiry inbox: name, email, phone, subject, message, property. */
export function submitEnquiry(payload) {
  return post('/enquiries/', payload)
}

export function listEnquiries(params) {
  return get('/manage/enquiries/', params)
}

export function enquiryStats() {
  return get('/manage/enquiries/stats/')
}

export function enquiryById(id) {
  return get(`/manage/enquiries/${id}/`)
}

export function updateEnquiry(id, payload) {
  return put(`/manage/enquiries/${id}/`, payload)
}

export function patchEnquiry(id, payload) {
  return patch(`/manage/enquiries/${id}/`, payload)
}

export function deleteEnquiry(id) {
  return del(`/manage/enquiries/${id}/`)
}
