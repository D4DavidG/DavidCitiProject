import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import SearchField from './SearchField'
import * as responsive from '../theme/responsive'

vi.mock('../theme/responsive', () => ({ useIsMobile: vi.fn(() => false) }))

/** Type one key at a time, as a person does: each press changes the box by one letter. */
function type(box, text) {
  Array.from(text).forEach((letter) => fireEvent.change(box, { target: { value: box.value + letter } }))
}

/** Backspace once. */
function backspace(box) {
  fireEvent.change(box, { target: { value: box.value.slice(0, -1) } })
}

const wait = (ms) => act(() => { vi.advanceTimersByTime(ms) })

describe('SearchField', () => {
  beforeEach(() => {
    // Fake time on its own (no real clock mixed in), so 299 ms and 300 ms are exact.
    vi.useFakeTimers()
    responsive.useIsMobile.mockReturnValue(false)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  function setup(props = {}) {
    const onSearch = vi.fn()
    render(<SearchField label="Search projects" onSearch={onSearch} {...props} />)
    return { onSearch, box: screen.getByRole('textbox', { name: 'Search projects' }) }
  }

  it('is named by its label', () => {
    const { box } = setup()
    expect(box).toBeInTheDocument()
    expect(screen.getByLabelText('Search projects')).toBe(box)
  })

  it('shows the starting text and does not search on load', () => {
    const { box, onSearch } = setup({ value: 'apollo' })
    expect(box).toHaveValue('apollo')
    wait(1000)
    expect(onSearch).not.toHaveBeenCalled()
  })

  it('does not search before 300 ms, and searches once after', () => {
    const { box, onSearch } = setup()
    type(box, 'apollo')
    wait(299)
    expect(onSearch).not.toHaveBeenCalled()
    wait(1)
    expect(onSearch).toHaveBeenCalledTimes(1)
    expect(onSearch).toHaveBeenCalledWith('apollo')
  })

  it('sends one search for fast typing, not one per key', () => {
    const { box, onSearch } = setup()
    type(box, 'ap')
    wait(200)
    type(box, 'ol')
    wait(200)
    expect(onSearch).not.toHaveBeenCalled()
    wait(100)
    expect(onSearch).toHaveBeenCalledTimes(1)
    expect(onSearch).toHaveBeenCalledWith('apol')
  })

  it('sends the text trimmed', () => {
    const { box, onSearch } = setup()
    type(box, '  apollo  ')
    wait(300)
    expect(onSearch).toHaveBeenCalledWith('apollo')
    expect(box).toHaveValue('  apollo  ')
  })

  it('searches at once on Enter, without submitting a form around it', () => {
    const onSearch = vi.fn()
    const onSubmit = vi.fn((e) => e.preventDefault())
    render(<form onSubmit={onSubmit}><SearchField label="Search projects" onSearch={onSearch} /></form>)
    const box = screen.getByRole('textbox', { name: 'Search projects' })
    fireEvent.change(box, { target: { value: ' apollo ' } })
    fireEvent.keyDown(box, { key: 'Enter' })
    expect(onSearch).toHaveBeenCalledTimes(1)
    expect(onSearch).toHaveBeenCalledWith('apollo')
    expect(onSubmit).not.toHaveBeenCalled()
    wait(300)
    expect(onSearch).toHaveBeenCalledTimes(1)
  })

  describe('the clear button', () => {
    it('is hidden while the box is empty and appears with text', () => {
      const { box } = setup()
      expect(screen.queryByRole('button', { name: 'Clear search' })).not.toBeInTheDocument()
      type(box, 'a')
      expect(screen.getByRole('button', { name: 'Clear search' })).toBeInTheDocument()
    })

    it('is there from the start when the box starts with text', () => {
      setup({ value: 'apollo' })
      expect(screen.getByRole('button', { name: 'Clear search' })).toBeInTheDocument()
    })

    it('empties the box, searches for "" at once, hides itself and keeps focus on the box', () => {
      const { box, onSearch } = setup({ value: 'apollo' })
      fireEvent.click(screen.getByRole('button', { name: 'Clear search' }))
      expect(box).toHaveValue('')
      expect(onSearch).toHaveBeenCalledTimes(1)
      expect(onSearch).toHaveBeenCalledWith('')
      expect(screen.queryByRole('button', { name: 'Clear search' })).not.toBeInTheDocument()
      expect(box).toHaveFocus()
    })

    it('cancels a search still waiting for its 300 ms', () => {
      const { box, onSearch } = setup()
      type(box, 'apollo')
      fireEvent.click(screen.getByRole('button', { name: 'Clear search' }))
      wait(1000)
      // Nothing had been searched yet, so there is nothing to undo: no call at all.
      expect(onSearch).not.toHaveBeenCalled()
    })
  })

  it('searches for "" at once when the text is deleted by hand', () => {
    const { box, onSearch } = setup({ value: 'ab' })
    backspace(box)
    backspace(box)
    expect(onSearch).toHaveBeenCalledTimes(1)
    expect(onSearch).toHaveBeenCalledWith('')
  })

  it('does not repeat a search the page already has', () => {
    const { box, onSearch } = setup()
    type(box, 'ab')
    wait(300)
    expect(onSearch).toHaveBeenCalledTimes(1)
    type(box, ' ')
    wait(300)
    expect(onSearch).toHaveBeenCalledTimes(1)
  })

  it('does not search after it is removed', () => {
    const onSearch = vi.fn()
    const { unmount } = render(<SearchField label="Search projects" onSearch={onSearch} />)
    type(screen.getByRole('textbox', { name: 'Search projects' }), 'apollo')
    unmount()
    wait(1000)
    expect(onSearch).not.toHaveBeenCalled()
  })

  it('calls the latest onSearch, not the one it first got', () => {
    const first = vi.fn()
    const second = vi.fn()
    const { rerender } = render(<SearchField label="Search projects" onSearch={first} />)
    type(screen.getByRole('textbox', { name: 'Search projects' }), 'x')
    rerender(<SearchField label="Search projects" onSearch={second} />)
    wait(300)
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledWith('x')
  })

  it('passes a placeholder and an id through', () => {
    setup({ placeholder: 'Name, username or email', id: 'people-search' })
    const box = screen.getByRole('textbox', { name: 'Search projects' })
    expect(box).toHaveAttribute('placeholder', 'Name, username or email')
    expect(box).toHaveAttribute('id', 'people-search')
  })

  describe('width', () => {
    it('is about 360 px wide on a desktop', () => {
      setup()
      expect(screen.getByTestId('search-field')).toHaveStyle({ width: '360px', maxWidth: '100%' })
    })

    it('is full width on a phone', () => {
      responsive.useIsMobile.mockReturnValue(true)
      setup()
      expect(screen.getByTestId('search-field')).toHaveStyle({ width: '100%' })
    })
  })
})
