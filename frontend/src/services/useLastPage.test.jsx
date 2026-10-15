import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useLastPage } from './useLastPage'

const list = (items, totalPages) => ({ items, totalPages })

describe('useLastPage', () => {
  it('steps back to the last page that is left when the page shown is empty', () => {
    const setPage = vi.fn()
    renderHook(() => useLastPage(list([], 2), 3, setPage))
    expect(setPage).toHaveBeenCalledWith(2)
  })

  it('goes to page 1 when nothing is left but an empty page was shown after the first', () => {
    const setPage = vi.fn()
    renderHook(() => useLastPage(list([], 0), 2, setPage))
    expect(setPage).toHaveBeenCalledWith(1)
  })

  it('leaves a page that has rows alone', () => {
    const setPage = vi.fn()
    renderHook(() => useLastPage(list([{ id: 1 }], 3), 3, setPage))
    expect(setPage).not.toHaveBeenCalled()
  })

  it('leaves page 1 alone even when it is empty (the list is just empty)', () => {
    const setPage = vi.fn()
    renderHook(() => useLastPage(list([], 0), 1, setPage))
    expect(setPage).not.toHaveBeenCalled()
  })

  it('does nothing before the first answer', () => {
    const setPage = vi.fn()
    renderHook(() => useLastPage(undefined, 3, setPage))
    expect(setPage).not.toHaveBeenCalled()
  })
})
