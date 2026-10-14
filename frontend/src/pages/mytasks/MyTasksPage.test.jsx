import { describe, expect, it } from 'vitest'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MyTasksPage from './MyTasksPage'
import { USERS, holdOpen, page, renderAt, session, stubApi } from '../../test/utils'

const PORTAL = {
  taskId: 20, milestoneId: 11, projectId: 1, title: 'Portal UI', description: 'Screens for the portal',
  assigneeUserId: 4, status: 'IN_PROGRESS', estimateMinutes: 600, projectName: 'Apollo', milestoneName: 'Build',
}
const GO_LIVE = {
  taskId: 30, milestoneId: 12, projectId: 1, title: 'Go-live checklist', description: null,
  assigneeUserId: null, status: 'TODO', estimateMinutes: 480, projectName: 'Apollo', milestoneName: 'Launch',
}
const ENTRY = {
  entryId: 30, taskId: 20, projectId: 1, userId: 4, workDate: '2026-10-12', minutes: 480, note: 'Layout',
  status: 'PENDING', taskTitle: 'Portal UI', projectName: 'Apollo',
}

function renderPage(answers = {}) {
  const calls = stubApi({
    'GET /me/tasks': [200, page([PORTAL])],
    'GET /me/time-entries': [200, page([ENTRY])],
    'GET /me/ready-tasks': [200, page([], { held: 1, limit: 2 })],
    ...answers,
  })
  renderAt(<MyTasksPage />, { path: '/my-tasks', auth: session(USERS.employee) })
  return calls
}

