import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useTheme } from '@mui/material/styles'
import ColorModeProvider from './ColorModeProvider'
import ColorModeToggle from './ColorModeToggle'
import { MODE_KEY, useColorMode } from './colorMode'

/** Shows the mode the hook reports and the mode of the theme pages actually get. */
function Probe() {
  const { mode } = useColorMode()
  return <p>{`${mode} / ${useTheme().palette.mode}`}</p>
}

function renderMode() {
  return render(<ColorModeProvider><Probe /><ColorModeToggle /></ColorModeProvider>)
}

/** Pretend the system setting is dark (or not). */
function systemPrefersDark(dark) {
  vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
    matches: dark && query === '(prefers-color-scheme: dark)',
    media: query,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
  }))
}

describe('colour mode', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('follows the system setting on a first visit', () => {
    systemPrefersDark(true)
    renderMode()
    expect(screen.getByText('dark / dark')).toBeInTheDocument()
  })

  it('is light when the system is light', () => {
    systemPrefersDark(false)
    renderMode()
    expect(screen.getByText('light / light')).toBeInTheDocument()
  })

  it('switches with the sun/moon button, and remembers the choice for next time', async () => {
    systemPrefersDark(false)
    const { unmount } = renderMode()
    await userEvent.click(screen.getByRole('button', { name: 'Switch to dark mode' }))
    expect(screen.getByText('dark / dark')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Switch to light mode' })).toBeInTheDocument()
    expect(localStorage.getItem(MODE_KEY)).toBe('dark')
    unmount()

    renderMode() // the system still says light; the remembered choice wins
    expect(screen.getByText('dark / dark')).toBeInTheDocument()
  })

  it('still works when the browser blocks storage', async () => {
    systemPrefersDark(true)
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    renderMode()
    expect(screen.getByText('dark / dark')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Switch to light mode' }))
    expect(screen.getByText('light / light')).toBeInTheDocument()
  })

  it('ignores a stored value it does not know', () => {
    systemPrefersDark(false)
    localStorage.setItem(MODE_KEY, 'purple')
    renderMode()
    expect(screen.getByText('light / light')).toBeInTheDocument()
  })
})
