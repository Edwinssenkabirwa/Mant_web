import { api } from './client.js'

const MAX_PAGES = 20

/**
 * The backend paginates every list at 12 rows and does not accept a custom
 * page size, so option pickers have to walk the `next` links.
 */
export async function fetchAllPages(firstPage, cap = MAX_PAGES) {
  const rows = [...(firstPage?.results ?? [])]
  let next = firstPage?.next
  let pages = 1
  while (next && pages < cap) {
    const { data } = await api.get(next)
    rows.push(...(data.results ?? []))
    next = data.next
    pages += 1
  }
  return rows
}

export async function collect(getter, params, cap = MAX_PAGES) {
  const first = await getter(params)
  return fetchAllPages(first, cap)
}

/** Total row count alongside the collected rows. */
export function pageCount(page) {
  return page?.count ?? 0
}
