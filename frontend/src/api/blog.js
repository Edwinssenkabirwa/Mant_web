import { del, get, patch, post, put, upload } from './client.js'

export function listPosts(params) {
  return get('/blog/posts/', params)
}

export function featuredPosts() {
  return get('/blog/posts/featured/')
}

export function latestPosts() {
  return get('/blog/posts/latest/')
}

export function postTags() {
  return get('/blog/posts/tags/')
}

export function postBySlug(slug) {
  return get(`/blog/posts/${encodeURIComponent(slug)}/`)
}

export function listCategories(params) {
  return get('/blog/categories/', params)
}

export function categoryBySlug(slug) {
  return get(`/blog/categories/${encodeURIComponent(slug)}/`)
}

/* ---------- Blog administration ------------------------------------------ */

export function manageList(params) {
  return get('/manage/posts/', params)
}

export function manageStats() {
  return get('/manage/posts/stats/')
}

export function manageById(id) {
  return get(`/manage/posts/${id}/`)
}

/**
 * `cover_image` is an ImageField, so a freshly picked file has to travel as
 * multipart form data; a text-only edit can stay JSON.
 */
export function createPost(payload, coverFile) {
  if (coverFile) return upload('/manage/posts/', toFormData(payload, coverFile))
  return post('/manage/posts/', payload)
}

export function updatePost(id, payload, coverFile) {
  if (coverFile) return upload(`/manage/posts/${id}/`, toFormData(payload, coverFile, true))
  return put(`/manage/posts/${id}/`, payload)
}

/**
 * The list endpoint omits `content`, so a quick publish/feature toggle has to
 * PATCH; a PUT built from a list row would arrive with an empty body.
 */
export function patchPost(id, payload) {
  return patch(`/manage/posts/${id}/`, payload)
}

export function deletePost(id) {
  return del(`/manage/posts/${id}/`)
}

export function manageCategories(params) {
  return get('/manage/blog-categories/', params)
}

export function createCategory(payload) {
  return post('/manage/blog-categories/', payload)
}

export function updateCategory(id, payload) {
  return put(`/manage/blog-categories/${id}/`, payload)
}

export function deleteCategory(id) {
  return del(`/manage/blog-categories/${id}/`)
}

function toFormData(payload, coverFile, partial = false) {
  const form = new FormData()
  for (const [key, value] of Object.entries(payload)) {
    if (partial && value === undefined) continue
    if (value === null || value === undefined) continue
    form.append(key, Array.isArray(value) ? value.join(',') : value)
  }
  if (coverFile) form.append('cover_image', coverFile)
  return form
}

export const POST_ORDERING = [
  { value: '-published_at', label: 'Newest first' },
  { value: 'published_at', label: 'Oldest first' },
  { value: '-views', label: 'Most read' },
  { value: 'title', label: 'Title A–Z' },
]
