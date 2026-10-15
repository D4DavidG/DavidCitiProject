import { describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ApprovalsPage from './ApprovalsPage'
import { page, renderAt, stubApi } from '../../test/utils'

const ENTRY = {
  entryId: 30, taskId: 20, projectId: 1, userId: 4, workDate: '2026-10-12', minutes: 480, note: 'Layout',
  status: 'PENDING', taskTitle: 'Portal UI', projectName: 'Apollo', personName: 'Ben Okafor',
}

function renderQueue(answers = {}) {
  let pending = [ENTRY]
  const calls = stubApi({
    'GET /approvals/time-entries': () => [200, page(pending)],
    'POST /time-entries/30/approve': () => { pending = []; return [200, { ...ENTRY, status: 'APPROVED' }] },
    'POST /time-entries/30/reject': () => { pending = []; return [200, { ...ENTRY, status: 'REJECTED' }] },
    ...answers,
  })
  renderAt(<ApprovalsPage />, { path: '/approvals' })
  return calls
}

describe('ApprovalsPage', () => {
  it('lists time waiting for approval: who, what, when and how long', async () => {
    renderQueue()
    const table = await screen.findByRole('table', { name: /time waiting for approval/i })
    expect(within(table).getByText('Ben Okafor')).toBeInTheDocument()
    expect(within(table).getByText('Portal UI')).toBeInTheDocument()
    expect(within(table).getByText('Apollo')).toBeInTheDocument()
    expect(within(table).getByText('Oct 12, 2026')).toBeInTheDocument()
    expect(within(table).getByText('8 h')).toBeInTheDocument()
  })

  it('marks time logged past capacity', async () => {
    renderQueue({ 'GET /approvals/time-entries': [200, page([{ ...ENTRY, overCapacity: true }, { ...ENTRY, entryId: 31, overCapacity: false }])] })
    const table = await screen.findByRole('table', { name: /time waiting for approval/i })
    expect(within(table).getAllByText('Over capacity')).toHaveLength(1)
  })

  it('approves an entry, which then leaves the queue', async () => {
    const calls = renderQueue()
    await screen.findByText('Ben Okafor')
    await userEvent.click(screen.getByRole('button', { name: /approve 8 h by ben okafor/i }))
    await waitFor(() => expect(calls.some((c) => c.path === '/time-entries/30/approve')).toBe(true))
    expect(await screen.findByText(/approved 8 h by ben okafor/i)).toBeInTheDocument()
    expect(await screen.findByText(/nothing waiting for approval/i)).toBeInTheDocument()
  })

  it('rejects an entry', async () => {
    const calls = renderQueue()
    await screen.findByText('Ben Okafor')
    await userEvent.click(screen.getByRole('button', { name: /reject 8 h by ben okafor/i }))
    await waitFor(() => expect(calls.some((c) => c.path === '/time-entries/30/reject')).toBe(true))
  })

  it('searches on the server and goes back to page 1', async () => {
    const calls = renderQueue({ 'GET /approvals/time-entries': [200, page([ENTRY], { totalPages: 3 })] })
    await screen.findByText('Ben Okafor')
    expect(calls[0].query.q).toBeUndefined()
    await userEvent.click(screen.getByRole('button', { name: /go to page 2/i }))
    await waitFor(() => expect(calls.at(-1).query.page).toBe('2'))
    await userEvent.type(screen.getByRole('textbox', { name: 'Search approvals' }), 'ben')
    await waitFor(() => expect(calls.at(-1).query).toMatchObject({ q: 'ben', page: '1' }))
  })

  it('says so when a search finds nothing, not that nothing is waiting', async () => {
    renderQueue({ 'GET /approvals/time-entries': ({ query }) => [200, page(query.q ? [] : [ENTRY])] })
    await screen.findByText('Ben Okafor')
    await userEvent.type(screen.getByRole('textbox', { name: 'Search approvals' }), 'zzz')
    expect(await screen.findByText(/matches your search/i)).toBeInTheDocument()
    expect(screen.queryByText(/nothing waiting for approval/i)).not.toBeInTheDocument()
  })

  it("shows the server's refusal", async () => {
    renderQueue({ 'POST /time-entries/30/approve': [404, { error: 'Time entry not found.' }] })
    await screen.findByText('Ben Okafor')
    await userEvent.click(screen.getByRole('button', { name: /approve 8 h by ben okafor/i }))
    expect(await screen.findByText('Time entry not found.')).toBeInTheDocument()
  })
})
