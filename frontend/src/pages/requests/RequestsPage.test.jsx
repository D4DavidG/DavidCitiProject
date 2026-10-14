import { describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import RequestsPage from './RequestsPage'
import { USERS, page, renderAt, session, stubApi } from '../../test/utils'

const IRIS = {
  requestId: 3, requestedBy: 2, name: 'Iris', description: 'Mobile app', justification: 'Customers asked for it',
  proposedStart: '2026-11-01', proposedEnd: '2027-02-28', status: 'PENDING', decidedBy: null, decidedAt: null,
  decisionNote: null, createdProjectId: null, createdAt: '2026-10-13T20:00:00+00:00',
}
const HERMES = { ...IRIS, requestId: 2, name: 'Hermes', status: 'APPROVED', createdProjectId: 3, decisionNote: 'Go ahead' }
const MARIA = { userId: 2, firstName: 'Maria', lastName: 'Lopez', role: 'MANAGER' }

function renderRequests(user = USERS.admin, answers = {}) {
  const calls = stubApi({
    'GET /project-requests': [200, page([IRIS, HERMES])],
    'GET /users': [200, page([MARIA])],
    ...answers,
  })
  renderAt(<RequestsPage />, { path: '/requests', auth: session(user) })
  return calls
}

describe('RequestsPage', () => {
  it('lists requests with who asked, the proposed dates and the decision', async () => {
    renderRequests()
    const table = await screen.findByRole('table', { name: /project requests/i })
    expect(within(table).getByText('Iris')).toBeInTheDocument()
    expect(within(table).getAllByText('Maria Lopez').length).toBeGreaterThan(0)
    expect(within(table).getAllByText('Nov 1, 2026 – Feb 28, 2027')).toHaveLength(2)
    expect(within(table).getByText('Pending')).toBeInTheDocument()
    expect(within(table).getByRole('link', { name: /open project/i })).toHaveAttribute('href', '/projects/3')
  })

  it('filters by status on the server', async () => {
    const calls = renderRequests()
    await screen.findByRole('table', { name: /project requests/i })
    await userEvent.click(screen.getByLabelText(/^status/i))
    await userEvent.click(await screen.findByRole('option', { name: 'Pending' }))
    await waitFor(() => expect(calls.at(-1).query.status).toBe('PENDING'))
  })

  it('lets a manager file a request', async () => {
    const calls = renderRequests(USERS.manager, { 'POST /project-requests': [201, IRIS] })
    await screen.findByRole('table', { name: /project requests/i })
    await userEvent.click(screen.getByRole('button', { name: /new request/i }))
    await userEvent.type(screen.getByLabelText(/^name/i), 'Iris')
    await userEvent.type(screen.getByLabelText(/why/i), 'Customers asked for it')
    await userEvent.click(screen.getByRole('button', { name: /send request/i }))
    await waitFor(() => expect(calls.find((c) => c.method === 'POST').body).toEqual({ name: 'Iris', justification: 'Customers asked for it' }))
  })

  it('lets an admin approve, with the proposed dates filled in and a budget', async () => {
    const calls = renderRequests(USERS.admin, { 'POST /project-requests/3/approve': [200, { request: { ...IRIS, status: 'APPROVED' }, project: { projectId: 9 } }] })
    const table = await screen.findByRole('table', { name: /project requests/i })
    await userEvent.click(within(table).getByRole('button', { name: /approve iris/i }))
    expect(screen.getByLabelText(/start date/i)).toHaveValue('2026-11-01')
    await userEvent.type(screen.getByLabelText(/budget/i), '60,000')
    await userEvent.click(screen.getByRole('button', { name: /approve and create/i }))
    await waitFor(() => expect(calls.find((c) => c.method === 'POST').body).toEqual({
      startDate: '2026-11-01', predictedEndDate: '2027-02-28', budgetCents: 6_000_000,
    }))
  })

  it('lets an admin reject, with a note', async () => {
    const calls = renderRequests(USERS.admin, { 'POST /project-requests/3/reject': [200, { ...IRIS, status: 'REJECTED' }] })
    const table = await screen.findByRole('table', { name: /project requests/i })
    await userEvent.click(within(table).getByRole('button', { name: /reject iris/i }))
    await userEvent.type(screen.getByLabelText(/note/i), 'Not this quarter')
    await userEvent.click(screen.getByRole('button', { name: /^reject$/i }))
    await waitFor(() => expect(calls.find((c) => c.method === 'POST').body).toEqual({ decisionNote: 'Not this quarter' }))
  })

  it('gives managers no approve or reject buttons', async () => {
    renderRequests(USERS.manager)
    const table = await screen.findByRole('table', { name: /project requests/i })
    expect(within(table).queryByRole('button', { name: /approve/i })).not.toBeInTheDocument()
  })
})
