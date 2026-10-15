import { describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import DashboardPage from './DashboardPage'
import { page, renderAt, stubApi } from '../../test/utils'

const APOLLO = {
  projectId: 1, name: 'Apollo', status: 'ACTIVE', managerId: 2, managerName: 'Maria Lopez',
  startDate: '2026-10-01', predictedEndDate: '2026-12-31', progressPercent: 12,
  atRisk: true, riskReasons: [{ code: 'DELIVERABLE_BEHIND', message: 'Deliverable Build is 0% done with 25% of its time gone.' }],
  budgetCents: 15_000_000, plannedCents: 3_197_600, consumedCents: 137_000, pendingCents: 153_800,
  consumedPercent: 0, plannedPercent: 21, pendingPercent: 1, plannedOverBudget: false, remainingCents: 14_863_000, scheduleElapsedPercent: 14,
}
const HERMES = {
  ...APOLLO, projectId: 3, name: 'Hermes', status: 'PLANNING', progressPercent: 0, atRisk: false, riskReasons: [],
  budgetCents: 8_000_000, plannedCents: 0, consumedCents: 0, pendingCents: 0, plannedPercent: 0, pendingPercent: 0,
}

const BEN = {
  userId: 4, name: 'Ben Okafor', capacityHours: 40, peakOverByHours: 5,
  weeks: [{
    week: '2026-10-12', bookedHours: 45, overByHours: 5, overAllocated: true,
    projects: [{ projectId: 1, name: 'Apollo', hours: 25 }, { projectId: 2, name: 'Zeus', hours: 20 }],
  }],
}

/** Overrides merge into the defaults, so a test that changes one answer keeps the others. */
function renderDashboard(answers = {}) {
  const calls = stubApi({
    'GET /dashboard/projects': [200, page([APOLLO, HERMES], { atRiskTotal: 1 })],
    'GET /dashboard/allocation': [200, { ...page([BEN], { total: 12 }), weeks: ['2026-10-12'] }],
    ...answers,
  })
  renderAt(<DashboardPage />, { path: '/dashboard' })
  return calls
}

describe('DashboardPage', () => {
  it("tells a manager these are their own projects, not the company's", async () => {
    renderDashboard()
    expect(await screen.findByText(/the projects you manage/i)).toBeInTheDocument()
  })

  it('shows a card per project with its status and progress', async () => {
    renderDashboard()
    const card = await screen.findByRole('article', { name: 'Apollo' })
    expect(within(card).getByText('Active')).toBeInTheDocument()
    expect(within(card).getByText('12% of estimated hours done')).toBeInTheDocument()
    expect(within(card).getByText('Maria Lopez')).toBeInTheDocument()
  })

  it('flags an at-risk project and lists every reason', async () => {
    renderDashboard()
    const card = await screen.findByRole('article', { name: 'Apollo' })
    expect(within(card).getByText('At risk')).toBeInTheDocument()
    expect(within(card).getByText('Deliverable Build is 0% done with 25% of its time gone.')).toBeInTheDocument()
  })

  it('marks a healthy project as on track', async () => {
    renderDashboard()
    const card = await screen.findByRole('article', { name: 'Hermes' })
    expect(within(card).getByText('On track')).toBeInTheDocument()
  })

  it('shows the budget bar on each card', async () => {
    renderDashboard()
    const card = await screen.findByRole('article', { name: 'Apollo' })
    expect(within(card).getByText('$1,370 spent of $150,000')).toBeInTheDocument()
  })

  it('counts every project and every at-risk project, not just this page', async () => {
    renderDashboard({ 'GET /dashboard/projects': [200, page([APOLLO, HERMES], { total: 30, totalPages: 3, atRiskTotal: 7 })] })
    await screen.findByRole('article', { name: 'Apollo' })
    expect(screen.getByLabelText('Total projects')).toHaveTextContent('30')
    expect(screen.getByLabelText('Total at risk')).toHaveTextContent('7') // this page alone has 1
  })

  it('says the counts follow the filter', async () => {
    renderDashboard()
    await screen.findByRole('article', { name: 'Apollo' })
    expect(screen.queryByText(/counts are for the current search/i)).not.toBeInTheDocument()
    await userEvent.type(screen.getByLabelText(/search projects/i), 'apo{Enter}')
    expect(await screen.findByText(/counts are for the current search/i)).toBeInTheDocument()
  })

  it('draws the budget chart between the counts and the cards', async () => {
    renderDashboard()
    const chart = await screen.findByRole('figure', { name: 'Budget by project' })
    expect(screen.getByLabelText('Total at risk').compareDocumentPosition(chart) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(chart.compareDocumentPosition(screen.getByRole('article', { name: 'Apollo' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('links each card to its project', async () => {
    renderDashboard()
    const card = await screen.findByRole('article', { name: 'Apollo' })
    expect(within(card).getByRole('link', { name: /open project/i })).toHaveAttribute('href', '/projects/1')
  })

  it('searches and filters on the server', async () => {
    const calls = renderDashboard({ 'GET /dashboard/projects': [200, page([APOLLO])] })
    await screen.findByRole('article', { name: 'Apollo' })
    await userEvent.type(screen.getByLabelText(/search projects/i), 'apo{Enter}')
    await waitFor(() => expect(calls.at(-1).query.search).toBe('apo'))
    await userEvent.click(screen.getByLabelText(/status/i))
    await userEvent.click(await screen.findByRole('option', { name: 'Active' }))
    await waitFor(() => expect(calls.at(-1).query.status).toBe('ACTIVE'))
    expect(calls.at(-1).query.search).toBe('apo')
  })

  it('says so when there are no projects', async () => {
    renderDashboard({ 'GET /dashboard/projects': [200, page([])] })
    expect(await screen.findByText(/no projects to show/i)).toBeInTheDocument()
    expect(screen.queryByRole('figure', { name: 'Budget by project' })).not.toBeInTheDocument()
  })

  it('shows the error and retries', async () => {
    let attempts = 0
    renderDashboard({
      'GET /dashboard/projects': () => (++attempts === 1 ? [503, { error: 'The database is not ready. Please try again shortly.' }] : [200, page([APOLLO])]),
    })
    expect(await screen.findByText(/database is not ready/i)).toBeInTheDocument()
    expect(screen.queryByRole('figure', { name: 'Budget by project' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /retry/i }))
    expect(await screen.findByRole('article', { name: 'Apollo' })).toBeInTheDocument()
  })

  it('shows this week\'s workload above the filters, asking for one week of the 8 most over', async () => {
    const calls = renderDashboard()
    const chart = await screen.findByRole('figure', { name: 'Workload this week · all projects' })
    expect(chart.compareDocumentPosition(screen.getByLabelText(/search projects/i)) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(calls.find((c) => c.path === '/dashboard/allocation').query).toMatchObject({ weeks: '1', pageSize: '8' })
    expect(within(chart).getByText('Showing 1 of 12 people, most over first.')).toBeInTheDocument() // the panel passes the server's total
    expect(screen.getByRole('link', { name: 'All people and weeks in Allocation' })).toHaveAttribute('href', '/allocation')
  })

  it('leaves the workload chart alone when searching projects', async () => {
    const calls = renderDashboard()
    await screen.findByRole('figure', { name: 'Workload this week · all projects' })
    await userEvent.type(screen.getByLabelText(/search projects/i), 'apo{Enter}')
    await waitFor(() => expect(calls.at(-1).query.search).toBe('apo'))
    expect(calls.filter((c) => c.path === '/dashboard/allocation')).toHaveLength(1)
    expect(screen.getByRole('figure', { name: 'Workload this week · all projects' })).toBeInTheDocument()
  })

  it('keeps the cards when the workload chart fails, with Retry on the chart only', async () => {
    renderDashboard({ 'GET /dashboard/projects': [200, page([APOLLO, HERMES])], 'GET /dashboard/allocation': [500, { error: 'Database unavailable.' }] })
    expect(await screen.findByText('Database unavailable.')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Retry' })).toHaveLength(1)
    expect(await screen.findByRole('article', { name: 'Apollo' })).toBeInTheDocument()
  })

  it('says when there are no employees', async () => {
    renderDashboard({ 'GET /dashboard/projects': [200, page([APOLLO])], 'GET /dashboard/allocation': [200, { ...page([]), weeks: ['2026-10-12'] }] })
    expect(await screen.findByText('No employees to show.')).toBeInTheDocument()
  })

  it('pages through long lists', async () => {
    const calls = renderDashboard({ 'GET /dashboard/projects': [200, page([APOLLO], { total: 30, totalPages: 2 })] })
    await screen.findByRole('article', { name: 'Apollo' })
    await userEvent.click(screen.getByRole('button', { name: /go to page 2/i }))
    await waitFor(() => expect(calls.at(-1).query.page).toBe('2'))
  })
})
