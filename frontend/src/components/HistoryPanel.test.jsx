import { describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import HistoryPanel from './HistoryPanel'
import { USERS, page, renderAt, session, stubApi } from '../test/utils'

const EDIT = {
  auditId: 12, actorUserId: 4, actorRole: 'EMPLOYEE', action: 'UPDATE', entityType: 'users', entityId: 4,
  summary: 'Ben Okafor updated their profile', createdAt: '2026-10-14T01:03:25+00:00', actorName: 'Ben Okafor',
}
const SEEDED = {
  auditId: 11, actorUserId: null, actorRole: null, action: 'RESET_PASSWORD', entityType: 'users', entityId: 4,
  summary: 'Password reset for Ben Okafor', createdAt: '2026-10-13T12:00:00+00:00', actorName: null,
}
const WITH_STATE = {
  ...EDIT, beforeState: { firstName: 'Benjamin' }, afterState: { firstName: 'Ben' },
}

function renderPanel(items = [EDIT, SEEDED], user = USERS.manager) {
  const calls = stubApi({ 'GET /users/4/history': [200, page(items)] })
  renderAt(<HistoryPanel userId={4} />, { auth: session(user) })
  return calls
}

describe('HistoryPanel', () => {
  it('lists each change with who, what and when', async () => {
    renderPanel()
    const table = await screen.findByRole('table', { name: 'History' })
    expect(within(table).getByText('Ben Okafor updated their profile')).toBeInTheDocument()
    expect(within(table).getByText('Ben Okafor')).toBeInTheDocument()
    expect(within(table).getByText('System')).toBeInTheDocument()
    expect(within(table).getByText('Reset password')).toBeInTheDocument()
    expect(within(table).getByText('Oct 13, 2026, 9:03 PM')).toBeInTheDocument()
  })

  it('offers the before/after only when the server sends it', async () => {
    renderPanel()
    await screen.findByRole('table', { name: 'History' })
    expect(screen.queryByRole('button', { name: /show changes/i })).not.toBeInTheDocument()
  })

  it('shows the changed fields when the server sends the state (admins)', async () => {
    renderPanel([WITH_STATE], USERS.admin)
    await userEvent.click(await screen.findByRole('button', { name: /show changes/i }))
    const changes = await screen.findByRole('table', { name: /changes in entry 12/i })
    expect(within(changes).getByText('firstName')).toBeInTheDocument()
    expect(within(changes).getByText('Benjamin')).toBeInTheDocument()
  })

  it('sends the filters to the server and starts again at page 1', async () => {
    const calls = stubApi({ 'GET /users/4/history': [200, page([EDIT], { totalPages: 3, total: 30 })] })
    renderAt(<HistoryPanel userId={4} />, { auth: session(USERS.manager) })
    await userEvent.click(await screen.findByRole('button', { name: 'Go to page 2' }))
    await waitFor(() => expect(calls.at(-1).query.page).toBe('2'))
    await userEvent.click(screen.getByLabelText(/^action/i))
    await userEvent.click(await screen.findByRole('option', { name: 'Update' }))
    await userEvent.type(screen.getByLabelText(/^from/i), '2026-10-01')
    await userEvent.type(screen.getByLabelText(/^to/i), '2026-10-14')
    await userEvent.click(screen.getByRole('button', { name: /apply/i }))
    await waitFor(() => expect(calls.at(-1).query).toMatchObject({
      action: 'UPDATE', dateFrom: '2026-10-01', dateTo: '2026-10-14', page: '1',
    }))
  })

  it('says so when nothing matches', async () => {
    renderPanel([])
    expect(await screen.findByText('No history matches.')).toBeInTheDocument()
  })
})
