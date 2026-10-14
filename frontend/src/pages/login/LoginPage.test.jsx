import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route } from 'react-router'
import LoginPage from './LoginPage'
import { ApiError } from '../../services/request'
import { USERS, renderAt, session } from '../../test/utils'

const landing = [
  <Route key="dash" path="/dashboard" element={<p>dashboard page</p>} />,
  <Route key="tasks" path="/my-tasks" element={<p>my tasks page</p>} />,
  <Route key="change" path="/change-password" element={<p>change password page</p>} />,
]

function renderLogin(auth) {
  return renderAt(<LoginPage />, { path: '/login', route: '/login', auth, extraRoutes: landing })
}

async function signIn(username = 'ML662930', password = 'Demo-pass-2026') {
  await userEvent.type(screen.getByLabelText(/username/i), username)
  await userEvent.type(screen.getByLabelText(/^password/i), password)
  await userEvent.click(screen.getByRole('button', { name: /sign in/i }))
}

describe('LoginPage', () => {
  it('signs in with the username and password typed', async () => {
    const auth = session(null, { login: vi.fn().mockResolvedValue(USERS.manager) })
    renderLogin(auth)
    expect(screen.getByRole('heading', { name: /sign in/i })).toBeInTheDocument()
    await signIn()
    expect(auth.login).toHaveBeenCalledWith('ML662930', 'Demo-pass-2026')
  })

  it('takes a manager to the dashboard', async () => {
    renderLogin(session(null, { login: vi.fn().mockResolvedValue(USERS.manager) }))
    await signIn()
    expect(await screen.findByText('dashboard page')).toBeInTheDocument()
  })

  it('takes an employee to their tasks', async () => {
    renderLogin(session(null, { login: vi.fn().mockResolvedValue(USERS.employee) }))
    await signIn()
    expect(await screen.findByText('my tasks page')).toBeInTheDocument()
  })

  it('takes a first-time user to change their password', async () => {
    renderLogin(session(null, { login: vi.fn().mockResolvedValue({ ...USERS.manager, mustChangePassword: true }) }))
    await signIn()
    expect(await screen.findByText('change password page')).toBeInTheDocument()
  })

  it("shows the server's message when the password is wrong", async () => {
    const login = vi.fn().mockRejectedValue(new ApiError(401, 'Wrong username or password.'))
    renderLogin(session(null, { login }))
    await signIn('ML662930', 'nope')
    expect(await screen.findByText('Wrong username or password.')).toBeInTheDocument()
  })

  it('upper-cases the username, which is always capitals', async () => {
    const auth = session(null, { login: vi.fn().mockResolvedValue(USERS.manager) })
    renderLogin(auth)
    await signIn('ml662930')
    expect(auth.login).toHaveBeenCalledWith('ML662930', 'Demo-pass-2026')
  })

  it('says why when the session expired', () => {
    renderLogin(session(null, { sessionExpired: true }))
    expect(screen.getByText(/session expired/i)).toBeInTheDocument()
  })

  it('skips the form when already signed in', () => {
    renderLogin(session(USERS.manager))
    expect(screen.getByText('dashboard page')).toBeInTheDocument()
  })
})
