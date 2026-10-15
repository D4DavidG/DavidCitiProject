import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Run `load` (a memoised function returning a Promise) and track its result.
 * Re-runs whenever `load` changes (wrap it in useCallback with its inputs) or
 * reload() is called. Loading is derived, never set inside the effect.
 *
 * reload() returns a Promise that resolves once the reloaded data (or error) has landed.
 *
 * @param {() => Promise<any>} load
 * @returns {{ data: any, error: Error|null, loading: boolean, reload: () => Promise<void>, setData: (fn: (data: any) => any) => void }}
 */
export function useApi(load) {
  const [attempt, setAttempt] = useState(0)
  const waiting = useRef([])
  const [result, setResult] = useState({ load: null, attempt: -1, data: undefined, error: null })

  /** Wake everyone who called reload() and is waiting for this answer. */
  const settle = () => { waiting.current.splice(0).forEach((done) => done()) }

  useEffect(() => {
    let current = true
    load().then(
      (data) => { if (current) { setResult({ load, attempt, data, error: null }); settle() } },
      (error) => { if (current) { setResult({ load, attempt, data: undefined, error }); settle() } },
    )
    return () => { current = false }
  }, [load, attempt])

  const loading = result.load !== load || result.attempt !== attempt
  const reload = useCallback(() => new Promise((done) => {
    waiting.current.push(done)
    setAttempt((n) => n + 1)
  }), [])
  const setData = useCallback((update) => setResult((r) => ({ ...r, data: update(r.data) })), [])

  return { data: result.data, error: loading ? null : result.error, loading, reload, setData }
}
