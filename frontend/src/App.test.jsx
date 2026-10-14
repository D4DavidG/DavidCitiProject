import { describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { ThemeProvider } from '@mui/material/styles'
import { AppRoutes } from './App'
import { AuthContext } from './auth/useAuth'
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

  it('lands employees on their tasks', async () => {
    renderApp('/', session(USERS.employee))
    expect(await screen.findByRole('heading', { name: /my tasks/i })).toBeInTheDocument()
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
