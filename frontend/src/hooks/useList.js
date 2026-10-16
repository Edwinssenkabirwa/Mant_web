import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { describeError } from '../api/client.js'

const PAGE_SIZE = 12

/**
 * Server-side pagination for the DRF list endpoints. `params` is the filter
 * object (page is managed here), and any change resets to page 1.
 */
export function useList(fetcher, params = {}, { enabled = true } = {}) {
  const [filters, setFiltersState] = useState(() => prune(params))
  const [page, setPage] = useState(1)
  const [rows, setRows] = useState([])
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState(null)
  const runId = useRef(0)
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher
  const initialRef = useRef(params)

  const key = useMemo(() => JSON.stringify(filters), [filters])

  const load = useCallback(() => {
    if (!enabled) {
      setLoading(false)
      return Promise.resolve()
    }
    const id = ++runId.current
    setLoading(true)
    setError(null)
    return fetcherRef.current({ ...filters, page })
      .then((data) => {
        if (id !== runId.current) return
        if (Array.isArray(data)) {
          setRows(data)
          setCount(data.length)
        } else {
          setRows(data?.results ?? [])
          setCount(data?.count ?? 0)
        }
      })
      .catch((err) => {
        if (id !== runId.current) return
        setError(describeError(err))
        setRows([])
      })
      .finally(() => {
        if (id === runId.current) setLoading(false)
      })
  }, [enabled, filters, page])

  useEffect(() => {
    load()
    return undefined
  }, [load])

  const setFilters = useCallback((next, { keepPage = false } = {}) => {
    setFiltersState((current) => prune(typeof next === 'function' ? next(current) : next))
    if (!keepPage) setPage(1)
  }, [])

  const patchFilters = useCallback(
    (partial, options) => setFilters((current) => ({ ...current, ...partial }), options),
    [setFilters]
  )

  const reset = useCallback(() => {
    setFiltersState(prune(initialRef.current))
    setPage(1)
  }, [])

  return {
    rows,
    count,
    page,
    pageSize: PAGE_SIZE,
    pageCount: Math.max(1, Math.ceil(count / PAGE_SIZE)),
    loading,
    error,
    filters,
    setFilters,
    patchFilters,
    setPage,
    reload: load,
    reset,
    isEmpty: !loading && !error && rows.length === 0,
  }
}

function prune(value) {
  const out = {}
  for (const [key, item] of Object.entries(value || {})) {
    if (item === '' || item === null || item === undefined) continue
    if (Array.isArray(item) && item.length === 0) continue
    out[key] = item
  }
  return out
}

export function hasActiveFilters(filters, ignore = ['ordering']) {
  return Object.keys(filters).some((key) => !ignore.includes(key))
}

export default useList
