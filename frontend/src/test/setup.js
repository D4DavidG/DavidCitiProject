import '@testing-library/jest-dom/vitest'
import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import { setTokens } from '../services/request'

// jsdom has no matchMedia; react-responsive and MUI need one. Desktop width by default.
if (!window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() { return false },
  })
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  setTokens(null, null) // the request module keeps its tokens between tests in one file
  try {
    sessionStorage.clear()
  } catch {
    // storage can be unavailable; nothing to clear
  }
})
