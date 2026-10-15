import { createContext, useContext } from 'react'

/** Where the light/dark choice is remembered in this browser. */
export const MODE_KEY = 'acme.colorMode'

/** Outside a provider (some tests): light, and a switch that does nothing. */
export const ColorModeContext = createContext({ mode: 'light', toggleMode: () => {} })

/** The current colour mode ('light' or 'dark') and toggleMode() to switch it. */
export function useColorMode() {
  return useContext(ColorModeContext)
}

/** The remembered choice, else the system setting (prefers-color-scheme). */
export function initialMode() {
  try {
    const saved = localStorage.getItem(MODE_KEY)
    if (saved === 'light' || saved === 'dark') return saved
  } catch {
    // storage blocked (private window, settings): fall back to the system setting
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)')?.matches ? 'dark' : 'light'
}

/** Remember the choice; a browser that blocks storage simply forgets it. */
export function saveMode(mode) {
  try {
    localStorage.setItem(MODE_KEY, mode)
  } catch {
    // storage blocked: the choice lasts until the tab closes
  }
}
