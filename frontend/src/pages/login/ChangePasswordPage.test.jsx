import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route } from 'react-router'
import ChangePasswordPage from './ChangePasswordPage'
import { USERS, renderAt, session, stubApi } from '../../test/utils'

const landing = [<Route key="dash" path="/dashboard" element={<p>dashboard page</p>} />]

function renderPage(auth = session({ ...USERS.manager, mustChangePassword: true })) {
  return renderAt(<ChangePasswordPage />, { path: '/change-password', route: '/change-password', auth, extraRoutes: landing })
}

async function fill(current, next, confirm) {
  await userEvent.type(screen.getByLabelText(/current password/i), current)
  await userEvent.type(screen.getByLabelText(/^new password/i), next)
  await userEvent.type(screen.getByLabelText(/confirm/i), confirm)
  await userEvent.click(screen.getByRole('button', { name: /change password/i }))
}

describe('ChangePasswordPage', () => {
  it('explains why a first-time user is here', () => {
    stubApi({})
    renderPage()
    expect(screen.getByText(/choose your own password/i)).toBeInTheDocument()
  })

  it('sends the current and new password, then goes home', async () => {
    const calls = stubApi({ 'POST /auth/change-password': [200, USERS.manager] })
    const auth = session({ ...USERS.manager, mustChangePassword: true }, { refreshUser: vi.fn().mockResolvedValue(USERS.manager) })
    renderPage(auth)
    await fill('Generated-123', 'my-new-password', 'my-new-password')
    expect(calls[0].body).toEqual({ currentPassword: 'Generated-123', newPassword: 'my-new-password' })
    expect(auth.refreshUser).toHaveBeenCalled()
    expect(await screen.findByText('dashboard page')).toBeInTheDocument()
  })

  it('refuses a confirmation that does not match, without calling the server', async () => {
    const calls = stubApi({})
    renderPage()
    await fill('Generated-123', 'my-new-password', 'something-else')
    expect(screen.getByText(/passwords don't match/i)).toBeInTheDocument()
    expect(calls).toHaveLength(0)
  })

  it("shows the server's field error on that field", async () => {
    stubApi({ 'POST /auth/change-password': [400, { error: 'Password must be at least 8 characters.', field: 'newPassword' }] })
    renderPage()
    await fill('Generated-123', 'short', 'short')
    const input = screen.getByLabelText(/^new password/i)
    expect(await screen.findByText('Password must be at least 8 characters.')).toBeInTheDocument()
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input.getAttribute('aria-describedby')).toBeTruthy()
  })

  it('shows a general error when the current password is wrong', async () => {
    stubApi({ 'POST /auth/change-password': [400, { error: 'Your current password is wrong.', field: 'currentPassword' }] })
    renderPage()
    await fill('wrong', 'my-new-password', 'my-new-password')
    expect(await screen.findByText('Your current password is wrong.')).toBeInTheDocument()
  })
})
