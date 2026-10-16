import { get, post, put, tokens, upload } from './client.js'

export function login(credentials) {
  return post('/auth/login/', credentials).then((data) => {
    tokens.save({ access: data.access, refresh: data.refresh, user: data.user })
    return data
  })
}

export function register(payload) {
  return post('/auth/register/', payload)
}

export function fetchMe() {
  return get('/auth/me/')
}

export function updateProfile(payload) {
  return put('/auth/me/', payload)
}

/** Avatar is a FileField, so a picture change has to travel as multipart. */
export function updateProfileWithFile(fields, file) {
  const form = new FormData()
  Object.entries(fields).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return
    form.append(key, value)
  })
  if (file) form.append('avatar', file)
  return upload('/auth/me/', form)
}

export function changePassword(payload) {
  return post('/auth/change-password/', payload)
}

/**
 * Clears browser credentials only. The backend has no token blocklist, so an
 * issued JWT stays valid until it expires — see BACKEND_FOLLOWUPS.md.
 */
export function logout() {
  tokens.clear()
}
