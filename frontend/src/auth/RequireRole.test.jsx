import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route } from 'react-router'
import RequireRole from './RequireRole'
import { USERS, renderAt, session } from '../test/utils'

const landing = [
  <Route key="login" path="/login" element={<p>login page</p>} />,
  <Route key="change" path="/change-password" element={<p>change password page</p>} />,
]

function renderGuarded(auth, roles) {
  return renderAt(
    <RequireRole roles={roles}><p>secret dashboard</p></RequireRole>,
    { path: '/dashboard', route: '/dashboard', auth, extraRoutes: landing },
  )
}

describe('RequireRole', () => {
  it('shows the page to an allowed role', () => {
    renderGuarded(session(USERS.manager), ['ADMIN', 'MANAGER'])
    expect(screen.getByText('secret dashboard')).toBeInTheDocument()
  })

  it('tells a role that is not allowed, instead of crashing', () => {
    renderGuarded(session(USERS.employee), ['ADMIN', 'MANAGER'])
    expect(screen.queryByText('secret dashboard')).not.toBeInTheDocument()
    expect(screen.getByText(/not available for your role/i)).toBeInTheDocument()
  })

  it('allows any signed-in role when no roles are given', () => {
    renderGuarded(session(USERS.employee), undefined)
    expect(screen.getByText('secret dashboard')).toBeInTheDocument()
  })

  it('sends a signed-out visitor to the login page', () => {
    renderGuarded(session(null), ['ADMIN'])
    expect(screen.getByText('login page')).toBeInTheDocument()
  })

  it('sends someone who must change their password to that page first', () => {
    renderGuarded(session({ ...USERS.manager, mustChangePassword: true }), ['MANAGER'])
    expect(screen.getByText('change password page')).toBeInTheDocument()
  })

  it('offers a retry when the session could not be checked, without signing out', async () => {
    const retrySession = vi.fn()
    renderGuarded(session(null, { status: 'unavailable', retrySession }), ['MANAGER'])
    expect(screen.queryByText('login page')).not.toBeInTheDocument()
    expect(screen.getByText(/can't reach the server/i)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /retry/i }))
    expect(retrySession).toHaveBeenCalled()
  })

  it('shows a loading state while the session is being checked', () => {
    renderGuarded(session(null, { status: 'loading' }), ['MANAGER'])
    expect(screen.getByRole('progressbar')).toBeInTheDocument()
  })
})
