import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Pager } from './PageState'

describe('Pager', () => {
  it('renders nothing for 0, 1 or missing pages', () => {
    [0, 1, undefined].forEach((totalPages) => {
      const { unmount } = render(<Pager page={1} totalPages={totalPages} onChange={vi.fn()} />)
      expect(screen.queryByRole('navigation')).toBeNull()
      unmount()
    })
  })

  it('calls onChange with the page number', async () => {
    const onChange = vi.fn()
    render(<Pager page={1} totalPages={3} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: 'Go to page 2' }))
    expect(onChange).toHaveBeenCalledExactlyOnceWith(2)
  })
})
