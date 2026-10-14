import { describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AccountPage from './AccountPage'
import { USERS, renderAt, session, stubApi } from '../../test/utils'

const ANA = {
  ...USERS.employee, userId: 3, username: 'AR553882', firstName: 'Ana', lastName: 'Ruiz', email: 'ana.ruiz@acme.test',
  jobTitle: 'Engineer', weeklyCapacityHours: 40, overtimeAllowed: false, annualSalaryCents: 9_000_000,
}

function renderAccount(answers = {}, auth = session(ANA, { refreshUser: vi.fn().mockResolvedValue(ANA) })) {
  const calls = stubApi(answers)
  renderAt(<AccountPage />, { path: '/account', auth })
  return { calls, auth }
}

describe('AccountPage', () => {
  it('shows my username, role, capacity and salary', () => {
    renderAccount()
    expect(screen.getByRole('heading', { name: 'My account' })).toBeInTheDocument()
    expect(screen.getByText('AR553882')).toBeInTheDocument()
    expect(screen.getByText('Employee')).toBeInTheDocument()
    expect(screen.getByText('40 h/week, no overtime')).toBeInTheDocument()
    expect(screen.getByText('$90,000')).toBeInTheDocument()
  })

  it('edits my own name and email, sending only what changed', async () => {
    const { calls, auth } = renderAccount({ 'PATCH /users/me': [200, { ...ANA, firstName: 'Anita' }] })
    await userEvent.click(screen.getByRole('button', { name: /edit my details/i }))
    const first = screen.getByLabelText(/first name/i)
    await userEvent.clear(first)
    await userEvent.type(first, 'Anita')
    await userEvent.click(screen.getByRole('button', { name: /save/i }))
    await waitFor(() => expect(calls.find((c) => c.method === 'PATCH').body).toEqual({ firstName: 'Anita' }))
    expect(auth.refreshUser).toHaveBeenCalled()
  })

  it("shows the server's error on the field it concerns", async () => {
    renderAccount({ 'PATCH /users/me': [400, { error: 'That email is already in use.', field: 'email' }] })
    await userEvent.click(screen.getByRole('button', { name: /edit my details/i }))
    const email = screen.getByLabelText(/email/i)
    await userEvent.clear(email)
    await userEvent.type(email, 'ben.okafor@acme.test')
    await userEvent.click(screen.getByRole('button', { name: /save/i }))
    expect(await screen.findByText('That email is already in use.')).toBeInTheDocument()
  })

  it('links to changing my password', () => {
    renderAccount()
    expect(screen.getByRole('link', { name: /change password/i })).toHaveAttribute('href', '/change-password')
  })

  it('explains what only an admin can change', () => {
    renderAccount()
    expect(screen.getByText(/your username never changes/i)).toBeInTheDocument()
  })
})
