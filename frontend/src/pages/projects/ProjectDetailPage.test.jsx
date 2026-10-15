import { describe, expect, it } from 'vitest'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ProjectDetailPage from './ProjectDetailPage'
import { APOLLO, BOARD_PEOPLE, BOARD_TASKS, BOOKINGS, BUDGET, BUILD, BUILD_TASKS, DESIGN, MARIA } from './fixtures'
import { USERS, holdOpen, page, renderAt, session, stubApi } from '../../test/utils'

const BOARD = page(BOARD_TASKS, { people: BOARD_PEOPLE })

function renderDetail(user = USERS.manager, answers = {}) {
  const calls = stubApi({
    'GET /projects/1': [200, APOLLO],
    'GET /users/2': [200, MARIA],
    'GET /projects/1/assignments': [200, page(BOOKINGS)],
    'GET /projects/1/dependency-graph': [200, { nodes: [DESIGN, BUILD], edges: [{ from: 11, to: 10 }] }],
    'GET /milestones/11/tasks': [200, page(BUILD_TASKS)],
    'GET /milestones/10/tasks': [200, page([])],
    'GET /projects/1/budget': [200, BUDGET],
    'GET /users': [200, page([])],
    ...answers,
  })
  renderAt(<ProjectDetailPage />, { path: '/projects/1', route: '/projects/:id', auth: session(user) })
  return calls
}

