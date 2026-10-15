/* Test helpers: render a screen inside the router, theme and a chosen session. */
import { render } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { ThemeProvider } from '@mui/material/styles'
import { vi } from 'vitest'
import { AuthContext } from '../auth/useAuth'
import theme from '../theme/theme'

export const USERS = {
  admin: { userId: 1, username: 'AD000001', firstName: 'System', lastName: 'Administrator', role: 'ADMIN', mustChangePassword: false },
  manager: { userId: 2, username: 'ML662930', firstName: 'Maria', lastName: 'Lopez', role: 'MANAGER', mustChangePassword: false },
  employee: { userId: 3, username: 'BO435681', firstName: 'Ben', lastName: 'Okafor', role: 'EMPLOYEE', mustChangePassword: false },
}

/** A signed-in session value for AuthContext. */
export function session(user, overrides = {}) {
  return {
    user,
    status: user ? 'signedIn' : 'signedOut',
    sessionExpired: false,
    login: vi.fn(),
    logout: vi.fn(),
    refreshUser: vi.fn(),
    startSession: vi.fn((result) => result.user),
    ...overrides,
  }
}

/**
 * Render `ui` at `path`, inside a router whose route pattern is `route`.
 * Extra routes (e.g. a /login placeholder) let redirect tests see where they landed.
 * `theme` defaults to the light theme; pass makeTheme('dark') to check dark mode.
 */
export function renderAt(ui, {
  path = '/', route = '*', auth = session(USERS.manager), extraRoutes = null, theme: chosen = theme,
} = {}) {
  return render(
    <ThemeProvider theme={chosen}>
      <AuthContext.Provider value={auth}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path={route} element={ui} />
            {extraRoutes}
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    </ThemeProvider>,
  )
}

/** A fetch stub answering by "METHOD /path" (path without the /api/tracker prefix or query). */
export function stubApi(answers) {
  const calls = []
  const fetchMock = vi.fn((url, init = {}) => {
    const { pathname, search } = new URL(url, 'http://localhost')
    const path = pathname.replace(/^\/api\/tracker/, '')
    const method = init.method ?? 'GET'
    calls.push({ method, path, query: Object.fromEntries(new URLSearchParams(search)), body: init.body ? JSON.parse(init.body) : undefined, headers: init.headers })
    const key = `${method} ${path}`
    const found = answers[key] ?? answers[`${method} *`]
    if (!found) return Promise.resolve({ ok: false, status: 404, text: () => Promise.resolve(JSON.stringify({ error: `No stub for ${key}` })) })
    const [status, payload] = typeof found === 'function' ? found(calls.at(-1)) : found
    return Promise.resolve({ ok: status < 300, status, text: () => Promise.resolve(payload === undefined ? '' : JSON.stringify(payload)) })
  })
  vi.stubGlobal('fetch', fetchMock)
  return calls
}

/**
 * Hold every call to `path` open until the returned release() runs, so a test can
 * act while that request is still in flight. Call it after stubApi; it wraps that stub.
 */
export function holdOpen(path) {
  const stubbed = globalThis.fetch
  let open
  const gate = new Promise((resolve) => { open = resolve })
  vi.stubGlobal('fetch', vi.fn((url, init) => {
    const { pathname } = new URL(url, 'http://localhost')
    if (pathname.replace(/^\/api\/tracker/, '') !== path) return stubbed(url, init)
    return gate.then(() => stubbed(url, init))
  }))
  return () => open()
}

/** A list envelope, as every list endpoint returns. */
export function page(items, extra = {}) {
  return { items, page: 1, pageSize: 20, total: items.length, totalPages: items.length ? 1 : 0, ...extra }
}
