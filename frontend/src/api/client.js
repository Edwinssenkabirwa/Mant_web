import axios from 'axios'

const BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api'

const ACCESS_KEY = 'mb.access'
const REFRESH_KEY = 'mb.refresh'
const USER_KEY = 'mb.user'

export const SESSION_EXPIRED = 'mb:session-expired'

export const tokens = {
  access: () => localStorage.getItem(ACCESS_KEY),
  refresh: () => localStorage.getItem(REFRESH_KEY),
  user: () => {
    const raw = localStorage.getItem(USER_KEY)
    if (!raw) return null
    try {
      return JSON.parse(raw)
    } catch {
      return null
    }
  },
  save({ access, refresh, user }) {
    if (access) localStorage.setItem(ACCESS_KEY, access)
    if (refresh) localStorage.setItem(REFRESH_KEY, refresh)
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user))
  },
  setUser(user) {
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user))
    else localStorage.removeItem(USER_KEY)
  },
  clear() {
    localStorage.removeItem(ACCESS_KEY)
    localStorage.removeItem(REFRESH_KEY)
    localStorage.removeItem(USER_KEY)
  },
}

export const api = axios.create({ baseURL: BASE_URL, timeout: 30000 })

api.interceptors.request.use((config) => {
  const access = tokens.access()
  if (access) config.headers.Authorization = `Bearer ${access}`
  return config
})

let refreshing = null

async function renewToken() {
  const refresh = tokens.refresh()
  if (!refresh) return null
  try {
    const { data } = await axios.post(`${BASE_URL}/auth/refresh/`, { refresh })
    tokens.save(data)
    return data.access
  } catch {
    return null
  }
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const request = error.config
    const status = error.response?.status
    const url = request?.url || ''
    const isAuthEndpoint = url.includes('/auth/login/') || url.includes('/auth/refresh/')

    if (status === 401 && request && !request._retry && !isAuthEndpoint && tokens.refresh()) {
      request._retry = true
      refreshing = refreshing || renewToken()
      const access = await refreshing
      refreshing = null
      if (access) {
        request.headers.Authorization = `Bearer ${access}`
        return api(request)
      }
      tokens.clear()
      window.dispatchEvent(new CustomEvent(SESSION_EXPIRED))
    }
    return Promise.reject(error)
  },
)

/**
 * Backend errors arrive as { detail, errors, status_code }; fall back to the
 * axios message so callers always get something printable.
 */
export function describeError(error, fallback = 'Something went wrong. Please try again.') {
  const data = error?.response?.data
  if (data) {
    if (typeof data === 'string' && data.trim()) return data
    if (data.detail) return String(data.detail)
    if (data.error) return String(data.error)
    const first = flattenErrors(data)[0]
    if (first) return first.message
  }
  if (error?.code === 'ECONNABORTED') return 'The server took too long to respond. Please retry.'
  if (error?.request && !error?.response) return 'Cannot reach the server. Is the API running?'
  return error?.message || fallback
}

function flattenErrors(errors) {
  return Object.entries(errors || {}).flatMap(([field, value]) => {
    const key = field === 'non_field_errors' || field === 'detail' ? '' : field
    if (Array.isArray(value)) {
      return value.map((item) => ({ field: key, message: messageOf(item) }))
    }
    return [{ field: key, message: messageOf(value) }]
  })
}

function messageOf(value) {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'object' && value.message) return String(value.message)
  return String(value)
}

/** { field: [messages] } so forms can render per-field errors. */
export function fieldErrors(error) {
  const data = error?.response?.data
  if (!data || typeof data !== 'object') return {}
  const source = data.errors && typeof data.errors === 'object' ? data.errors : data
  const grouped = {}
  for (const { field, message } of flattenErrors(source)) {
    if (!field) continue
    if (!grouped[field]) grouped[field] = []
    grouped[field].push(message)
  }
  return grouped
}

export function isNotFound(error) {
  return error?.response?.status === 404
}

/** Build a query string, dropping empty values and arrays of nothing. */
export function buildQuery(params) {
  const search = new URLSearchParams()
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return
    if (Array.isArray(value)) {
      if (!value.length) return
      search.append(key, value.join(','))
      return
    }
    if (typeof value === 'object') return
    search.append(key, String(value))
  })
  const query = search.toString()
  return query ? `?${query}` : ''
}

export async function get(path, params, config) {
  const { data } = await api.get(path + buildQuery(params), config)
  return data
}

export async function post(path, body, config) {
  const { data } = await api.post(path, body, config)
  return data
}

export async function put(path, body, config) {
  const { data } = await api.put(path, body, config)
  return data
}

export async function patch(path, body, config) {
  const { data } = await api.patch(path, body, config)
  return data
}

export async function del(path, config) {
  const { data } = await api.delete(path, config)
  return data
}

export async function upload(path, formData) {
  const { data } = await api.post(path, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data
}

/** Multipart PATCH — used by the company profile, which has no POST handler. */
export async function patchUpload(path, formData) {
  const { data } = await api.patch(path, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data
}

/** Fetch a binary endpoint (PDFs) and hand it to the browser as a download. */
export async function download(path, filename, params) {
  const { data } = await api.get(path + buildQuery(params), { responseType: 'blob' })
  const blobUrl = URL.createObjectURL(data)
  const link = document.createElement('a')
  link.href = blobUrl
  link.download = filename || 'download.pdf'
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(blobUrl), 2000)
}