describe('ProjectDetailPage', () => {
  it('shows the project with its status, manager and dates', async () => {
    renderDetail()
    expect(await screen.findByRole('heading', { name: 'Apollo' })).toBeInTheDocument()
    expect(screen.getByText('Customer portal rebuild')).toBeInTheDocument()
    expect(await screen.findByText(/Maria Lopez/)).toBeInTheDocument()
  })

  it('has Deliverables, Resources, Budget and Board tabs, and a link to the dependency view', async () => {
    renderDetail()
    await screen.findByRole('heading', { name: 'Apollo' })
    for (const name of ['Deliverables', 'Resources', 'Budget', 'Board']) {
      expect(screen.getByRole('tab', { name })).toBeInTheDocument()
    }
    expect(screen.getByRole('link', { name: /dependency view/i })).toHaveAttribute('href', '/projects/1/dependencies')
  })

  it('shows each deliverable with status, progress and due date, and its tasks on demand', async () => {
    renderDetail()
    const build = await screen.findByRole('region', { name: 'Build' })
    expect(within(build).getByText('In progress')).toBeInTheDocument()
    expect(within(build).getByText('0% of estimated hours · 0 of 2 tasks done')).toBeInTheDocument()
    expect(within(build).getByText(/due nov 12, 2026/i)).toBeInTheDocument()
    await userEvent.click(within(build).getByRole('button', { name: /show tasks/i }))
    expect(await within(build).findByText('Portal UI')).toBeInTheDocument()
    expect(within(build).getByText('Ben Okafor')).toBeInTheDocument()
  })

  it("shows the server's refusal when a sign-off is refused", async () => {
    const ready = { ...BUILD, status: 'IN_PROGRESS', doneTaskCount: 2, progressPercent: 100 }
    renderDetail(USERS.manager, {
      'GET /projects/1/dependency-graph': [200, { nodes: [ready], edges: [] }],
      'POST /milestones/11/sign-off': [409, { error: 'Design must be signed off first.' }],
    })
    const build = await screen.findByRole('region', { name: 'Build' })
    await userEvent.click(within(build).getByRole('button', { name: /sign off/i }))
    expect(await screen.findByText('Design must be signed off first.')).toBeInTheDocument()
  })

  it('sends one sign-off however often it is pressed, and disables the card\'s buttons until the answer', async () => {
    const ready = { ...BUILD, status: 'IN_PROGRESS', doneTaskCount: 2, progressPercent: 100 }
    const calls = renderDetail(USERS.manager, {
      'GET /projects/1/dependency-graph': [200, { nodes: [ready], edges: [] }],
      'POST /milestones/11/sign-off': [409, { error: 'Design must be signed off first.' }],
    })
    const release = holdOpen('/milestones/11/sign-off')
    const build = await screen.findByRole('region', { name: 'Build' })
    const signOff = within(build).getByRole('button', { name: /sign off/i })
    fireEvent.click(signOff)
    fireEvent.click(signOff)
    for (const name of [/sign off/i, /^edit$/i, /^archive$/i]) {
      expect(within(build).getByRole('button', { name })).toBeDisabled()
    }
    release()
    expect(await screen.findByText('Design must be signed off first.')).toBeInTheDocument()
    expect(calls.filter((c) => c.path === '/milestones/11/sign-off')).toHaveLength(1)
    for (const name of [/sign off/i, /^edit$/i, /^archive$/i]) {
      expect(within(build).getByRole('button', { name })).toBeEnabled()
    }
  })

  it('adds a deliverable', async () => {
    const calls = renderDetail(USERS.manager, { 'POST /projects/1/milestones': [201, { ...BUILD, milestoneId: 12, name: 'Launch' }] })
    await screen.findByRole('region', { name: 'Build' })
    await userEvent.click(screen.getByRole('button', { name: /new deliverable/i }))
    await userEvent.type(screen.getByLabelText(/^name/i), 'Launch')
    await userEvent.type(screen.getByLabelText(/start date/i), '2026-11-13')
    await userEvent.type(screen.getByLabelText(/due date/i), '2026-12-12')
    await userEvent.click(screen.getByRole('button', { name: /create/i }))
    await waitFor(() => expect(calls.find((c) => c.method === 'POST').body).toEqual({ name: 'Launch', startDate: '2026-11-13', dueDate: '2026-12-12' }))
  })

  it('lists who is booked, and books someone', async () => {
    const calls = renderDetail(USERS.manager, {
      'GET /users': [200, page([{ userId: 5, firstName: 'Chloe', lastName: 'Kim', role: 'EMPLOYEE' }])],
      'POST /projects/1/assignments': [201, { ...BOOKINGS[0], assignmentId: 9, userId: 5, personName: 'Chloe Kim' }],
    })
    await screen.findByRole('heading', { name: 'Apollo' })
    await userEvent.click(screen.getByRole('tab', { name: 'Resources' }))
    expect(await screen.findByText('Ana Ruiz')).toBeInTheDocument()
    expect(screen.getByText('30 h/week')).toBeInTheDocument()
    expect(screen.getByText(/past someone's weekly capacity is allowed/i)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /book someone/i }))
    await userEvent.click(screen.getByLabelText(/person/i))
    await userEvent.click(await screen.findByRole('option', { name: 'Chloe Kim' }))
    await userEvent.type(screen.getByLabelText(/hours per week/i), '10')
    await userEvent.type(screen.getByLabelText(/start date/i), '2026-10-15')
    await userEvent.type(screen.getByLabelText(/end date/i), '2026-12-31')
    await userEvent.click(screen.getByRole('button', { name: /^book$/i }))
    await waitFor(() => expect(calls.find((c) => c.method === 'POST').body).toEqual({ userId: 5, hoursPerWeek: 10, startDate: '2026-10-15', endDate: '2026-12-31' }))
  })

  it('shows the budget figures', async () => {
    renderDetail()
    await screen.findByRole('heading', { name: 'Apollo' })
    await userEvent.click(screen.getByRole('tab', { name: 'Budget' }))
    expect(await screen.findByText('$1,370 spent of $150,000')).toBeInTheDocument()
    expect(screen.getByText('$148,630')).toBeInTheDocument()
    expect(screen.getByText('<1%')).toBeInTheDocument() // $1,370 of $150,000 is spent, so not "0%"
  })

  it('says what the project percentage is measured in', async () => {
    renderDetail()
    expect(await screen.findByText('12% of estimated hours done')).toBeInTheDocument()
  })

  it('offers sign-off only when the work is done, and says why not otherwise', async () => {
    // A deliverable reads DONE only once signed off; "ready" is all tasks done and not blocked.
    const launchReady = { ...BUILD, milestoneId: 12, name: 'Launch', status: 'IN_PROGRESS', doneTaskCount: 2, progressPercent: 100 }
    const testsBlocked = { ...BUILD, milestoneId: 13, name: 'Tests', status: 'BLOCKED', taskCount: 1, doneTaskCount: 1 }
    renderDetail(USERS.manager, { 'GET /projects/1/dependency-graph': [200, { nodes: [DESIGN, BUILD, launchReady, testsBlocked], edges: [] }] })
    const build = await screen.findByRole('region', { name: 'Build' })
    expect(within(build).getByRole('button', { name: /sign off/i })).toBeDisabled()
    expect(within(build).getByText(/2 tasks left to finish/i)).toBeInTheDocument()
    const tests = screen.getByRole('region', { name: 'Tests' })
    expect(within(tests).getByRole('button', { name: /sign off/i })).toBeDisabled()
    expect(within(tests).getByText(/waiting for what it depends on/i)).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Launch' })).getByRole('button', { name: /sign off/i })).toBeEnabled()
  })

  it('gives both reasons when a deliverable has open tasks and is waiting on another', async () => {
    const launch = { ...BUILD, milestoneId: 12, name: 'Launch', status: 'BLOCKED', taskCount: 1, doneTaskCount: 0 }
    renderDetail(USERS.manager, { 'GET /projects/1/dependency-graph': [200, { nodes: [DESIGN, BUILD, launch], edges: [] }] })
    const card = await screen.findByRole('region', { name: 'Launch' })
    expect(within(card).getByText(/1 task left to finish and waiting for what it depends on/i)).toBeInTheDocument()
  })

  it('draws the deliverables timeline above the cards, from the one dependency-graph request', async () => {
    const calls = renderDetail()
    const chart = await screen.findByRole('figure', { name: 'Deliverables timeline' })
    expect(chart.compareDocumentPosition(screen.getByRole('region', { name: 'Build' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(calls.some((c) => c.path === '/projects/1/milestones' && c.method === 'GET')).toBe(false)
  })

  it('shows no chart when there are no deliverables', async () => {
    renderDetail(USERS.manager, { 'GET /projects/1/dependency-graph': [200, { nodes: [], edges: [] }] })
    expect(await screen.findByText('No deliverables yet.')).toBeInTheDocument()
    expect(screen.queryByRole('figure')).toBeNull()
  })

  it('writes "1 task", not "1 tasks"', async () => {
    renderDetail()
    const design = await screen.findByRole('region', { name: 'Design' })
    expect(within(design).getByText(/1 of 1 task done/)).toBeInTheDocument()
  })

  it('archives only after confirming, and never says "delete"', async () => {
    const calls = renderDetail(USERS.admin, { 'POST /projects/1/archive': [200, { ...APOLLO, isArchived: true }] })
    await screen.findByRole('heading', { name: 'Apollo' })
    expect(screen.queryByText(/delete/i)).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /^archive project$/i }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/can be reactivated/i)).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: /archive project/i }))
    await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.path === '/projects/1/archive')).toBe(true))
  })

  it('adds a task to a deliverable, assigned to someone booked on the project', async () => {
    const calls = renderDetail(USERS.manager, { 'POST /milestones/11/tasks': [201, { ...BUILD_TASKS[0], taskId: 22, title: 'Docs' }] })
    const build = await screen.findByRole('region', { name: 'Build' })
    await userEvent.click(within(build).getByRole('button', { name: /show tasks/i }))
    await userEvent.click(await within(build).findByRole('button', { name: /add task/i }))
    await userEvent.type(screen.getByLabelText(/^title/i), 'Docs')
    const estimate = screen.getByRole('group', { name: /^estimate/i })
    await userEvent.type(within(estimate).getByLabelText('Hours'), '3')
    await userEvent.click(screen.getByLabelText(/assignee/i))
    await userEvent.click(await screen.findByRole('option', { name: 'Ana Ruiz' }))
    await userEvent.click(screen.getByRole('button', { name: /create/i }))
    await waitFor(() => expect(calls.find((c) => c.method === 'POST').body).toEqual({ title: 'Docs', estimateMinutes: 180, assigneeUserId: 3 }))
  })

  it('tells the manager an empty assignee puts the task on the board as Ready', async () => {
    renderDetail(USERS.manager)
    const build = await screen.findByRole('region', { name: 'Build' })
    await userEvent.click(within(build).getByRole('button', { name: /show tasks/i }))
    await userEvent.click(await within(build).findByRole('button', { name: /add task/i }))
    expect(screen.getByText('Leave empty to put it on the board as Ready')).toBeInTheDocument()
    expect(screen.queryByText('Only people booked on this project can be assigned.')).not.toBeInTheDocument()
  })

  it("edits a task's estimate", async () => {
    const calls = renderDetail(USERS.manager, { 'PATCH /tasks/20': [200, BUILD_TASKS[0]] })
    const build = await screen.findByRole('region', { name: 'Build' })
    await userEvent.click(within(build).getByRole('button', { name: /show tasks/i }))
    await within(build).findByText('Portal UI')
    await userEvent.click(within(build).getAllByRole('button', { name: /^edit$/i })[0])
    const estimate = screen.getByRole('group', { name: /^estimate/i })
    const hours = within(estimate).getByLabelText('Hours')
    await userEvent.clear(hours)
    await userEvent.type(hours, '12')
    await userEvent.click(screen.getByRole('button', { name: /save/i }))
    await waitFor(() => expect(calls.find((c) => c.method === 'PATCH').body).toEqual({ estimateMinutes: 720 }))
  })

  it('reopens a signed-off deliverable', async () => {
    const calls = renderDetail(USERS.manager, { 'POST /milestones/10/reopen': [200, { ...DESIGN, completedAt: null }] })
    const design = await screen.findByRole('region', { name: 'Design' })
    expect(within(design).getByText('Signed off')).toBeInTheDocument()
    await userEvent.click(within(design).getByRole('button', { name: /reopen/i }))
    await waitFor(() => expect(calls.some((c) => c.path === '/milestones/10/reopen')).toBe(true))
  })

  it('archives a deliverable after confirming', async () => {
    const calls = renderDetail(USERS.manager, { 'POST /milestones/11/archive': [200, BUILD] })
    const build = await screen.findByRole('region', { name: 'Build' })
    await userEvent.click(within(build).getByRole('button', { name: /^archive$/i }))
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /archive deliverable/i }))
    await waitFor(() => expect(calls.some((c) => c.path === '/milestones/11/archive')).toBe(true))
  })

  it("changes a booking's hours, and archives a booking", async () => {
    const calls = renderDetail(USERS.manager, {
      'PATCH /assignments/7': [200, { ...BOOKINGS[0], hoursPerWeek: 35 }],
      'POST /assignments/8/archive': [200, BOOKINGS[1]],
    })
    await screen.findByRole('heading', { name: 'Apollo' })
    await userEvent.click(screen.getByRole('tab', { name: 'Resources' }))
    const table = await screen.findByRole('table', { name: /people booked/i })
    await userEvent.click(within(table).getAllByRole('button', { name: /^edit$/i })[0])
    const hours = screen.getByLabelText(/hours per week/i)
    await userEvent.clear(hours)
    await userEvent.type(hours, '35')
    await userEvent.click(screen.getByRole('button', { name: /save/i }))
    await waitFor(() => expect(calls.find((c) => c.method === 'PATCH').body).toEqual({ hoursPerWeek: 35 }))
    await userEvent.click(within(table).getAllByRole('button', { name: /^archive$/i })[1])
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /archive booking/i }))
    await waitFor(() => expect(calls.some((c) => c.path === '/assignments/8/archive')).toBe(true))
  })

  it("lets the project's manager change the budget, sending only that", async () => {
    const calls = renderDetail(USERS.manager, { 'PATCH /projects/1': [200, { ...APOLLO, budgetCents: 20_000_000 }] })
    await screen.findByRole('heading', { name: 'Apollo' })
    await userEvent.click(screen.getByRole('button', { name: /^edit project$/i }))
    const budget = screen.getByLabelText(/budget/i)
    expect(budget).toHaveValue('150000')
    await userEvent.clear(budget)
    await userEvent.type(budget, '200,000')
    await userEvent.click(screen.getByRole('button', { name: /save/i }))
    await waitFor(() => expect(calls.find((c) => c.method === 'PATCH').body).toEqual({ budgetCents: 20_000_000 }))
  })

  it('gives employees a read-only view without the budget', async () => {
    renderDetail(USERS.employee)
    await screen.findByRole('heading', { name: 'Apollo' })
    expect(screen.queryByRole('tab', { name: 'Budget' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /edit/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /new deliverable/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /sign off/i })).not.toBeInTheDocument()
  })

  it('answers a project that is not yours the same as a missing one', async () => {
    renderDetail(USERS.manager, { 'GET /projects/1': [404, { error: 'Project not found.' }] })
    expect(await screen.findByText('Project not found.')).toBeInTheDocument()
  })
  describe('Board tab', () => {
    const openBoard = async () => userEvent.click(await screen.findByRole('tab', { name: 'Board' }))
    const boardCalls = (calls) => calls.filter((c) => c.method === 'GET' && c.path === '/projects/1/board')

    it('has a Board tab with Ready, To do, In progress and Done columns', async () => {
      renderDetail(USERS.manager, { 'GET /projects/1/board': [200, BOARD] })
      await openBoard()
      for (const [column, title] of [['Ready', 'Go-live checklist'], ['To do', 'Portal UI'], ['In progress', 'Portal API'], ['Done', 'Wireframes']]) {
        expect(within(await screen.findByRole('region', { name: column })).getByRole('article', { name: title })).toBeInTheDocument()
      }
      expect(screen.getByText('Ana Ruiz 1 / 2')).toBeInTheDocument()
      expect(within(screen.getByRole('article', { name: 'Portal UI' })).getByText('Build · 40 h')).toBeInTheDocument()
    })

    it('names the holder strip as a group so a screen reader announces it', async () => {
      renderDetail(USERS.manager, { 'GET /projects/1/board': [200, BOARD] })
      await openBoard()
      const strip = await screen.findByRole('group', { name: 'Who holds what' })
      expect(within(strip).getByText('Ana Ruiz 1 / 2')).toBeInTheDocument()
    })

    it('flags anyone holding more than their limit', async () => {
      const people = [BOARD_PEOPLE[0], { userId: 4, name: 'Ben Okafor', held: 3, limit: 2 }]
      renderDetail(USERS.manager, { 'GET /projects/1/board': [200, page(BOARD_TASKS, { people })] })
      await openBoard()
      expect(await screen.findByText('Ben Okafor 3 / 2, over limit')).toBeInTheDocument()
    })

    it('lets an employee take a Ready task and put back their own', async () => {
      const calls = renderDetail(USERS.employee, {
        'GET /projects/1/board': [200, BOARD],
        'POST /tasks/30/claim': [200, {}],
        'POST /tasks/32/release': [200, {}],
      })
      await openBoard()
      const ready = await screen.findByRole('article', { name: 'Go-live checklist' })
      expect(screen.queryByRole('button', { name: 'Assign' })).not.toBeInTheDocument()
      expect(within(screen.getByRole('article', { name: 'Portal UI' })).queryByRole('button')).not.toBeInTheDocument()
      await userEvent.click(within(ready).getByRole('button', { name: 'Take this' }))
      await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.path === '/tasks/30/claim')).toBe(true))
      await userEvent.click(within(screen.getByRole('article', { name: 'Portal API' })).getByRole('button', { name: 'Put back' }))
      await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.path === '/tasks/32/release')).toBe(true))
      await waitFor(() => expect(boardCalls(calls)).toHaveLength(3))
    })

    it("shows the server's refusal at the limit", async () => {
      const refusal = 'You already hold 2 unfinished tasks, your limit. Finish one first, or ask your manager to raise it.'
      renderDetail(USERS.employee, {
        'GET /projects/1/board': [200, BOARD],
        'POST /tasks/30/claim': [409, { error: refusal }],
      })
      await openBoard()
      await userEvent.click(within(await screen.findByRole('article', { name: 'Go-live checklist' })).getByRole('button', { name: 'Take this' }))
      expect(await screen.findByText(refusal)).toBeInTheDocument()
    })

    it('lets the manager assign every card outside Done', async () => {
      const calls = renderDetail(USERS.manager, {
        'GET /projects/1/board': [200, BOARD],
        'PATCH /tasks/30': [200, {}],
      })
      await openBoard()
      await screen.findByRole('article', { name: 'Go-live checklist' })
      expect(screen.getAllByRole('button', { name: 'Assign' })).toHaveLength(3)
      expect(within(screen.getByRole('region', { name: 'Done' })).queryByRole('button', { name: 'Assign' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Take this' })).not.toBeInTheDocument()
      await userEvent.click(within(screen.getByRole('article', { name: 'Go-live checklist' })).getByRole('button', { name: 'Assign' }))
      const dialog = screen.getByRole('dialog')
      await userEvent.click(within(dialog).getByRole('combobox', { name: 'Assignee' }))
      await userEvent.click(await screen.findByRole('option', { name: 'Ben Okafor' }))
      await userEvent.click(within(dialog).getByRole('button', { name: 'Assign' }))
      await waitFor(() => expect(calls.find((c) => c.method === 'PATCH' && c.path === '/tasks/30').body).toEqual({ assigneeUserId: 4 }))
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      await waitFor(() => expect(boardCalls(calls)).toHaveLength(2))
    })

    it('sends one claim when Take this is pressed twice, and shows no error', async () => {
      const calls = renderDetail(USERS.employee, {
        'GET /projects/1/board': [200, BOARD],
        'POST /tasks/30/claim': [200, {}],
      })
      await openBoard()
      const release = holdOpen('/tasks/30/claim')
      const button = within(await screen.findByRole('article', { name: 'Go-live checklist' })).getByRole('button', { name: 'Take this' })
      fireEvent.click(button)
      fireEvent.click(button)
      expect(button).toBeDisabled()
      release()
      await waitFor(() => expect(boardCalls(calls)).toHaveLength(2))
      expect(calls.filter((c) => c.method === 'POST' && c.path === '/tasks/30/claim')).toHaveLength(1)
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('keeps Take this disabled until the reload after the claim has finished', async () => {
      const calls = renderDetail(USERS.employee, {
        'GET /projects/1/board': [200, BOARD],
        'POST /tasks/30/claim': [200, {}],
      })
      await openBoard()
      const releaseClaim = holdOpen('/tasks/30/claim')
      const button = within(await screen.findByRole('article', { name: 'Go-live checklist' })).getByRole('button', { name: 'Take this' })
      fireEvent.click(button)
      const releaseReload = holdOpen('/projects/1/board')
      releaseClaim()
      await waitFor(() => expect(calls.filter((c) => c.method === 'POST' && c.path === '/tasks/30/claim')).toHaveLength(1))
      expect(boardCalls(calls)).toHaveLength(1)
      expect(button).toBeDisabled()
      releaseReload()
      await waitFor(() => expect(boardCalls(calls)).toHaveLength(2))
      await waitFor(() => expect(button).toBeEnabled())
    })

    it('shows "already taken" and reloads the board when someone got there first', async () => {
      const calls = renderDetail(USERS.employee, {
        'GET /projects/1/board': [200, BOARD],
        'POST /tasks/30/claim': [409, { error: 'This task is already taken.' }],
      })
      await openBoard()
      await userEvent.click(within(await screen.findByRole('article', { name: 'Go-live checklist' })).getByRole('button', { name: 'Take this' }))
      expect(await screen.findByText('This task is already taken.')).toBeInTheDocument()
      await waitFor(() => expect(boardCalls(calls)).toHaveLength(2))
    })
  })
})
