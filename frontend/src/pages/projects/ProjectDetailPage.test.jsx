import { describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ProjectDetailPage from './ProjectDetailPage'
import { APOLLO, BOOKINGS, BUDGET, BUILD, BUILD_TASKS, DESIGN, MARIA } from './fixtures'
import { USERS, page, renderAt, session, stubApi } from '../../test/utils'

function renderDetail(user = USERS.manager, answers = {}) {
  const calls = stubApi({
    'GET /projects/1': [200, APOLLO],
    'GET /users/2': [200, MARIA],
    'GET /projects/1/assignments': [200, page(BOOKINGS)],
    'GET /projects/1/milestones': [200, page([DESIGN, BUILD])],
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

  it('has Deliverables, Resources and Budget tabs, and a link to the dependency view', async () => {
    renderDetail()
    await screen.findByRole('heading', { name: 'Apollo' })
    for (const name of ['Deliverables', 'Resources', 'Budget']) {
      expect(screen.getByRole('tab', { name })).toBeInTheDocument()
    }
    expect(screen.getByRole('link', { name: /dependency view/i })).toHaveAttribute('href', '/projects/1/dependencies')
  })

  it('shows each deliverable with status, progress and due date, and its tasks on demand', async () => {
    renderDetail()
    const build = await screen.findByRole('region', { name: 'Build' })
    expect(within(build).getByText('In progress')).toBeInTheDocument()
    expect(within(build).getByText('0% · 0 of 2 tasks done')).toBeInTheDocument()
    expect(within(build).getByText(/due nov 12, 2026/i)).toBeInTheDocument()
    await userEvent.click(within(build).getByRole('button', { name: /show tasks/i }))
    expect(await within(build).findByText('Portal UI')).toBeInTheDocument()
    expect(within(build).getByText('Ben Okafor')).toBeInTheDocument()
  })

  it("shows the server's refusal when signing off unfinished work", async () => {
    renderDetail(USERS.manager, { 'POST /milestones/11/sign-off': [409, { error: '2 tasks are not done yet.' }] })
    const build = await screen.findByRole('region', { name: 'Build' })
    await userEvent.click(within(build).getByRole('button', { name: /sign off/i }))
    expect(await screen.findByText('2 tasks are not done yet.')).toBeInTheDocument()
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
})
