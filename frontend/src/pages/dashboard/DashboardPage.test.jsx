import { describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useLocation } from 'react-router'
import DashboardPage from './DashboardPage'
import { holdOpen, page, renderAt, stubApi } from '../../test/utils'

const APOLLO = {
  projectId: 1, name: 'Apollo', status: 'ACTIVE', managerId: 2, managerName: 'Maria Lopez',
  startDate: '2026-10-01', predictedEndDate: '2026-12-31', progressPercent: 12,
  atRisk: true, riskReasons: [{ code: 'DELIVERABLE_BEHIND', message: 'Deliverable Build is 0% done with 25% of its time gone.' }],
  budgetCents: 15_000_000, plannedCents: 3_197_600, consumedCents: 137_000, pendingCents: 153_800,
  consumedPercent: 0, plannedPercent: 21, pendingPercent: 1, plannedOverBudget: false, remainingCents: 14_863_000, scheduleElapsedPercent: 14,
  lastActivityAt: '2026-10-14T15:00:00Z',
}
const HERMES = {
  ...APOLLO, projectId: 3, name: 'Hermes', status: 'PLANNING', progressPercent: 0, atRisk: false, riskReasons: [],
  budgetCents: 8_000_000, plannedCents: 0, consumedCents: 0, pendingCents: 0, plannedPercent: 0, pendingPercent: 0,
  lastActivityAt: '2026-10-12T15:00:00Z',
}

/**
 * GET /dashboard/projects as the server answers it: atRisk=true or false keeps that group, and
 * atRiskTotal counts every at-risk project. `extra` (per group: { true: {...}, false: {...} }) sets totals.
 */
function projectsAnswer(all, extra = {}) {
  return ({ query }) => {
    const kept = all.filter((p) => query.atRisk === undefined || String(p.atRisk) === query.atRisk)
    return [200, page(kept, { atRiskTotal: all.filter((p) => p.atRisk).length, ...extra[query.atRisk] })]
  }
}

/** The last GET /dashboard/projects for one column (atRisk 'true' or 'false'). */
const lastFor = (calls, atRisk) => calls.filter((c) => c.path === '/dashboard/projects' && c.query.atRisk === atRisk).at(-1)

/** Shows the router's ?query, so a test can see where a button took the page. */
function Where() {
  return <output aria-label="Address">{useLocation().search}</output>
}

const TIMELINE = {
  projectId: 1, name: 'Apollo', status: 'ACTIVE', startDate: '2026-10-01', endDate: '2026-12-31', atRisk: true,
  deliverables: [{ milestoneId: 11, name: 'Build', dueDate: '2026-11-20', status: 'IN_PROGRESS' }], bookings: [],
}

const BEN = {
  userId: 4, name: 'Ben Okafor', capacityHours: 40, peakOverByHours: 5,
  weeks: [{
    week: '2026-10-12', bookedHours: 45, overByHours: 5, overAllocated: true,
    projects: [{ projectId: 1, name: 'Apollo', hours: 25 }, { projectId: 2, name: 'Zeus', hours: 20 }],
  }],
}

/** Overrides merge into the defaults, so a test that changes one answer keeps the others. */
function renderDashboard(answers = {}, { path = '/dashboard' } = {}) {
  const calls = stubApi({
    'GET /dashboard/projects': projectsAnswer([APOLLO, HERMES]),
    'GET /dashboard/allocation': [200, { ...page([BEN], { total: 12 }), weeks: ['2026-10-12'] }],
    'GET /dashboard/timeline': [200, page([TIMELINE])],
    ...answers,
  })
  renderAt(<><DashboardPage /><Where /></>, { path })
  return calls
}

