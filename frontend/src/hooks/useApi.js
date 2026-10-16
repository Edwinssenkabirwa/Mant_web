import { useCallback, useEffect, useRef, useState } from 'react'
import { describeError } from '../api/client.js'

/**
 * Runs `requester` on mount and whenever its dependencies change, exposing the
 * loading / empty / error / data states every screen has to render.
 */
export function useApi(requester, deps = [], { skip = false, initial = null } = {}) {
  const [data, setData] = useState(initial)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(!skip)
  const runId = useRef(0)
  const callback = useRef(requester)
  callback.current = requester

  const run = useCallback(() => {
    const id = ++runId.current
    setLoading(true)
    setError(null)
    return Promise.resolve()
      .then(() => callback.current())
      .then((result) => {
        if (id !== runId.current) return undefined
        setData(result ?? null)
        return result
      })
      .catch((err) => {
        if (id !== runId.current) return undefined
        setError(describeError(err))
        return undefined
      })
      .finally(() => {
        if (id === runId.current) setLoading(false)
      })
  }, [])

  useEffect(() => {
    if (skip) {
      runId.current += 1
      setLoading(false)
      return undefined
    }
    run()
    return undefined
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skip, ...deps])

  return { data, error, loading, reload: run, setData }
}

export default useApi
