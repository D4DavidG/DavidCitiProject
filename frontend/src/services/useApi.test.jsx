import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useApi } from './useApi'

describe('useApi', () => {
  it('loads once, and a re-render with the same loader does not load again', async () => {
    const load = vi.fn(() => Promise.resolve('data'))
    const { result, rerender } = renderHook(({ fn }) => useApi(fn), { initialProps: { fn: load } })
    await waitFor(() => expect(result.current.data).toBe('data'))
    rerender({ fn: load })
    rerender({ fn: load })
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('loads again whenever the loader is a new function, which is why callers wrap it in useCallback', async () => {
    const calls = vi.fn()
    const make = (n) => () => { calls(n); return Promise.resolve(n) }
    const { result, rerender } = renderHook(({ fn }) => useApi(fn), { initialProps: { fn: make(1) } })
    await waitFor(() => expect(result.current.data).toBe(1))
    rerender({ fn: make(2) })
    await waitFor(() => expect(result.current.data).toBe(2))
    expect(calls.mock.calls).toEqual([[1], [2]])
  })
})