describe('DashboardPage', () => {
  it('starts with My projects this week, a timeline from GET /dashboard/timeline, before the workload chart', async () => {
    const calls = renderDashboard()
    const timeline = await screen.findByRole('region', { name: 'My projects this week' })
    expect(await within(timeline).findByRole('link', { name: 'Apollo' })).toHaveAttribute('href', '/projects/1')
    const workload = await screen.findByRole('figure', { name: 'Workload this week · all projects' })
    expect(timeline.compareDocumentPosition(workload) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(calls.filter((c) => c.path === '/dashboard/timeline')).toHaveLength(1)
  })

  it('keeps the timeline when the project search changes', async () => {
    const calls = renderDashboard()
    await screen.findByRole('article', { name: 'Apollo' })
    await userEvent.type(screen.getByLabelText(/search projects/i), 'apo{Enter}')
    await waitFor(() => expect(calls.at(-1).query.q).toBe('apo'))
    expect(calls.filter((c) => c.path === '/dashboard/timeline')).toHaveLength(1)
  })

  it('searches projects as I type, sending q like every other list, with no Search button to press', async () => {
    const calls = renderDashboard()
    await screen.findByRole('article', { name: 'Apollo' })
    expect(screen.queryByRole('button', { name: 'Search' })).not.toBeInTheDocument()
    await userEvent.type(screen.getByRole('textbox', { name: 'Search projects' }), 'apo')
    await waitFor(() => expect(calls.filter((c) => c.path === '/dashboard/projects').at(-1).query).toMatchObject({ q: 'apo', page: '1' }))
    expect(calls.filter((c) => c.path === '/dashboard/projects').at(-1).query.search).toBeUndefined()
  })

  it('keeps the counts and cards on screen while a new search loads, so the page does not flicker', async () => {
    renderDashboard()
    const card = await screen.findByRole('article', { name: 'Apollo' })
    const release = holdOpen('/dashboard/projects')
    await userEvent.type(screen.getByRole('textbox', { name: 'Search projects' }), 'apo{Enter}')
    await waitFor(() => expect(globalThis.fetch.mock.calls.some(([url]) => url.includes('q=apo'))).toBe(true))
    expect(screen.queryByText(/^Loading/)).not.toBeInTheDocument()
    expect(card).toBeInTheDocument()
    expect(screen.getByLabelText('Total projects')).toBeInTheDocument()
    release()
  })

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

  it('counts every project and every at-risk project, not just the cards on screen', async () => {
    renderDashboard({
      'GET /dashboard/projects': projectsAnswer([APOLLO, HERMES], { true: { total: 7, totalPages: 3, atRiskTotal: 7 }, false: { total: 23, totalPages: 8, atRiskTotal: 7 } }),
    })
    await screen.findByRole('article', { name: 'Apollo' })
    expect(screen.getByLabelText('Total projects')).toHaveTextContent('30') // 7 at risk + 23 on track
    expect(screen.getByLabelText('Total at risk')).toHaveTextContent('7') // the screen alone has 1
  })

  describe('two columns, for hundreds of projects', () => {
    it('shows At risk and On track side by side, each asking for its 3 most recently updated projects', async () => {
      const calls = renderDashboard()
      const atRisk = await screen.findByRole('region', { name: /^At risk/ })
      const onTrack = screen.getByRole('region', { name: /^On track/ })
      expect(await within(atRisk).findByRole('article', { name: 'Apollo' })).toBeInTheDocument()
      expect(await within(onTrack).findByRole('article', { name: 'Hermes' })).toBeInTheDocument()
      expect(within(atRisk).queryByRole('article', { name: 'Hermes' })).not.toBeInTheDocument()
      expect(atRisk.compareDocumentPosition(onTrack) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy() // At risk first, also when stacked on a phone
      expect(lastFor(calls, 'true').query).toMatchObject({ sort: 'updated', pageSize: '3', page: '1' })
      expect(lastFor(calls, 'false').query).toMatchObject({ sort: 'updated', pageSize: '3', page: '1' })
      expect(calls.some((c) => c.path === '/dashboard/projects' && c.query.atRisk === undefined)).toBe(false)
    })

    it("heads each column with its count, that group's total", async () => {
      renderDashboard({ 'GET /dashboard/projects': projectsAnswer([APOLLO, HERMES], { true: { total: 5 }, false: { total: 41 } }) })
      expect(await screen.findByRole('heading', { name: 'At risk (5)' })).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'On track (41)' })).toBeInTheDocument()
    })

    it("says when each card's project last changed", async () => {
      renderDashboard()
      expect(within(await screen.findByRole('article', { name: 'Apollo' })).getByText('Updated Oct 14, 2026')).toBeInTheDocument()
      expect(within(await screen.findByRole('article', { name: 'Hermes' })).getByText('Updated Oct 12, 2026')).toBeInTheDocument()
    })

    it('offers "See all N" under a column only when it has more than 3', async () => {
      renderDashboard({ 'GET /dashboard/projects': projectsAnswer([APOLLO, HERMES], { true: { total: 5 }, false: { total: 3 } }) })
      const seeAll = await screen.findByRole('button', { name: 'See all 5 at-risk projects' })
      expect(seeAll).toHaveClass('MuiButton-contained')
      expect(within(screen.getByRole('region', { name: /^At risk/ })).getByRole('button', { name: /see all/i })).toBe(seeAll)
      expect(screen.queryByRole('button', { name: /on-track projects/ })).not.toBeInTheDocument()
    })

    it('opens the whole group 12 to a page from See all, keeps it in the address, and goes back to the columns', async () => {
      const calls = renderDashboard({
        'GET /dashboard/projects': projectsAnswer([APOLLO, HERMES], { true: { total: 30, totalPages: 3 }, false: { total: 2 } }),
      })
      await userEvent.click(await screen.findByRole('button', { name: 'See all 30 at-risk projects' }))
      expect(screen.getByLabelText('Address')).toHaveTextContent('?group=at-risk')
      const heading = await screen.findByRole('heading', { name: 'All at-risk projects (30)' })
      expect(heading).toHaveFocus() // the view changed: focus (and the scroll) goes to its heading
      await waitFor(() => expect(calls.at(-1).query).toMatchObject({ atRisk: 'true', sort: 'updated', page: '1', pageSize: '12' }))
      expect(await screen.findByRole('article', { name: 'Apollo' })).toBeInTheDocument()
      expect(screen.queryByRole('region', { name: /^On track/ })).not.toBeInTheDocument()
      expect(screen.queryByRole('region', { name: 'My projects this week' })).not.toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: /go to page 2/i }))
      await waitFor(() => expect(calls.at(-1).query).toMatchObject({ atRisk: 'true', page: '2', pageSize: '12' }))
      const back = screen.getByRole('button', { name: 'Back to dashboard' })
      expect(back).toHaveClass('MuiButton-contained')
      await userEvent.click(back)
      expect(screen.getByLabelText('Address')).toHaveTextContent(/^$/)
      expect(await screen.findByRole('region', { name: /^On track/ })).toBeInTheDocument()
    })

    it('opens a group straight from the address, as the browser Back button does', async () => {
      const calls = renderDashboard({}, { path: '/dashboard?group=on-track' })
      expect(await screen.findByRole('heading', { name: 'All on-track projects (1)' })).toBeInTheDocument()
      expect(await screen.findByRole('article', { name: 'Hermes' })).toBeInTheDocument()
      expect(screen.queryByRole('article', { name: 'Apollo' })).not.toBeInTheDocument()
      expect(calls.some((c) => c.query.atRisk === 'false' && c.query.pageSize === '12')).toBe(true)
    })

    it('ignores a group it does not know and shows the columns', async () => {
      renderDashboard({}, { path: '/dashboard?group=nonsense' })
      expect(await screen.findByRole('region', { name: /^At risk/ })).toBeInTheDocument()
    })

    it('says so in each empty column', async () => {
      renderDashboard({ 'GET /dashboard/projects': projectsAnswer([HERMES]) })
      expect(await screen.findByText('No at-risk projects.')).toBeInTheDocument()
      expect(await screen.findByRole('article', { name: 'Hermes' })).toBeInTheDocument()
      expect(screen.queryByText('No on-track projects.')).not.toBeInTheDocument()
    })

    it('draws Budget by project for the projects on screen, from both columns', async () => {
      renderDashboard()
      const chart = await screen.findByRole('figure', { name: 'Budget by project' })
      await waitFor(() => expect(chart).toHaveTextContent(/Apollo/))
      expect(chart).toHaveTextContent(/Hermes/)
    })
  })

  it('says the counts follow the filter', async () => {
    renderDashboard()
    await screen.findByRole('article', { name: 'Apollo' })
    expect(screen.queryByText(/counts are for the current search/i)).not.toBeInTheDocument()
    await userEvent.type(screen.getByLabelText(/search projects/i), 'apo{Enter}')
    expect(await screen.findByText(/counts are for the current search/i)).toBeInTheDocument()
  })

  it('orders the page: My projects this week, Workload this week, the search with its counts, the cards, then Budget by project last', async () => {
    renderDashboard()
    const chart = await screen.findByRole('figure', { name: 'Budget by project' })
    const inOrder = [
      screen.getByRole('region', { name: 'My projects this week' }),
      await screen.findByRole('figure', { name: 'Workload this week · all projects' }),
      screen.getByRole('textbox', { name: 'Search projects' }),
      screen.getByLabelText('Total projects'),
      screen.getByLabelText('Total at risk'),
      screen.getByRole('article', { name: 'Apollo' }),
      screen.getByRole('article', { name: 'Hermes' }),
      chart,
    ]
    inOrder.slice(1).forEach((later, i) => {
      expect(inOrder[i].compareDocumentPosition(later) & Node.DOCUMENT_POSITION_FOLLOWING, later.textContent).toBeTruthy()
    })
  })

  it('shows the two counts small, in one row with the project search, not as big boxes', async () => {
    renderDashboard()
    await screen.findByRole('article', { name: 'Apollo' })
    const search = screen.getByRole('textbox', { name: 'Search projects' })
    const row = screen.getByRole('group', { name: 'Project search and counts' })
    expect(row).toContainElement(search)
    for (const label of ['Total projects', 'Total at risk']) {
      const count = screen.getByLabelText(label)
      expect(row).toContainElement(count)
      expect(count.closest('.MuiCard-root')).toBeNull()
      expect(count.closest('h1, h2, h3, h4, h5, h6, [class*="MuiTypography-h"]')).toBeNull() // body-sized, not a heading size
    }
  })

  it("opens each card's project with a filled button, like every button (spec 6.2)", async () => {
    renderDashboard()
    const card = await screen.findByRole('article', { name: 'Apollo' })
    const open = within(card).getByRole('link', { name: /open project/i })
    expect(open).toHaveAttribute('href', '/projects/1')
    expect(open).toHaveClass('MuiButton-contained')
  })

  it('draws no outlined or text buttons anywhere on the page', async () => {
    renderDashboard({ 'GET /dashboard/projects': projectsAnswer([APOLLO, HERMES], { true: { total: 5 }, false: { total: 9 } }) })
    await screen.findByRole('article', { name: 'Apollo' })
    await screen.findByRole('button', { name: 'See all 9 on-track projects' })
    await screen.findByRole('figure', { name: 'Workload this week · all projects' })
    await screen.findByRole('button', { name: 'Earlier' })
    const buttons = [...document.querySelectorAll('.MuiButton-root')]
    expect(buttons.length).toBeGreaterThan(5)
    buttons.forEach((b) => expect(b.className, b.textContent).not.toMatch(/MuiButton-(outlined|text)\b/))
  })

  it('searches and filters on the server, in both columns', async () => {
    const calls = renderDashboard()
    await screen.findByRole('article', { name: 'Apollo' })
    await userEvent.type(screen.getByLabelText(/search projects/i), 'apo{Enter}')
    await waitFor(() => expect(lastFor(calls, 'true').query.q).toBe('apo'))
    await waitFor(() => expect(lastFor(calls, 'false').query.q).toBe('apo'))
    await userEvent.click(screen.getByLabelText(/status/i))
    await userEvent.click(await screen.findByRole('option', { name: 'Active' }))
    await waitFor(() => expect(lastFor(calls, 'true').query).toMatchObject({ status: 'ACTIVE', q: 'apo' }))
    await waitFor(() => expect(lastFor(calls, 'false').query).toMatchObject({ status: 'ACTIVE', q: 'apo' }))
  })

  it('says so when there are no projects', async () => {
    renderDashboard({ 'GET /dashboard/projects': [200, page([])] })
    expect(await screen.findByText('No at-risk projects.')).toBeInTheDocument()
    expect(await screen.findByText('No on-track projects.')).toBeInTheDocument()
    expect(screen.queryByRole('figure', { name: 'Budget by project' })).not.toBeInTheDocument()
  })

  it('shows a failed column with its own Retry, and keeps the other column', async () => {
    let attempts = 0
    renderDashboard({
      'GET /dashboard/projects': (call) => {
        if (call.query.atRisk === 'false') return projectsAnswer([APOLLO, HERMES])(call)
        attempts += 1
        return attempts === 1 ? [503, { error: 'The database is not ready. Please try again shortly.' }] : projectsAnswer([APOLLO, HERMES])(call)
      },
    })
    const atRisk = await screen.findByRole('region', { name: /^At risk/ })
    expect(await within(atRisk).findByText(/database is not ready/i)).toBeInTheDocument()
    expect(await screen.findByRole('article', { name: 'Hermes' })).toBeInTheDocument()
    await userEvent.click(within(atRisk).getByRole('button', { name: /retry/i }))
    expect(await within(atRisk).findByRole('article', { name: 'Apollo' })).toBeInTheDocument()
  })

  it('shows this week\'s workload above the filters, asking for one week of the 8 most over', async () => {
    const calls = renderDashboard()
    const chart = await screen.findByRole('figure', { name: 'Workload this week · all projects' })
    expect(chart.compareDocumentPosition(screen.getByLabelText(/search projects/i)) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(calls.find((c) => c.path === '/dashboard/allocation').query).toMatchObject({ weeks: '1', pageSize: '8' })
    expect(within(chart).getByText('Showing 1 of 12 people, most over first.')).toBeInTheDocument() // the panel passes the server's total
    const allocation = screen.getByRole('link', { name: 'All people and weeks in Allocation' })
    expect(allocation).toHaveAttribute('href', '/allocation')
    expect(allocation).toHaveClass('MuiButton-contained') // not in a sentence, so a button, not a text link
  })

  it('leaves the workload chart alone when searching projects', async () => {
    const calls = renderDashboard()
    await screen.findByRole('figure', { name: 'Workload this week · all projects' })
    await userEvent.type(screen.getByLabelText(/search projects/i), 'apo{Enter}')
    await waitFor(() => expect(calls.at(-1).query.q).toBe('apo'))
    expect(calls.filter((c) => c.path === '/dashboard/allocation')).toHaveLength(1)
    expect(screen.getByRole('figure', { name: 'Workload this week · all projects' })).toBeInTheDocument()
  })

  it('keeps the cards when the workload chart fails, with Retry on the chart only', async () => {
    renderDashboard({ 'GET /dashboard/allocation': [500, { error: 'Database unavailable.' }] })
    expect(await screen.findByText('Database unavailable.')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Retry' })).toHaveLength(1)
    expect(await screen.findByRole('article', { name: 'Apollo' })).toBeInTheDocument()
  })

  it('says when there are no employees', async () => {
    renderDashboard({ 'GET /dashboard/allocation': [200, { ...page([]), weeks: ['2026-10-12'] }] })
    expect(await screen.findByText('No employees to show.')).toBeInTheDocument()
  })

  it('pages through a long group, and a new search starts it again at page 1', async () => {
    const calls = renderDashboard(
      { 'GET /dashboard/projects': projectsAnswer([APOLLO, HERMES], { true: { total: 30, totalPages: 3 } }) },
      { path: '/dashboard?group=at-risk' },
    )
    await screen.findByRole('article', { name: 'Apollo' })
    await userEvent.click(screen.getByRole('button', { name: /go to page 2/i }))
    await waitFor(() => expect(calls.at(-1).query).toMatchObject({ atRisk: 'true', page: '2', pageSize: '12' }))
    await userEvent.type(screen.getByRole('textbox', { name: 'Search projects' }), 'apo{Enter}')
    await waitFor(() => expect(calls.filter((c) => c.query.pageSize === '12').at(-1).query).toMatchObject({ q: 'apo', page: '1' }))
  })
})
