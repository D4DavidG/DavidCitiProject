import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route } from 'react-router'
import ChangePasswordPage from './ChangePasswordPage'
import { USERS, holdOpen, renderAt, session, stubApi } from '../../test/utils'

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

  it('sends the current and new password, keeps the new session it gets back, then goes home', async () => {
    const answer = { token: 'new-token', refreshToken: 'new-refresh', user: USERS.manager }
    const calls = stubApi({ 'POST /auth/change-password': [200, answer] })
    const auth = session({ ...USERS.manager, mustChangePassword: true }, { startSession: vi.fn((result) => result.user) })
    renderPage(auth)
    await fill('Generated-123', 'my-new-password', 'my-new-password')
    expect(calls[0].body).toEqual({ currentPassword: 'Generated-123', newPassword: 'my-new-password' })
    expect(auth.startSession).toHaveBeenCalledWith(answer)
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

  it('puts the cursor in the field with the problem', async () => {
    stubApi({})
    renderPage()
    await fill('Generated-123', 'my-new-password', 'something-else')
    await waitFor(() => expect(screen.getByLabelText(/confirm/i)).toHaveFocus())
  })

  it('puts the cursor in the field the server named', async () => {
    stubApi({ 'POST /auth/change-password': [400, { error: 'Password must be at least 8 characters.', field: 'newPassword' }] })
    renderPage()
    await fill('Generated-123', 'short', 'short')
    await waitFor(() => expect(screen.getByLabelText(/^new password/i)).toHaveFocus())
  })

  it('shows an error with no field as one line just above the button, not at the top of the card', async () => {
    stubApi({ 'POST /auth/change-password': [503, { error: 'The database is waking up. Try again.' }] })
    renderPage()
    await fill('Generated-123', 'my-new-password', 'my-new-password')
    const message = await screen.findByText('The database is waking up. Try again.')
    const button = screen.getByRole('button', { name: /change password/i })
    const confirm = screen.getByLabelText(/confirm/i)
    expect(confirm.compareDocumentPosition(message) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(message.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(button.getAttribute('aria-describedby')).toBe(message.id)
  })

  it('shows a general error when the current password is wrong', async () => {
    stubApi({ 'POST /auth/change-password': [400, { error: 'Your current password is wrong.', field: 'currentPassword' }] })
    renderPage()
    await fill('wrong', 'my-new-password', 'my-new-password')
    expect(await screen.findByText('Your current password is wrong.')).toBeInTheDocument()
  })

  describe('while saving', () => {
    const controls = () => [
      screen.getByLabelText(/current password/i), screen.getByLabelText(/^new password/i), screen.getByLabelText(/confirm/i),
      screen.getByRole('button', { name: /^(change password|saving…)$/i }),
    ]

    it('disables every field and the button, which says it is saving', async () => {
      stubApi({ 'POST /auth/change-password': [200, USERS.manager] })
      holdOpen('/auth/change-password')
      renderPage()
      await fill('Generated-123', 'my-new-password', 'my-new-password')
      expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled()
      controls().forEach((control) => expect(control).toBeDisabled())
    })

    it('enables them again after a refusal', async () => {
      stubApi({ 'POST /auth/change-password': [400, { error: 'That password is too common.' }] })
      const release = holdOpen('/auth/change-password')
      renderPage()
      await fill('Generated-123', 'password1', 'password1')
      expect(screen.getByLabelText(/current password/i)).toBeDisabled()
      release()
      expect(await screen.findByText('That password is too common.')).toBeInTheDocument()
      controls().forEach((control) => expect(control).toBeEnabled())
    })

    it('sends once, however many times the form is submitted', async () => {
      const calls = stubApi({ 'POST /auth/change-password': [400, { error: 'That password is too common.' }] })
      const release = holdOpen('/auth/change-password')
      renderPage()
      await userEvent.type(screen.getByLabelText(/current password/i), 'Generated-123')
      await userEvent.type(screen.getByLabelText(/^new password/i), 'password1')
      await userEvent.type(screen.getByLabelText(/confirm/i), 'password1')
      const form = screen.getByLabelText(/current password/i).closest('form')
      fireEvent.submit(form)
      fireEvent.submit(form)
      release()
      await waitFor(() => expect(screen.getByLabelText(/current password/i)).toBeEnabled())
      expect(calls.filter((c) => c.path === '/auth/change-password')).toHaveLength(1)
    })
  })
})
