import { useCallback, useEffect, useState } from 'react'

/**
 * Run `load` (a memoised function returning a Promise) and track its result.
 * Re-runs whenever `load` changes (wrap it in useCallback with its inputs) or
 * reload() is called. Loading is derived, never set inside the effect.
 *
 * @param {() => Promise<any>} load
 * @returns {{ data: any, error: Error|null, loading: boolean, reload: () => void, setData: (fn: (data: any) => any) => void }}
 */
export function useApi(load) {
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState({ load: null, attempt: -1, data: undefined, error: null })

  useEffect(() => {
    let current = true
    load().then(
      (data) => { if (current) setResult({ load, attempt, data, error: null }) },
      (error) => { if (current) setResult({ load, attempt, data: undefined, error }) },
    )
    return () => { current = false }
  }, [load, attempt])

  const loading = result.load !== load || result.attempt !== attempt
  const reload = useCallback(() => setAttempt((n) => n + 1), [])
  const setData = useCallback((update) => setResult((r) => ({ ...r, data: update(r.data) })), [])

  return { data: result.data, error: loading ? null : result.error, loading, reload, setData }
}