describe('MyTasksPage', () => {
  it('lists my open tasks with their project and deliverable', async () => {
    renderPage()
    const task = await screen.findByRole('article', { name: 'Portal UI' })
    expect(within(task).getByText('Apollo · Build')).toBeInTheDocument()
    expect(within(task).getByText('Estimate 10 h')).toBeInTheDocument()
  })

  it('moves a task to done', async () => {
    const calls = renderPage({ 'POST /tasks/20/status': [200, { ...PORTAL, status: 'DONE' }] })
    const task = await screen.findByRole('article', { name: 'Portal UI' })
    await userEvent.click(within(task).getByLabelText(/status/i))
    await userEvent.click(await screen.findByRole('option', { name: 'Done' }))
    await waitFor(() => expect(calls.find((c) => c.method === 'POST').body).toEqual({ status: 'DONE' }))
  })

  it('logs time, with the date defaulting to today', async () => {
    const calls = renderPage({ 'POST /tasks/20/time-entries': [201, ENTRY] })
    const task = await screen.findByRole('article', { name: 'Portal UI' })
    await userEvent.click(within(task).getByRole('button', { name: /log time/i }))
    const date = screen.getByLabelText(/^date/i)
    expect(date.value).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    await userEvent.clear(date)
    await userEvent.type(date, '2026-10-13')
    const time = screen.getByRole('group', { name: /^time/i })
    await userEvent.type(within(time).getByLabelText('Hours'), '2')
    await userEvent.type(within(time).getByLabelText('Minutes'), '30')
    await userEvent.type(screen.getByLabelText(/note/i), 'Forms')
    await userEvent.click(screen.getByRole('button', { name: /^log$/i }))
    await waitFor(() => expect(calls.find((c) => c.method === 'POST').body).toEqual({ workDate: '2026-10-13', minutes: 150, note: 'Forms' }))
  })

  it('shows other refusals in the form as before', async () => {
    renderPage({ 'POST /tasks/20/time-entries': [409, { error: "You weren't booked on this project on that date." }] })
    const task = await screen.findByRole('article', { name: 'Portal UI' })
    await userEvent.click(within(task).getByRole('button', { name: /log time/i }))
    await userEvent.type(screen.getByLabelText('Hours'), '2')
    await userEvent.click(screen.getByRole('button', { name: /^log$/i }))
    expect(await within(screen.getByRole('dialog')).findByText(/weren't booked/i)).toBeInTheDocument()
  })

  const OVER = "This puts you 2 h over your 40 h week. Log anyway? Your manager will be told."

  /** Answers 409 OVER_CAPACITY until the body says confirmOverCapacity. */
  function overUnlessConfirmed(call) {
    return call.body.confirmOverCapacity ? [201, { ...ENTRY, minutes: 120, overCapacity: true }] : [409, { error: OVER, code: 'OVER_CAPACITY' }]
  }

  async function logTwoHours() {
    const task = await screen.findByRole('article', { name: 'Portal UI' })
    await userEvent.click(within(task).getByRole('button', { name: /log time/i }))
    const date = screen.getByLabelText(/^date/i)
    await userEvent.clear(date)
    await userEvent.type(date, '2026-10-13')
    await userEvent.type(screen.getByLabelText('Hours'), '2')
    await userEvent.click(screen.getByRole('button', { name: /^log$/i }))
    return screen.findByRole('dialog', { name: 'Over your weekly capacity' })
  }

  it('asks before logging past capacity, then logs with confirmOverCapacity', async () => {
    const calls = renderPage({ 'POST /tasks/20/time-entries': overUnlessConfirmed })
    const confirm = await logTwoHours()
    expect(within(confirm).getByText(OVER)).toBeInTheDocument()
    await userEvent.click(within(confirm).getByRole('button', { name: 'Log anyway' }))
    await waitFor(() => expect(calls.filter((c) => c.method === 'POST')).toHaveLength(2))
    expect(calls.filter((c) => c.method === 'POST')[1].body).toEqual({ workDate: '2026-10-13', minutes: 120, confirmOverCapacity: true })
    expect(await screen.findByText(/Logged 2 h on Portal UI/)).toBeInTheDocument()
  })

  it('sends nothing more when the person cancels', async () => {
    const calls = renderPage({ 'POST /tasks/20/time-entries': overUnlessConfirmed })
    const confirm = await logTwoHours()
    await userEvent.click(within(confirm).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(1)
  })

  it('lists my logged time with its approval status, and edits it', async () => {
    const calls = renderPage({ 'PATCH /time-entries/30': [200, { ...ENTRY, minutes: 420 }] })
    const table = await screen.findByRole('table', { name: /my logged time/i })
    expect(within(table).getByText('Portal UI')).toBeInTheDocument()
    expect(within(table).getByText('8 h')).toBeInTheDocument()
    expect(within(table).getByText('Pending')).toBeInTheDocument()
    await userEvent.click(within(table).getByRole('button', { name: /edit/i }))
    const hours = screen.getByLabelText('Hours')
    expect(hours).toHaveValue('8')
    expect(screen.getByLabelText('Minutes')).toHaveValue('0')
    await userEvent.clear(hours)
    await userEvent.type(hours, '7')
    await userEvent.click(screen.getByRole('button', { name: /save/i }))
    await waitFor(() => expect(calls.find((c) => c.method === 'PATCH').body).toEqual({ minutes: 420 }))
  })

  it('marks my time logged past capacity', async () => {
    renderPage({ 'GET /me/time-entries': [200, page([{ ...ENTRY, overCapacity: true }, { ...ENTRY, entryId: 31, overCapacity: false }])] })
    const table = await screen.findByRole('table', { name: /my logged time/i })
    expect(within(table).getAllByText('Over capacity')).toHaveLength(1)
  })

  it('refuses more than 24 h before sending anything, and keeps the dialog open', async () => {
    const calls = renderPage()
    const task = await screen.findByRole('article', { name: 'Portal UI' })
    await userEvent.click(within(task).getByRole('button', { name: /log time/i }))
    await userEvent.type(screen.getByLabelText('Hours'), '24')
    await userEvent.type(screen.getByLabelText('Minutes'), '30')
    await userEvent.click(screen.getByRole('button', { name: /^log$/i }))
    expect(screen.getByLabelText('Hours')).toHaveAccessibleDescription('That is more than 24 h.')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(calls.some((c) => c.method === 'POST')).toBe(false)
  })

  it('offers Ready tasks to take, and says how many I hold', async () => {
    const calls = renderPage({
      'GET /me/ready-tasks': [200, page([GO_LIVE], { held: 1, limit: 2 })],
      'POST /tasks/30/claim': [200, { ...GO_LIVE, assigneeUserId: 3, status: 'IN_PROGRESS' }],
    })
    expect(await screen.findByRole('heading', { name: 'Ready to take' })).toBeInTheDocument()
    expect(screen.getByText('You hold 1 of 2')).toBeInTheDocument()
    const card = screen.getByRole('article', { name: 'Go-live checklist' })
    expect(within(card).getByText('Apollo · Launch')).toBeInTheDocument()
    expect(within(card).getByText('Estimate 8 h')).toBeInTheDocument()
    await userEvent.click(within(card).getByRole('button', { name: 'Take this' }))
    await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.path === '/tasks/30/claim')).toBe(true))
    expect(await screen.findByText('You took Go-live checklist.')).toBeInTheDocument()
    await waitFor(() => expect(calls.filter((c) => c.path === '/me/ready-tasks').length).toBe(2))
    expect(calls.filter((c) => c.path === '/me/tasks').length).toBe(2)
  })

  it('keeps the other Ready cards on screen while the lists reload after Take this', async () => {
    const OTHER = { ...GO_LIVE, taskId: 31, title: 'Write runbook' }
    const calls = renderPage({
      'GET /me/ready-tasks': [200, page([GO_LIVE, OTHER], { held: 1, limit: 3 })],
      'POST /tasks/30/claim': [200, { ...GO_LIVE, assigneeUserId: 3, status: 'IN_PROGRESS' }],
    })
    const other = await screen.findByRole('article', { name: 'Write runbook' })
    let unmounted = false
    const watch = new MutationObserver(() => { if (!other.isConnected) unmounted = true })
    watch.observe(document.body, { childList: true, subtree: true })
    await userEvent.click(within(await screen.findByRole('article', { name: 'Go-live checklist' })).getByRole('button', { name: 'Take this' }))
    await waitFor(() => expect(calls.filter((c) => c.path === '/me/ready-tasks').length).toBe(2))
    await screen.findByText('You took Go-live checklist.')
    watch.disconnect()
    expect(unmounted).toBe(false)
  })

  it('sends one claim when Take this is pressed twice, and keeps the success message', async () => {
    const calls = renderPage({
      'GET /me/ready-tasks': [200, page([GO_LIVE], { held: 1, limit: 2 })],
      'POST /tasks/30/claim': [200, { ...GO_LIVE, assigneeUserId: 3, status: 'IN_PROGRESS' }],
    })
    const release = holdOpen('/tasks/30/claim')
    const button = within(await screen.findByRole('article', { name: 'Go-live checklist' })).getByRole('button', { name: 'Take this' })
    fireEvent.click(button)
    fireEvent.click(button)
    expect(button).toBeDisabled()
    release()
    expect(await screen.findByText('You took Go-live checklist.')).toBeInTheDocument()
    expect(calls.filter((c) => c.method === 'POST' && c.path === '/tasks/30/claim')).toHaveLength(1)
    await waitFor(() => expect(button).toBeEnabled())
  })

  it('keeps Take this disabled until the lists have reloaded after the claim', async () => {
    const calls = renderPage({
      'GET /me/ready-tasks': [200, page([GO_LIVE], { held: 1, limit: 2 })],
      'POST /tasks/30/claim': [200, { ...GO_LIVE, assigneeUserId: 3, status: 'IN_PROGRESS' }],
    })
    const releaseClaim = holdOpen('/tasks/30/claim')
    const button = within(await screen.findByRole('article', { name: 'Go-live checklist' })).getByRole('button', { name: 'Take this' })
    fireEvent.click(button)
    releaseClaim()
    const releaseReload = holdOpen('/me/ready-tasks')
    await screen.findByText('You took Go-live checklist.')
    expect(calls.filter((c) => c.path === '/me/ready-tasks')).toHaveLength(1)
    expect(button).toBeDisabled()
    releaseReload()
    await waitFor(() => expect(calls.filter((c) => c.path === '/me/ready-tasks')).toHaveLength(2))
    await waitFor(() => expect(button).toBeEnabled())
  })

  it("shows the server's refusal when I'm at my limit", async () => {
    const refusal = 'You already hold 2 unfinished tasks, your limit. Finish one first, or ask your manager to raise it.'
    renderPage({
      'GET /me/ready-tasks': [200, page([GO_LIVE], { held: 2, limit: 2 })],
      'POST /tasks/30/claim': [409, { error: refusal }],
    })
    const card = await screen.findByRole('article', { name: 'Go-live checklist' })
    await userEvent.click(within(card).getByRole('button', { name: 'Take this' }))
    expect(await screen.findByText(refusal)).toBeInTheDocument()
  })

  it('says so when no Ready tasks are waiting', async () => {
    renderPage()
    expect(await screen.findByText('No Ready tasks on your projects right now.')).toBeInTheDocument()
  })

  it('says so when there is nothing to do', async () => {
    renderPage({ 'GET /me/tasks': [200, page([])], 'GET /me/time-entries': [200, page([])] })
    expect(await screen.findByText(/no open tasks/i)).toBeInTheDocument()
  })
})
