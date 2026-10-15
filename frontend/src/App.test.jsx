import { Suspense } from 'react'
import { describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { ThemeProvider } from '@mui/material/styles'
import App, { AppRoutes } from './App'
import appSource from './App.jsx?raw'
import { AuthContext } from './auth/useAuth'
import lazyPage from './components/lazyPage'
import theme from './theme/theme'
import { USERS, session, stubApi } from './test/utils'

function renderApp(path, auth) {
  stubApi({ 'GET *': [200, { items: [], page: 1, pageSize: 20, total: 0, totalPages: 0 }] })
  return render(
    <ThemeProvider theme={theme}>
      <AuthContext.Provider value={auth}>
        <MemoryRouter initialEntries={[path]}><AppRoutes /></MemoryRouter>
      </AuthContext.Provider>
    </ThemeProvider>,
  )
}

describe('routes', () => {
  it('sends a signed-out visitor from / to the login page', async () => {
    renderApp('/', session(null))
    expect(await screen.findByRole('heading', { name: /sign in/i })).toBeInTheDocument()
  })

  it('lands managers on the dashboard', async () => {
    renderApp('/', session(USERS.manager))
    expect(await screen.findByRole('heading', { name: /dashboard/i })).toBeInTheDocument()
  })

  it('lands employees on their own Dashboard, with their tasks on it', async () => {
    renderApp('/', session(USERS.employee))
    expect(await screen.findByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'My tasks' })).toBeInTheDocument()
  })

  it('keeps an employee out of the allocation grid', async () => {
    renderApp('/allocation', session(USERS.employee))
    expect(await screen.findByText(/not available for your role/i)).toBeInTheDocument()
  })

  it('opens the schedule for managers and keeps employees out, as for allocation', async () => {
    renderApp('/schedule', session(USERS.manager))
    expect(await screen.findByRole('heading', { name: 'Schedule' })).toBeInTheDocument()
    cleanup()
    renderApp('/schedule', session(USERS.employee))
    expect(await screen.findByText(/not available for your role/i)).toBeInTheDocument()
  })

  it('offers a retry at / when the session could not be checked, instead of the login page', async () => {
    renderApp('/', session(null, { status: 'unavailable', retrySession: () => {} }))
    expect(await screen.findByRole('button', { name: /retry/i })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /sign in/i })).not.toBeInTheDocument()
  })

  it('answers an unknown address with a not-found page', async () => {
    renderApp('/nowhere', session(USERS.manager))
    expect(await screen.findByText(/page not found/i)).toBeInTheDocument()
  })
})

describe('colour mode', () => {
  it('switches the whole app between light and dark from the sign-in page', async () => {
    localStorage.clear()
    render(<App />)
    await userEvent.click(await screen.findByRole('button', { name: 'Switch to dark mode' }))
    expect(getComputedStyle(document.body).backgroundColor).toBe('rgb(24, 34, 26)') // the warm dark green page
    await userEvent.click(screen.getByRole('button', { name: 'Switch to light mode' }))
    expect(getComputedStyle(document.body).backgroundColor).toBe('rgb(226, 235, 213)') // the warm matcha page, a touch greener
    expect(getComputedStyle(document.body).backgroundImage).toBe('none') // plain: no graph-paper grid
    localStorage.clear()
  })
})

describe('page loading', () => {
  function renderLazy(load) {
    const Page = lazyPage(load)
    return render(
      <ThemeProvider theme={theme}>
        <Suspense fallback={<p>wait</p>}><Page /></Suspense>
      </ThemeProvider>,
    )
  }

  it("loads a page's code on first visit and shows it", async () => {
    renderLazy(() => Promise.resolve({ default: () => <h1>Loaded</h1> }))
    expect(await screen.findByRole('heading', { name: 'Loaded' })).toBeInTheDocument()
  })

  it("shows Reload when a page's code can't be downloaded", async () => {
    renderLazy(() => Promise.reject(new Error('Failed to fetch dynamically imported module')))
    expect(await screen.findByText(/couldn't load/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument()
  })

  it('imports no signed-in page eagerly', () => {
    expect(appSource).not.toMatch(/^import \w+ from '\.\/pages\/(?!login\/)/m)
  })
})
