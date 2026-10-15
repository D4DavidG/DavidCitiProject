import { describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import RequestsPage from './RequestsPage'
import { USERS, page, renderAt, session, stubApi } from '../../test/utils'

const IRIS = {
  requestId: 3, kind: 'NEW_PROJECT', requestedBy: 2, requesterName: 'Maria Lopez', name: 'Iris',
  description: 'Mobile app', justification: 'Customers asked for it', proposedStart: '2026-11-01',
  proposedEnd: '2027-02-28', projectId: null, taskLimit: null, status: 'PENDING', decidedBy: null, decidedAt: null,
  decisionNote: null, createdProjectId: null, createdAt: '2026-10-13T20:00:00+00:00',
}
const HERMES = { ...IRIS, requestId: 2, name: 'Hermes', status: 'APPROVED', createdProjectId: 3, decisionNote: 'Go ahead' }
const OVERTIME = {
  ...IRIS, requestId: 7, kind: 'OVERTIME', requestedBy: 3, requesterName: 'Ben Okafor', name: 'Allow overtime',
  description: null, justification: 'Launch week', proposedStart: null, proposedEnd: null,
}

function renderRequests(user = USERS.admin, answers = {}) {
  const calls = stubApi({
    'GET /project-requests': [200, page([IRIS, HERMES, OVERTIME])],
    'GET /projects': [200, page([{ projectId: 5, name: 'Apollo' }])],
    ...answers,
  })
  renderAt(<RequestsPage />, { path: '/requests', auth: session(user) })
  return calls
}

const table = () => screen.findByRole('table', { name: /requests/i })
const posted = (calls) => calls.find((c) => c.method === 'POST')

async function menuOf(user) {
  renderRequests(user)
  await table()
  await userEvent.click(screen.getByRole('button', { name: /new request/i }))
  return within(await screen.findByRole('menu')).getAllByRole('menuitem').map((item) => item.textContent)
}

describe('RequestsPage', () => {
  it('lists requests with their kind, who asked and the decision', async () => {
    renderRequests()
    const rows = await table()
    expect(within(rows).getByText('Iris')).toBeInTheDocument()
    expect(within(rows).getByText('Ben Okafor')).toBeInTheDocument()
    expect(within(rows).getAllByText('New project')).toHaveLength(2)
    expect(within(rows).getByRole('link', { name: /open project/i })).toHaveAttribute('href', '/projects/3')
  })

  it('filters by status and kind on the server', async () => {
    const calls = renderRequests()
    await table()
    await userEvent.click(screen.getByLabelText(/^status/i))
    await userEvent.click(await screen.findByRole('option', { name: 'Pending' }))
    await userEvent.click(screen.getByLabelText(/^kind/i))
    await userEvent.click(await screen.findByRole('option', { name: 'Allow overtime' }))
    await waitFor(() => expect(calls.at(-1).query).toMatchObject({ status: 'PENDING', kind: 'OVERTIME' }))
  })

  it("employee's New request menu offers task limit, overtime and free text only", async () => {
    expect(await menuOf(USERS.employee)).toEqual(['Raise my task limit', 'Allow overtime', 'Something else'])
  })

  it("manager's menu offers new project, archive a project and free text", async () => {
    expect(await menuOf(USERS.manager)).toEqual(['New project', 'Archive a project', 'Something else'])
  })

  it('admin has no New request button and goes straight to the requests waiting for a decision', async () => {
    const calls = renderRequests(USERS.admin)
    await table()
    expect(screen.queryByRole('button', { name: /new request/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab')).not.toBeInTheDocument() // admins send nothing, so "My requests" would always be empty
    expect(calls[0].query.scope).toBe('decide')
    expect(screen.getByRole('button', { name: /approve allow overtime/i })).toBeInTheDocument()
  })

  it('manager sees My requests and Approve or deny tabs; the second asks for scope=decide', async () => {
    const calls = renderRequests(USERS.manager)
    await table()
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['My requests', 'Approve or deny'])
    expect(screen.getByRole('tab', { name: 'My requests' })).toHaveAttribute('aria-selected', 'true')
    expect(calls.at(-1).query.scope).toBe('sent')
    expect(screen.queryByRole('button', { name: /approve/i })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('tab', { name: 'Approve or deny' }))
    await waitFor(() => expect(calls.at(-1).query.scope).toBe('decide'))
    expect(await screen.findByRole('button', { name: /approve allow overtime/i })).toBeInTheDocument()
  })

  it('employee sees only their own requests: no tabs, no Approve button, scope=sent', async () => {
    const calls = renderRequests(USERS.employee)
    await table()
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /approve/i })).not.toBeInTheDocument()
    expect(calls[0].query.scope).toBe('sent')
  })

  it('draws every button filled (spec 6.2): Approve and Open project green, Reject red', async () => {
    renderRequests()
    const rows = await table()
    const approve = within(rows).getByRole('button', { name: /approve allow overtime/i })
    expect(approve).toHaveClass('MuiButton-contained', 'MuiButton-colorPrimary')
    expect(approve).not.toHaveClass('MuiButton-colorSuccess') // the one green, never a second
    expect(within(rows).getByRole('button', { name: /reject allow overtime/i })).toHaveClass('MuiButton-contained', 'MuiButton-colorError')
    expect(within(rows).getByRole('link', { name: /open project/i })).toHaveClass('MuiButton-contained', 'MuiButton-colorPrimary')
    document.querySelectorAll('.MuiButton-root').forEach((b) => expect(b.className, b.textContent).not.toMatch(/MuiButton-(outlined|text)\b/))
  })


  it('steps back to the last page that exists when the last request on the last page is decided', async () => {
    let decided = false
    const calls = renderRequests(USERS.admin, {
      'GET /project-requests': ({ query }) => {
        const onTwo = query.page === '2'
        if (decided) return [200, onTwo ? page([], { page: 2, totalPages: 1 }) : page([IRIS], { totalPages: 1 })]
        return [200, page([onTwo ? OVERTIME : IRIS], { page: Number(query.page), totalPages: 2 })]
      },
      'POST /project-requests/7/approve': () => { decided = true; return [200, { request: { ...OVERTIME, status: 'APPROVED' }, project: null }] },
    })
    await table()
    await userEvent.click(screen.getByRole('button', { name: /go to page 2/i }))
    await userEvent.click(await screen.findByRole('button', { name: /approve allow overtime/i }))
    await userEvent.click(screen.getByRole('button', { name: /^approve$/i }))
    expect(await screen.findByText('Iris')).toBeInTheDocument()
    expect(screen.queryByText('No requests.')).not.toBeInTheDocument()
    expect(calls.at(-1).query.page).toBe('1')
  })

  describe('search', () => {
    const box = () => screen.getByRole('textbox', { name: 'Search requests' })

    it('searches the server from the box, back to page 1', async () => {
      const calls = renderRequests(USERS.employee, { 'GET /project-requests': [200, page([IRIS], { totalPages: 3 })] })
      await table()
      expect(calls[0].query.q).toBeUndefined()
      await userEvent.click(screen.getByRole('button', { name: /go to page 2/i }))
      await waitFor(() => expect(calls.at(-1).query.page).toBe('2'))
      await userEvent.type(box(), 'iris')
      await waitFor(() => expect(calls.at(-1).query).toMatchObject({ q: 'iris', scope: 'sent', page: '1' }))
    })

    it('gives each tab its own search and its own page', async () => {
      const calls = renderRequests(USERS.manager, { 'GET /project-requests': [200, page([IRIS], { totalPages: 3 })] })
      await table()
      await userEvent.type(box(), 'iris')
      await waitFor(() => expect(calls.at(-1).query).toMatchObject({ q: 'iris', scope: 'sent' }))
      await userEvent.click(screen.getByRole('button', { name: /go to page 2/i }))
      await waitFor(() => expect(calls.at(-1).query).toMatchObject({ q: 'iris', scope: 'sent', page: '2' }))

      await userEvent.click(screen.getByRole('tab', { name: 'Approve or deny' }))
      await waitFor(() => expect(calls.at(-1).query.scope).toBe('decide'))
      expect(calls.at(-1).query.q).toBeUndefined()
      expect(calls.at(-1).query.page).toBe('1')
      expect(box()).toHaveValue('')
      await userEvent.type(box(), 'ben')
      await waitFor(() => expect(calls.at(-1).query).toMatchObject({ q: 'ben', scope: 'decide', page: '1' }))

      await userEvent.click(screen.getByRole('tab', { name: 'My requests' }))
      await waitFor(() => expect(calls.at(-1).query).toMatchObject({ q: 'iris', scope: 'sent', page: '2' }))
      expect(box()).toHaveValue('iris')
    })

    it('says so when a search or filter finds nothing', async () => {
      renderRequests(USERS.employee, { 'GET /project-requests': ({ query }) => [200, page(query.q ? [] : [IRIS])] })
      await table()
      await userEvent.type(box(), 'zzz')
      expect(await screen.findByText('No requests match.')).toBeInTheDocument()
    })

    it('says "No requests." when there are none at all', async () => {
      renderRequests(USERS.employee, { 'GET /project-requests': [200, page([])] })
      expect(await screen.findByText('No requests.')).toBeInTheDocument()
    })
  })

  it('offers each tab the kinds that can be on it', async () => {
    renderRequests(USERS.manager)
    await table()
    const kinds = async () => {
      await userEvent.click(screen.getByLabelText(/^kind/i))
      const names = within(await screen.findByRole('listbox')).getAllByRole('option').map((o) => o.textContent)
      await userEvent.keyboard('{Escape}')
      return names
    }
    expect(await kinds()).toEqual(['All kinds', 'New project', 'Archive a project', 'Something else']) // what a manager sends
    await userEvent.click(screen.getByRole('tab', { name: 'Approve or deny' }))
    await waitFor(() => expect(screen.getByRole('button', { name: /approve allow overtime/i })).toBeInTheDocument())
    expect(await kinds()).toEqual(['All kinds', 'Raise my task limit', 'Allow overtime', 'Something else']) // what employees send
  })

  it('asking for a task limit sends kind and taskLimit', async () => {
    const calls = renderRequests(USERS.employee, { 'POST /project-requests': [201, OVERTIME] })
    await table()
    await userEvent.click(screen.getByRole('button', { name: /new request/i }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Raise my task limit' }))
    await userEvent.type(screen.getByLabelText(/new limit/i), '4')
    await userEvent.type(screen.getByLabelText(/why/i), 'Two small tasks at once')
    await userEvent.click(screen.getByRole('button', { name: /send request/i }))
    await waitFor(() => expect(posted(calls).body).toEqual({ kind: 'TASK_LIMIT', taskLimit: 4, justification: 'Two small tasks at once' }))
    expect(await screen.findByText(/your line manager will answer/i)).toBeInTheDocument()
  })

  it('says "Request sent" as a status line next to the New request button, not in a page-wide alert', async () => {
    renderRequests(USERS.employee, { 'POST /project-requests': [201, OVERTIME] })
    await table()
    await userEvent.click(screen.getByRole('button', { name: /new request/i }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Allow overtime' }))
    await userEvent.type(screen.getByLabelText(/why/i), 'Launch week')
    await userEvent.click(screen.getByRole('button', { name: /send request/i }))
    const message = await screen.findByText(/your line manager will answer/i)
    expect(message).toHaveAttribute('role', 'status')
    expect(message.parentElement).toBe(screen.getByRole('button', { name: /new request/i }).parentElement)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('asking to archive a project offers your projects', async () => {
    const calls = renderRequests(USERS.manager, { 'POST /project-requests': [201, IRIS] })
    await table()
    await userEvent.click(screen.getByRole('button', { name: /new request/i }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Archive a project' }))
    await userEvent.click(await screen.findByLabelText(/^project/i))
    await userEvent.click(await screen.findByRole('option', { name: 'Apollo' }))
    await userEvent.type(screen.getByLabelText(/why/i), 'Finished')
    await userEvent.click(screen.getByRole('button', { name: /send request/i }))
    await waitFor(() => expect(posted(calls).body).toEqual({ kind: 'ARCHIVE_PROJECT', projectId: 5, justification: 'Finished' }))
  })

  it('approving an overtime request sends only the note and says what it does', async () => {
    const calls = renderRequests(USERS.admin, { 'POST /project-requests/7/approve': [200, { request: { ...OVERTIME, status: 'APPROVED' }, project: null }] })
    const rows = await table()
    await userEvent.click(within(rows).getByRole('button', { name: /approve allow overtime/i }))
    expect(screen.getByText('This turns overtime on for Ben Okafor.')).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText(/note/i), 'Fine for launch week')
    await userEvent.click(screen.getByRole('button', { name: /^approve$/i }))
    await waitFor(() => expect(posted(calls)).toMatchObject({ path: '/project-requests/7/approve', body: { decisionNote: 'Fine for launch week' } }))
  })

  it('approving a new project fills in the proposed dates and takes a budget', async () => {
    const calls = renderRequests(USERS.admin, { 'POST /project-requests/3/approve': [200, { request: { ...IRIS, status: 'APPROVED' }, project: { projectId: 9 } }] })
    const rows = await table()
    await userEvent.click(within(rows).getByRole('button', { name: /approve iris/i }))
    expect(screen.getByLabelText(/start date/i)).toHaveValue('2026-11-01')
    await userEvent.type(screen.getByLabelText(/budget/i), '60,000')
    await userEvent.click(screen.getByRole('button', { name: /approve and create/i }))
    await waitFor(() => expect(posted(calls).body).toEqual({
      startDate: '2026-11-01', predictedEndDate: '2027-02-28', budgetCents: 6_000_000,
    }))
  })

  it('loads the list again, once, after a decision and after a send', async () => {
    const calls = renderRequests(USERS.admin, { 'POST /project-requests/3/reject': [200, { ...IRIS, status: 'REJECTED' }] })
    const listLoads = () => calls.filter((c) => c.method === 'GET' && c.path === '/project-requests').length
    const rows = await table()
    expect(listLoads()).toBe(1)
    await userEvent.click(within(rows).getByRole('button', { name: /reject iris/i }))
    await userEvent.click(screen.getByRole('button', { name: /^reject$/i }))
    await waitFor(() => expect(listLoads()).toBe(2))
    expect(screen.queryByText(/^Rejected: Iris/)).not.toBeInTheDocument() // the Saved pop-up says it, and the row shows the status
  })

  it('rejecting sends the note', async () => {
    const calls = renderRequests(USERS.admin, { 'POST /project-requests/3/reject': [200, { ...IRIS, status: 'REJECTED' }] })
    const rows = await table()
    await userEvent.click(within(rows).getByRole('button', { name: /reject iris/i }))
    await userEvent.type(screen.getByLabelText(/note/i), 'Not this quarter')
    await userEvent.click(screen.getByRole('button', { name: /^reject$/i }))
    await waitFor(() => expect(posted(calls).body).toEqual({ decisionNote: 'Not this quarter' }))
  })
})
