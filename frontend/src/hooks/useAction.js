import { useCallback, useRef, useState } from 'react'
import { describeError, fieldErrors } from '../api/client.js'

/**
 * Wraps a submit/action call so every form gets the same pending flag, printable
 * error and per-field server errors.
 */
export function useAction(runner, { onDone } = {}) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState(null)
  const [errors, setErrors] = useState({})
  const [done, setDone] = useState(false)
  const runnerRef = useRef(runner)
  runnerRef.current = runner
  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone

  const reset = useCallback(() => {
    setPending(false)
    setError(null)
    setErrors({})
    setDone(false)
  }, [])

  const execute = useCallback(async (...args) => {
    setPending(true)
    setError(null)
    setErrors({})
    setDone(false)
    try {
      const result = await runnerRef.current(...args)
      setDone(true)
      setPending(false)
      onDoneRef.current?.(result)
      return result
    } catch (err) {
      setError(describeError(err))
      setErrors(fieldErrors(err))
      setPending(false)
      return undefined
    }
  }, [])

  return { execute, pending, error, errors, done, reset, setPending }
}

export default useAction
