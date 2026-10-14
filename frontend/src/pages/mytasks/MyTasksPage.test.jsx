import { describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MyTasksPage from './MyTasksPage'
import { USERS, page, renderAt, session, stubApi } from '../../test/utils'

const PORTAL = {
  taskId: 20, milestoneId: 11, projectId: 1, title: 'Portal UI', description: 'Screens for the portal',
  assigneeUserId: 4, status: 'IN_PROGRESS', estimateMinutes: 600, projectName: 'Apollo', milestoneName: 'Build',
}
const ENTRY = {
  entryId: 30, taskId: 20, projectId: 1, userId: 4, workDate: '2026-10-12', minutes: 480, note: 'Layout',
  status: 'PENDING', taskTitle: 'Portal UI', projectName: 'Apollo',
}

function renderPage(answers = {}) {
  const calls = stubApi({
    'GET /me/tasks': [200, page([PORTAL])],
    'GET /me/time-entries': [200, page([ENTRY])],
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
    await userEvent.type(screen.getByLabelText(/time \(hours\)/i), '2.5')
    await userEvent.type(screen.getByLabelText(/note/i), 'Forms')
    await userEvent.click(screen.getByRole('button', { name: /^log$/i }))
    await waitFor(() => expect(calls.find((c) => c.method === 'POST').body).toEqual({ workDate: '2026-10-13', minutes: 150, note: 'Forms' }))
  })

  it("shows the server's capacity refusal in the dialog", async () => {
    renderPage({ 'POST /tasks/20/time-entries': [409, { error: 'That would take you to 42 h in the week of 2026-10-12, past your capacity of 40 h. Ask your manager to allow overtime.' }] })
    const task = await screen.findByRole('article', { name: 'Portal UI' })
    await userEvent.click(within(task).getByRole('button', { name: /log time/i }))
    await userEvent.type(screen.getByLabelText(/time \(hours\)/i), '2')
    await userEvent.click(screen.getByRole('button', { name: /^log$/i }))
    expect(await within(screen.getByRole('dialog')).findByText(/past your capacity of 40 h/i)).toBeInTheDocument()
  })

  it('lists my logged time with its approval status, and edits it', async () => {
    const calls = renderPage({ 'PATCH /time-entries/30': [200, { ...ENTRY, minutes: 420 }] })
    const table = await screen.findByRole('table', { name: /my logged time/i })
    expect(within(table).getByText('Portal UI')).toBeInTheDocument()
    expect(within(table).getByText('8 h')).toBeInTheDocument()
    expect(within(table).getByText('Pending')).toBeInTheDocument()
    await userEvent.click(within(table).getByRole('button', { name: /edit/i }))
    const hours = screen.getByLabelText(/time \(hours\)/i)
    await userEvent.clear(hours)
    await userEvent.type(hours, '7')
    await userEvent.click(screen.getByRole('button', { name: /save/i }))
    await waitFor(() => expect(calls.find((c) => c.method === 'PATCH').body).toEqual({ minutes: 420 }))
  })

  it('says so when there is nothing to do', async () => {
    renderPage({ 'GET /me/tasks': [200, page([])], 'GET /me/time-entries': [200, page([])] })
    expect(await screen.findByText(/no open tasks/i)).toBeInTheDocument()
  })
})
