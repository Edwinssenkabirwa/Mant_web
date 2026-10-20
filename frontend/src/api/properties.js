import { del, get, patch, post, put, upload } from './client.js'

export function listProperties(params) {
  return get('/properties/', params)
}

export function featuredProperties() {
  return get('/properties/featured/')
}

export function propertyStats() {
  return get('/properties/stats/')
}

export function propertyCities() {
  return get('/properties/cities/')
}

export function propertyBySlug(slug) {
  return get(`/properties/${encodeURIComponent(slug)}/`)
}

/* ---------- Management (/api/manage/properties/, numeric pk) -------------- */

export function manageList(params) {
  return get('/manage/properties/', params)
}

export function manageStats() {
  return get('/manage/properties/stats/')
}

export function manageById(id) {
  return get(`/manage/properties/${id}/`)
}

export function createProperty(payload) {
  return post('/manage/properties/', payload)
}

export function updateProperty(id, payload) {
  return put(`/manage/properties/${id}/`, payload)
}

export function patchProperty(id, payload) {
  return patch(`/manage/properties/${id}/`, payload)
}

export function deleteProperty(id) {
  return del(`/manage/properties/${id}/`)
}

/** Multipart image upload; `image` is the file field the backend expects. */
export function addPropertyImage(id, formData) {
  return upload(`/manage/properties/${id}/images/`, formData)
}

/**
 * Partial update only: PUT is rejected with "Image: No file was submitted",
 * so cover/order changes must PATCH.
 */
export function updatePropertyImage(id, payload) {
  return patch(`/manage/property-images/${id}/`, payload)
}

export function deletePropertyImage(id) {
  return del(`/manage/property-images/${id}/`)
}

export const PROPERTY_ORDERING = [
  { value: '-created_at', label: 'Newest first' },
  { value: 'created_at', label: 'Oldest first' },
  { value: 'price', label: 'Price: low to high' },
  { value: '-price', label: 'Price: high to low' },
  { value: 'bedrooms', label: 'Bedrooms: few to many' },
  { value: '-bedrooms', label: 'Bedrooms: many to few' },
  { value: '-views', label: 'Most viewed' },
  { value: 'title', label: 'Title A–Z' },
]

export const MANAGE_PROPERTY_ORDERING = [
  { value: '-created_at', label: 'Newest first' },
  { value: 'title', label: 'Title A–Z' },
  { value: '-price', label: 'Price: high to low' },
  { value: 'price', label: 'Price: low to high' },
  { value: 'status', label: 'Status' },
  { value: 'city', label: 'City' },
]

/* ---------- An owner's own recommendations (/api/landlord/recommendations/) -- */

export function listMyRecommendations(params) {
  return get('/landlord/recommendations/', params)
}

export function myRecommendation(id) {
  return get(`/landlord/recommendations/${id}/`)
}

export function createRecommendation(payload) {
  return post('/landlord/recommendations/', payload)
}

/** PUT needs every field again, so amending one answer is a PATCH. */
export function updateRecommendation(id, payload) {
  return patch(`/landlord/recommendations/${id}/`, payload)
}

export function deleteRecommendation(id) {
  return del(`/landlord/recommendations/${id}/`)
}

export function sendRecommendation(id) {
  return post(`/landlord/recommendations/${id}/submit/`, {})
}

/* ---------- The office verification queue (/api/manage/recommendations/) ---- */

export function recommendationQueue(params) {
  return get('/manage/recommendations/', params)
}

export function recommendationQueueStats() {
  return get('/manage/recommendations/stats/')
}

export function editRecommendation(id, payload) {
  return patch(`/manage/recommendations/${id}/`, payload)
}

export function startDueDiligence(id) {
  return post(`/manage/recommendations/${id}/review/`, {})
}

/** Publishes the listing on the owner's account. `{ listing_type, price, currency, note }`. */
export function verifyRecommendation(id, payload) {
  return post(`/manage/recommendations/${id}/verify/`, payload)
}

export function declineRecommendation(id, payload) {
  return post(`/manage/recommendations/${id}/decline/`, payload)
}
