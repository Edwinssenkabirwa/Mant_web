import { del, get, patch, post, put } from './client.js'
import { collect } from './paginate.js'

export function listUsers(params) {
  return get('/users/', params)
}

export function userStats() {
  return get('/users/stats/')
}

export function userById(id) {
  return get(`/users/${id}/`)
}

export function createUser(payload) {
  return post('/users/', payload)
}

export function updateUser(id, payload) {
  return put(`/users/${id}/`, payload)
}

export function patchUser(id, payload) {
  return patch(`/users/${id}/`, payload)
}

export function deleteUser(id) {
  return del(`/users/${id}/`)
}

/** Dropdown source for leases, invoices and conversations. */
export function tenantOptions() {
  return collect(listUsers, { role: 'TENANT', ordering: 'first_name' })
}

export function landlordOptions() {
  return collect(listUsers, { role: 'LANDLORD', ordering: 'first_name' })
}

export function peopleOptions() {
  return collect(listUsers, { ordering: 'first_name' })
}

export const USER_ORDERING = [
  { value: '-date_joined', label: 'Newest accounts' },
  { value: 'first_name', label: 'First name A–Z' },
  { value: 'last_name', label: 'Last name A–Z' },
  { value: 'email', label: 'Email A–Z' },
  { value: 'role', label: 'Role' },
]
