import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
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

  it('makes both boxes glow red, with the message under the password box, and puts the cursor back in the username', async () => {
    const login = vi.fn().mockRejectedValue(new ApiError(401, 'Wrong username or password.'))
    renderLogin(session(null, { login }))
    await signIn('ML662930', 'nope')
    const message = await screen.findByText('Wrong username or password.')
    const username = screen.getByLabelText(/username/i)
    const password = screen.getByLabelText(/^password/i)
    for (const box of [username, password]) {
      expect(box).toHaveAttribute('aria-invalid', 'true')
      expect(box.getAttribute('aria-describedby')).toBe(message.id) // a screen reader hears why on either box
    }
    expect(message.closest('.MuiFormControl-root')).toBe(password.closest('.MuiFormControl-root'))
    expect(screen.queryByRole('alert')).toBeNull() // no message box at the top of the card
    await waitFor(() => expect(username).toHaveFocus())
  })

  it.each([
    ['the server cannot be reached', new ApiError(0, "Couldn't reach the server. Check your connection and try again.")],
    ['the database is still waking up', new ApiError(503, 'The service is starting up. Try again in a moment.')],
  ])('when %s, says so above the Sign in button and leaves both boxes unmarked', async (_, failure) => {
    renderLogin(session(null, { login: vi.fn().mockRejectedValue(failure) }))
    await signIn()
    const message = await screen.findByRole('alert')
    expect(message).toHaveTextContent(failure.message)
    const button = screen.getByRole('button', { name: 'Sign in' })
    expect(button).toHaveAttribute('aria-describedby', message.id)
    expect(message.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy() // just above it
    for (const box of [screen.getByLabelText(/username/i), screen.getByLabelText(/^password/i)]) {
      expect(box).not.toHaveAttribute('aria-invalid', 'true') // the details weren't wrong
    }
    await waitFor(() => expect(button).toHaveFocus()) // Enter tries again
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

  describe('while signing in', () => {
    /** A login the test finishes by hand, like a request held open. */
    function heldLogin() {
      let fail
      const login = vi.fn(() => new Promise((_, reject) => { fail = reject }))
      return { login, fail: (error) => fail(error) }
    }
    const controls = () => [
      screen.getByLabelText(/username/i), screen.getByLabelText(/^password/i), screen.getByRole('button', { name: /sign(ing)? in/i }),
    ]

    it('disables both fields and the button, which says it is signing in', async () => {
      renderLogin(session(null, { login: heldLogin().login }))
      await signIn()
      expect(screen.getByRole('button', { name: 'Signing in…' })).toBeDisabled()
      controls().forEach((control) => expect(control).toBeDisabled())
    })

    it('enables them again after a refusal, so the password can be retyped', async () => {
      const held = heldLogin()
      renderLogin(session(null, { login: held.login }))
      await signIn('ML662930', 'nope')
      held.fail(new ApiError(401, 'Wrong username or password.'))
      expect(await screen.findByText('Wrong username or password.')).toBeInTheDocument()
      controls().forEach((control) => expect(control).toBeEnabled())
    })

    it('sends one login, however many times the form is submitted', async () => {
      const held = heldLogin()
      renderLogin(session(null, { login: held.login }))
      await userEvent.type(screen.getByLabelText(/username/i), 'ML662930')
      await userEvent.type(screen.getByLabelText(/^password/i), 'Demo-pass-2026')
      const form = screen.getByLabelText(/username/i).closest('form')
      fireEvent.submit(form)
      fireEvent.submit(form)
      expect(held.login).toHaveBeenCalledTimes(1)
      held.fail(new ApiError(401, 'Wrong username or password.'))
      await waitFor(() => expect(screen.getByLabelText(/username/i)).toBeEnabled())
    })
  })
})
