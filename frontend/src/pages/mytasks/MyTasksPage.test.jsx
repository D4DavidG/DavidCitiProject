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
const APOLLO = {
  projectId: 1, name: 'Apollo', status: 'ACTIVE', startDate: '2026-10-01', endDate: '2026-12-31', atRisk: false,
  deliverables: [], bookings: [{ userId: 3, name: 'Ben Okafor', startDate: '2026-10-05', endDate: '2026-11-29', hoursPerWeek: 20 }],
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
    'GET /dashboard/timeline': [200, page([APOLLO])],
    ...answers,
  })
  renderAt(<MyTasksPage />, { path: '/my-tasks', auth: session(USERS.employee) })
  return calls
}

/** My logged time is folded away by default: open it to see the table. */
async function openLoggedTime() {
  await userEvent.click(await screen.findByRole('button', { name: /^My logged time/ }))
  return screen.findByRole('table', { name: /my logged time/i })
}

describe('MyTasksPage', () => {
  it('is the employee\'s Dashboard: My projects, My tasks, Ready to take, then My logged time', async () => {
    renderPage()
    expect(await screen.findByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument()
    await screen.findByRole('link', { name: 'Apollo' }) // the timeline has loaded
    await screen.findByRole('button', { name: 'My logged time (1 entry)' })
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent))
      .toEqual(['My projects', 'My tasks', 'Ready to take', 'My logged time (1 entry)'])
  })

  it('draws all four section titles at the same size', async () => {
    renderPage()
    await screen.findByRole('link', { name: 'Apollo' })
    await screen.findByRole('button', { name: /^My logged time \(/ })
    screen.getAllByRole('heading', { level: 2 }).forEach((h) => {
      const title = h.classList.contains('MuiTypography-h2') ? h : h.querySelector('.MuiTypography-h2')
      expect(title, h.textContent).not.toBeNull()
    })
  })

  it('shows my projects as a timeline, from GET /dashboard/timeline', async () => {
    const calls = renderPage()
    const section = await screen.findByRole('region', { name: 'My projects' })
    expect(await within(section).findByRole('link', { name: 'Apollo' })).toHaveAttribute('href', '/projects/1')
    expect(calls.some((c) => c.path === '/dashboard/timeline')).toBe(true)
  })

  it('searches my tasks on the server as I type', async () => {
    const calls = renderPage()
    await screen.findByRole('article', { name: 'Portal UI' })
    await userEvent.type(screen.getByRole('textbox', { name: 'Search my tasks' }), 'portal')
    await waitFor(() => expect(calls.filter((c) => c.path === '/me/tasks').at(-1).query.q).toBe('portal'))
    expect(calls.filter((c) => c.path === '/me/tasks')[0].query.q).toBeUndefined() // the first load asks for everything
  })

  it('says so when no task matches the search', async () => {
    renderPage({ 'GET /me/tasks': ({ query }) => [200, page(query.q ? [] : [PORTAL])] })
    await screen.findByRole('article', { name: 'Portal UI' })
    await userEvent.type(screen.getByRole('textbox', { name: 'Search my tasks' }), 'zzz{Enter}')
    expect(await screen.findByText('No tasks match your search.')).toBeInTheDocument()
  })

  it('searches Ready tasks on the server as I type', async () => {
    const calls = renderPage({ 'GET /me/ready-tasks': [200, page([GO_LIVE], { held: 1, limit: 2 })] })
    await screen.findByRole('article', { name: 'Go-live checklist' })
    await userEvent.type(screen.getByRole('textbox', { name: 'Search ready tasks' }), 'launch')
    await waitFor(() => expect(calls.filter((c) => c.path === '/me/ready-tasks').at(-1).query.q).toBe('launch'))
    expect(calls.filter((c) => c.path === '/me/tasks')).toHaveLength(1) // the other list is left alone
  })

  it('says so when no Ready task matches the search', async () => {
    renderPage({ 'GET /me/ready-tasks': ({ query }) => [200, page(query.q ? [] : [GO_LIVE], { held: 1, limit: 2 })] })
    await screen.findByRole('article', { name: 'Go-live checklist' })
    await userEvent.type(screen.getByRole('textbox', { name: 'Search ready tasks' }), 'zzz{Enter}')
    expect(await screen.findByText('No Ready tasks match your search.')).toBeInTheDocument()
  })

  it('gives the opened logged time one id, so the accordion region and its content never share it', async () => {
    renderPage()
    await openLoggedTime()
    expect(document.querySelectorAll('[id="logged-time-details"]')).toHaveLength(1)
    expect(screen.getByRole('region', { name: /^My logged time/ })).toHaveAttribute('id', 'logged-time-details')
  })

  it('keeps my logged time folded away, with the count in its title, until I open it', async () => {
    renderPage({ 'GET /me/time-entries': [200, page([ENTRY], { total: 12, totalPages: 2 })] })
    const summary = await screen.findByRole('button', { name: 'My logged time (12 entries)' })
    expect(summary).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('table', { name: /my logged time/i })).not.toBeInTheDocument()
    await userEvent.click(summary)
    expect(summary).toHaveAttribute('aria-expanded', 'true')
    expect(await screen.findByRole('table', { name: /my logged time/i })).toBeInTheDocument()
  })

  it('lists my open tasks with their project and deliverable', async () => {
    renderPage()
    const task = await screen.findByRole('article', { name: 'Portal UI' })
    expect(within(task).getByText('Apollo · Build')).toBeInTheDocument()
    expect(within(task).getByText('Estimate 10 h')).toBeInTheDocument()
  })

  it('gives Log time, Take this and Edit the outlined look of every secondary button', async () => {
    renderPage({ 'GET /me/ready-tasks': [200, page([GO_LIVE], { held: 1, limit: 2 })] })
    const task = await screen.findByRole('article', { name: 'Portal UI' })
    expect(within(task).getByRole('button', { name: 'Log time' })).toHaveClass('MuiButton-outlined')
    const ready = await screen.findByRole('article', { name: 'Go-live checklist' })
    expect(within(ready).getByRole('button', { name: 'Take this' })).toHaveClass('MuiButton-outlined')
    const table = await openLoggedTime()
    expect(within(table).getByRole('button', { name: 'Edit' })).toHaveClass('MuiButton-outlined')
  })

  it('redraws my projects timeline after a task moves, since a deliverable may change state', async () => {
    const calls = renderPage({ 'POST /tasks/20/status': [200, { ...PORTAL, status: 'DONE' }] })
    const task = await screen.findByRole('article', { name: 'Portal UI' })
    await screen.findByRole('link', { name: 'Apollo' })
    expect(calls.filter((c) => c.path === '/dashboard/timeline')).toHaveLength(1)
    await userEvent.click(within(task).getByLabelText(/status/i))
    await userEvent.click(await screen.findByRole('option', { name: 'Done' }))
    await waitFor(() => expect(calls.filter((c) => c.path === '/dashboard/timeline')).toHaveLength(2))
  })

  it('leaves the timeline alone when a move is refused', async () => {
    const calls = renderPage({ 'POST /tasks/20/status': [409, { error: 'Only the assignee can move this task.' }] })
    const task = await screen.findByRole('article', { name: 'Portal UI' })
    await screen.findByRole('link', { name: 'Apollo' })
    await userEvent.click(within(task).getByLabelText(/status/i))
    await userEvent.click(await screen.findByRole('option', { name: 'Done' }))
    await within(task).findByText('Only the assignee can move this task.')
    expect(calls.filter((c) => c.path === '/dashboard/timeline')).toHaveLength(1)
  })

  it('moves a task to done', async () => {
    const calls = renderPage({ 'POST /tasks/20/status': [200, { ...PORTAL, status: 'DONE' }] })
    const task = await screen.findByRole('article', { name: 'Portal UI' })
    await userEvent.click(within(task).getByLabelText(/status/i))
    await userEvent.click(await screen.findByRole('option', { name: 'Done' }))
    await waitFor(() => expect(calls.find((c) => c.method === 'POST').body).toEqual({ status: 'DONE' }))
  })

  it('disables the card while its status change is saving, and enables it after', async () => {
    renderPage({ 'POST /tasks/20/status': [200, { ...PORTAL, status: 'DONE' }] })
    const release = holdOpen('/tasks/20/status')
    const task = await screen.findByRole('article', { name: 'Portal UI' })
    await userEvent.click(within(task).getByLabelText(/status/i))
    await userEvent.click(await screen.findByRole('option', { name: 'Done' }))
    const status = within(task).getByRole('combobox', { name: /status/i })
    await waitFor(() => expect(status).toHaveAttribute('aria-disabled', 'true'))
    expect(within(task).getByRole('button', { name: /log time/i })).toBeDisabled()
    release()
    await waitFor(() => expect(status).not.toHaveAttribute('aria-disabled'))
    expect(within(task).getByRole('button', { name: /log time/i })).toBeEnabled()
  })

  it('enables the card again when a status change is refused, and says why', async () => {
    renderPage({ 'POST /tasks/20/status': [409, { error: 'Only the assignee can move this task.' }] })
    const release = holdOpen('/tasks/20/status')
    const task = await screen.findByRole('article', { name: 'Portal UI' })
    await userEvent.click(within(task).getByLabelText(/status/i))
    await userEvent.click(await screen.findByRole('option', { name: 'Done' }))
    await waitFor(() => expect(within(task).getByRole('button', { name: /log time/i })).toBeDisabled())
    release()
    expect(await within(task).findByText('Only the assignee can move this task.')).toBeInTheDocument() // on the card I used
    expect(within(task).getByRole('combobox', { name: /status/i })).not.toHaveAttribute('aria-disabled')
    expect(within(task).getByRole('button', { name: /log time/i })).toBeEnabled()
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
    // News (it waits for approval), so it gets a line, on the card I logged from, not at the top of the page.
    const task = screen.getByRole('article', { name: 'Portal UI' })
    expect(await within(task).findByRole('status')).toHaveTextContent("Logged 2 h on Portal UI. It's waiting for approval.")
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
    const table = await openLoggedTime()
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
    const table = await openLoggedTime()
    expect(within(table).getAllByText('Over capacity')).toHaveLength(1)
  })

  it('refuses more than 24 h before sending anything, and keeps the dialog open', async () => {
    const calls = renderPage()
    const task = await screen.findByRole('article', { name: 'Portal UI' })
    await userEvent.click(within(task).getByRole('button', { name: /log time/i }))
    await userEvent.type(screen.getByLabelText('Hours'), '24')
    await userEvent.type(screen.getByLabelText('Minutes'), '30')
    await userEvent.click(screen.getByRole('button', { name: /^log$/i }))
    expect(screen.getByLabelText('Hours')).toHaveAccessibleDescription('One entry can hold at most 24 h.')
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
    await waitFor(() => expect(calls.filter((c) => c.path === '/me/ready-tasks').length).toBe(2))
    expect(calls.filter((c) => c.path === '/me/tasks').length).toBe(2)
    // A task on a new project puts that project on my timeline.
    await waitFor(() => expect(calls.filter((c) => c.path === '/dashboard/timeline')).toHaveLength(2))
  })

  it('confirms a take with the one Saved pop-up, so the page adds no success line of its own', async () => {
    const calls = renderPage({
      'GET /me/ready-tasks': [200, page([GO_LIVE], { held: 1, limit: 2 })],
      'POST /tasks/30/claim': [200, { ...GO_LIVE, assigneeUserId: 3, status: 'IN_PROGRESS' }],
    })
    await userEvent.click(within(await screen.findByRole('article', { name: 'Go-live checklist' })).getByRole('button', { name: 'Take this' }))
    await waitFor(() => expect(calls.filter((c) => c.path === '/me/ready-tasks').length).toBe(2))
    expect(screen.queryByText(/You took/)).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
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
    await waitFor(() => expect(calls.filter((c) => c.path === '/me/tasks').length).toBe(2))
    watch.disconnect()
    expect(unmounted).toBe(false)
  })

  it('sends one claim when Take this is pressed twice', async () => {
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
    await waitFor(() => expect(button).toBeEnabled())
    expect(calls.filter((c) => c.method === 'POST' && c.path === '/tasks/30/claim')).toHaveLength(1)
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
    // My tasks reloads alongside Ready to take, so once it has asked, the claim has answered.
    await waitFor(() => expect(calls.filter((c) => c.path === '/me/tasks')).toHaveLength(2))
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
    // In the Ready to take section, by the cards, so it stays even if the reload removes the card.
    const section = screen.getByRole('region', { name: 'Ready to take' })
    expect(await within(section).findByRole('alert')).toHaveTextContent(refusal)
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
