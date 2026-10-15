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

  it("marks time that takes its task past the estimate: an icon, the words, and the hours against the estimate", async () => {
    renderQueue({
      'GET /approvals/time-entries': [200, page([
        { ...ENTRY, overEstimate: true, taskEstimateMinutes: 360, taskLoggedMinutes: 540 },
        { ...ENTRY, entryId: 31, personName: 'Cara Diaz', overEstimate: false, taskEstimateMinutes: 600, taskLoggedMinutes: 480 },
      ])],
    })
    const table = await screen.findByRole('table', { name: /time waiting for approval/i })
    const marks = within(table).getAllByText('Over estimate')
    expect(marks).toHaveLength(1)
    const ben = within(table).getByText('Ben Okafor').closest('tr')
    expect(marks[0].closest('tr')).toBe(ben)
    expect(within(marks[0].closest('.MuiChip-root')).getByTestId('MoreTimeOutlinedIcon')).toBeInTheDocument()
    expect(within(ben).getByText('Task: 9 h logged of 6 h estimated')).toBeInTheDocument()
    expect(within(table).queryByText(/logged of/)).toBe(within(ben).getByText(/logged of/))
  })

  it('shows Over estimate beside Over capacity when both apply, and the mark alone when the hours are missing', async () => {
    renderQueue({ 'GET /approvals/time-entries': [200, page([{ ...ENTRY, overCapacity: true, overEstimate: true }])] })
    const table = await screen.findByRole('table', { name: /time waiting for approval/i })
    const row = within(table).getByText('Ben Okafor').closest('tr')
    expect(within(row).getByText('Over capacity')).toBeInTheDocument()
    expect(within(row).getByText('Over estimate')).toBeInTheDocument()
    expect(within(row).queryByText(/logged of/)).not.toBeInTheDocument()
  })

  it('approves an entry, which then leaves the queue', async () => {
    const calls = renderQueue()
    await screen.findByText('Ben Okafor')
    await userEvent.click(screen.getByRole('button', { name: /approve 8 h by ben okafor/i }))
    await waitFor(() => expect(calls.some((c) => c.path === '/time-entries/30/approve')).toBe(true))
    expect(await screen.findByText(/nothing waiting for approval/i)).toBeInTheDocument()
    expect(screen.queryByText(/approved 8 h by ben okafor/i)).not.toBeInTheDocument() // the Saved pop-up says it, not the page
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

  it('draws Approve filled green (the one green, not a second) and Reject filled red (spec 6.2)', async () => {
    renderQueue()
    await screen.findByText('Ben Okafor')
    const approve = screen.getByRole('button', { name: /approve 8 h by ben okafor/i })
    expect(approve).toHaveClass('MuiButton-contained', 'MuiButton-colorPrimary')
    expect(approve).not.toHaveClass('MuiButton-colorSuccess')
    const reject = screen.getByRole('button', { name: /reject 8 h by ben okafor/i })
    expect(reject).toHaveClass('MuiButton-contained', 'MuiButton-colorError')
    expect(reject).not.toHaveClass('MuiButton-outlined')
  })

  it('steps back to the last page that exists when the last entry on the last page is decided', async () => {
    let decided = false
    const calls = renderQueue({
      'GET /approvals/time-entries': ({ query }) => {
        if (decided) return [200, query.page === '2' ? page([], { page: 2, totalPages: 1 }) : page([{ ...ENTRY, entryId: 31, personName: 'Cara Diaz' }], { totalPages: 1 })]
        return [200, page([query.page === '2' ? ENTRY : { ...ENTRY, entryId: 31, personName: 'Cara Diaz' }], { page: Number(query.page), totalPages: 2 })]
      },
      'POST /time-entries/30/approve': () => { decided = true; return [200, { ...ENTRY, status: 'APPROVED' }] },
    })
    await screen.findByText('Cara Diaz')
    await userEvent.click(screen.getByRole('button', { name: /go to page 2/i }))
    await userEvent.click(await screen.findByRole('button', { name: /approve 8 h by ben okafor/i }))
    expect(await screen.findByText('Cara Diaz')).toBeInTheDocument()
    expect(screen.queryByText(/nothing waiting for approval/i)).not.toBeInTheDocument()
    expect(calls.at(-1).query.page).toBe('1')
  })

  it("shows the server's refusal in the row it belongs to, not in a page-wide alert", async () => {
    renderQueue({
      'GET /approvals/time-entries': [200, page([ENTRY, { ...ENTRY, entryId: 31, personName: 'Cara Diaz' }])],
      'POST /time-entries/30/approve': [404, { error: 'Time entry not found.' }],
    })
    await screen.findByText('Ben Okafor')
    await userEvent.click(screen.getByRole('button', { name: /approve 8 h by ben okafor/i }))
    const refusal = await screen.findByText('Time entry not found.')
    expect(refusal).toHaveAttribute('role', 'alert')
    expect(refusal.closest('tr')).toBe(screen.getByRole('button', { name: /approve 8 h by ben okafor/i }).closest('tr'))
    expect(within(screen.getByRole('button', { name: /approve 8 h by cara diaz/i }).closest('tr')).queryByRole('alert')).not.toBeInTheDocument()
    expect(refusal.closest('[role="alert"].MuiAlert-root')).toBeNull()
  })
})
