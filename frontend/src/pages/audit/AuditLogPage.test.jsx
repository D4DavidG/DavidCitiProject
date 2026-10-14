import { describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AuditLogPage from './AuditLogPage'
import { USERS, page, renderAt, session, stubApi } from '../../test/utils'

const EMAIL_CHANGE = {
  auditId: 91, actorUserId: 3, actorRole: 'EMPLOYEE', action: 'UPDATE', entityType: 'users', entityId: 3,
  beforeState: { userId: 3, firstName: 'Ana', email: 'ana@old.test' },
  afterState: { userId: 3, firstName: 'Ana', email: 'ana.ruiz@acme.test' },
  summary: 'Ana Ruiz changed their email', createdAt: '2026-10-14T01:03:25+00:00',
}
const CREATED = {
  auditId: 90, actorUserId: 1, actorRole: 'ADMIN', action: 'CREATE', entityType: 'projects', entityId: 1,
  beforeState: null, afterState: { projectId: 1, name: 'Apollo' }, summary: 'System Administrator created project Apollo',
  createdAt: '2026-10-13T12:00:00+00:00',
}
const ANA = { userId: 3, firstName: 'Ana', lastName: 'Ruiz', role: 'EMPLOYEE' }

function renderLog(answers = {}) {
  const calls = stubApi({
    'GET /admin/audit-log': [200, page([EMAIL_CHANGE, CREATED])],
    'GET /users': [200, page([ANA, { userId: 1, firstName: 'System', lastName: 'Administrator', role: 'ADMIN' }])],
    ...answers,
  })
  renderAt(<AuditLogPage />, { path: '/audit', auth: session(USERS.admin) })
  return calls
}

describe('AuditLogPage', () => {
  it('lists every change: when, who, what and the summary', async () => {
    renderLog()
    const table = await screen.findByRole('table', { name: /audit log/i })
    expect(within(table).getByText('Ana Ruiz changed their email')).toBeInTheDocument()
    expect(within(table).getByText('Oct 13, 2026, 9:03 PM')).toBeInTheDocument()
    expect(within(table).getByText('Ana Ruiz')).toBeInTheDocument()
    expect(within(table).getByText('Person #3')).toBeInTheDocument()
    expect(within(table).getByText('Update')).toBeInTheDocument()
  })

  it('filters by person, record type and date on the server', async () => {
    const calls = renderLog()
    await screen.findByRole('table', { name: /audit log/i })
    await userEvent.click(screen.getByLabelText(/^person/i))
    await userEvent.click(await screen.findByRole('option', { name: 'Ana Ruiz' }))
    await userEvent.click(screen.getByLabelText(/record type/i))
    await userEvent.click(await screen.findByRole('option', { name: 'Person' }))
    await userEvent.type(screen.getByLabelText(/^from/i), '2026-10-13')
    await userEvent.click(screen.getByRole('button', { name: /apply/i }))
    await waitFor(() => expect(calls.at(-1).query).toMatchObject({ actorId: '3', entityType: 'users', dateFrom: '2026-10-13' }))
  })

  it('shows only the fields that changed, before and after', async () => {
    renderLog()
    const table = await screen.findByRole('table', { name: /audit log/i })
    await userEvent.click(within(table).getAllByRole('button', { name: /show changes/i })[0])
    const changes = await screen.findByRole('table', { name: /changes in entry 91/i })
    expect(within(changes).getByText('email')).toBeInTheDocument()
    expect(within(changes).getByText('ana@old.test')).toBeInTheDocument()
    expect(within(changes).getByText('ana.ruiz@acme.test')).toBeInTheDocument()
    expect(within(changes).queryByText('firstName')).not.toBeInTheDocument()
  })

  it('shows a created record as its starting values', async () => {
    renderLog()
    const table = await screen.findByRole('table', { name: /audit log/i })
    await userEvent.click(within(table).getAllByRole('button', { name: /show changes/i })[1])
    const changes = await screen.findByRole('table', { name: /changes in entry 90/i })
    expect(within(changes).getByText('Apollo')).toBeInTheDocument()
  })
})
