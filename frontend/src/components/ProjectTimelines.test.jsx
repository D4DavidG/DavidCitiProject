import { describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ProjectTimelines from './ProjectTimelines'
import { USERS, page, renderAt, session, stubApi } from '../test/utils'

// Today is Wednesday Oct 14, 2026, so the window opens on Monday Sep 28 and ends Sunday Dec 20.
const TODAY = '2026-10-14'
const APOLLO = {
  projectId: 1, name: 'Apollo', status: 'ACTIVE', startDate: '2026-10-01', endDate: '2026-12-31', atRisk: true,
  deliverables: [
    { milestoneId: 11, name: 'Design', dueDate: '2026-10-09', status: 'DONE' },
    { milestoneId: 12, name: 'Build', dueDate: '2026-10-13', status: 'IN_PROGRESS' }, // yesterday: late
    { milestoneId: 13, name: 'Launch', dueDate: '2026-11-20', status: 'NOT_STARTED' },
    { milestoneId: 14, name: 'Handover', dueDate: '2027-02-01', status: 'NOT_STARTED' }, // after the window
  ],
  bookings: [{ userId: 3, name: 'Ben Okafor', startDate: '2026-10-05', endDate: '2026-11-29', hoursPerWeek: 20 }],
}
const ZEUS = {
  projectId: 2, name: 'Zeus', status: 'PLANNING', startDate: '2027-01-04', endDate: '2027-03-31', atRisk: false,
  deliverables: [], bookings: [{ userId: 9, name: 'Chloe Kim', startDate: '2027-01-04', endDate: '2027-02-28', hoursPerWeek: 30 }],
}

function renderTimelines({ answer = [200, page([APOLLO, ZEUS])], user = USERS.manager } = {}) {
  const calls = stubApi({ 'GET /dashboard/timeline': answer })
  renderAt(<ProjectTimelines title="My projects this week" today={TODAY} />, { path: '/dashboard', auth: session(user) })
  return calls
}

const projectBar = (name) => screen.findByRole('img', { name: new RegExp(`^${name} project,`) })
const weekLabels = () => [...document.querySelectorAll('[data-testid="week-label"]')].map((el) => el.textContent)

/** Press Tab until `element` has focus. */
async function tabTo(element) {
  for (let i = 0; i < 40 && document.activeElement !== element; i += 1) await userEvent.tab()
  expect(element).toHaveFocus()
}

describe('ProjectTimelines', () => {
  it('asks the server for the first page of my projects', async () => {
    const calls = renderTimelines()
    await projectBar('Apollo')
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ path: '/dashboard/timeline', query: { page: '1', pageSize: '10' } })
  })

  it('has a heading and one row per project, its name a link to the project', async () => {
    renderTimelines()
    const section = await screen.findByRole('region', { name: 'My projects this week' })
    expect(within(section).getByRole('link', { name: 'Apollo' })).toHaveAttribute('href', '/projects/1')
    expect(within(section).getByRole('link', { name: 'Zeus' })).toHaveAttribute('href', '/projects/2')
  })

  it('shows status and at risk in words beside the name', async () => {
    renderTimelines()
    await projectBar('Apollo')
    const apollo = screen.getByRole('link', { name: 'Apollo' }).closest('li')
    expect(within(apollo).getByText('Active')).toBeInTheDocument()
    expect(within(apollo).getByText('At risk')).toBeInTheDocument()
    expect(within(screen.getByRole('link', { name: 'Zeus' }).closest('li')).queryByText('At risk')).not.toBeInTheDocument()
  })

  it("draws the project's span as a bar in its project colour, cut at the window's end", async () => {
    renderTimelines()
    const bar = await projectBar('Apollo')
    expect(bar).toHaveAccessibleName('Apollo project, Active, at risk, Oct 1, 2026 to Dec 31, 2026')
    expect(parseFloat(bar.style.left)).toBeCloseTo(300 / 84) // Oct 1 is day 3 of 84
    expect(parseFloat(bar.style.width)).toBeCloseTo(8100 / 84) // Oct 1 to Dec 20, the last day shown
    expect(bar.style.backgroundColor).toBe('rgb(28, 92, 171)') // PROJECT_COLOURS[0], as on the Schedule
  })

  it('says when a project starts if it is wholly after the weeks shown', async () => {
    renderTimelines()
    await projectBar('Apollo')
    expect(screen.queryByRole('img', { name: /^Zeus project,/ })).not.toBeInTheDocument()
    expect(screen.getByText('Starts Jan 4, 2027')).toBeInTheDocument()
  })

  it('says when a project ended if it is wholly before the weeks shown', async () => {
    renderTimelines({ answer: [200, page([{ ...ZEUS, startDate: '2026-06-01', endDate: '2026-09-25' }])] })
    expect(await screen.findByText('Ended Sep 25, 2026')).toBeInTheDocument()
  })

  it('marks each deliverable on its due date, its state by icon and words', async () => {
    renderTimelines()
    await projectBar('Apollo')
    const design = screen.getByRole('img', { name: 'Apollo deliverable Design, due Oct 9, 2026, Done' })
    expect(within(design).getByTestId('CheckCircleOutlinedIcon')).toBeInTheDocument()
    expect(parseFloat(design.style.left)).toBeCloseTo(1150 / 84) // the middle of day 11
    const build = screen.getByRole('img', { name: 'Apollo deliverable Build, due Oct 13, 2026, Late' })
    expect(within(build).getByTestId('WarningAmberRoundedIcon')).toBeInTheDocument()
    expect(build).toHaveAttribute('data-state', 'late')
    const launch = screen.getByRole('img', { name: 'Apollo deliverable Launch, due Nov 20, 2026, Not started' })
    expect(within(launch).getByTestId('RadioButtonUncheckedOutlinedIcon')).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: /Handover/ })).not.toBeInTheDocument() // due after the window
  })

  it('shows the deliverable in a tooltip on hover', async () => {
    renderTimelines()
    await projectBar('Apollo')
    await userEvent.hover(screen.getByRole('img', { name: /deliverable Build/ }))
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Build · due Oct 13, 2026 · Late')
  })

  it('shows the same tooltip on keyboard focus', async () => {
    // jsdom says :focus-visible only for a test's first Tab; a browser says it for every keyboard
    // focus. So answer as a browser would (as SchedulePage.test.jsx does).
    const matches = Element.prototype.matches
    vi.spyOn(Element.prototype, 'matches').mockImplementation(function focusVisible(selector) {
      return selector === ':focus-visible' ? this === document.activeElement : matches.call(this, selector)
    })
    renderTimelines()
    await projectBar('Apollo')
    await tabTo(screen.getByRole('img', { name: /deliverable Launch/ }))
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Launch · due Nov 20, 2026 · Not started')
  })

  it('draws the today line and tints this week', async () => {
    renderTimelines()
    await projectBar('Apollo')
    const lines = screen.getAllByTestId('today')
    expect(lines.length).toBeGreaterThan(0)
    lines.forEach((line) => expect(parseFloat(line.style.left)).toBeCloseTo(1650 / 84)) // the middle of Oct 14
    const thisWeek = document.querySelectorAll('[data-this-week]')
    expect(thisWeek.length).toBeGreaterThan(0)
    thisWeek.forEach((column) => expect(column).toHaveAttribute('data-this-week', '2026-10-12'))
  })

  it('labels 12 weeks, from the Monday two weeks before this week', async () => {
    renderTimelines()
    await projectBar('Apollo')
    expect(weekLabels()).toEqual([
      'Sep 28', 'Oct 5', 'Oct 12', 'Oct 19', 'Oct 26', 'Nov 2', 'Nov 9', 'Nov 16', 'Nov 23', 'Nov 30', 'Dec 7', 'Dec 14',
    ])
    expect(screen.getByText('Sep 28 – Dec 20, 2026')).toBeInTheDocument()
  })

  it('moves the window 4 weeks with Earlier and Later, without asking the server again', async () => {
    const calls = renderTimelines()
    await projectBar('Apollo')
    await userEvent.click(screen.getByRole('button', { name: 'Later' }))
    expect(weekLabels()[0]).toBe('Oct 26')
    await userEvent.click(screen.getByRole('button', { name: 'Later' }))
    expect(weekLabels()[0]).toBe('Nov 23')
    expect(screen.getByRole('img', { name: /deliverable Handover, due Feb 1, 2027/ })).toBeInTheDocument()
    expect(screen.queryByTestId('today')).not.toBeInTheDocument() // today is before these weeks
    await userEvent.click(screen.getByRole('button', { name: 'This week' }))
    expect(weekLabels()[0]).toBe('Sep 28')
    await userEvent.click(screen.getByRole('button', { name: 'Earlier' }))
    expect(weekLabels()[0]).toBe('Aug 31')
    expect(calls).toHaveLength(1)
  })

  it("draws my own booking as a thin band labelled with its hours a week, and nobody else's", async () => {
    renderTimelines({ user: USERS.employee }) // userId 3, Ben
    const band = await screen.findByRole('img', { name: 'Your booking on Apollo, 20 hours a week, Oct 5, 2026 to Nov 29, 2026' })
    expect(band).toHaveTextContent('20 h/wk')
    expect(within(band).getByTestId('band').style.backgroundColor).toBe('rgb(28, 92, 171)')
    await userEvent.click(screen.getByRole('button', { name: 'Later' }))
    await userEvent.click(screen.getByRole('button', { name: 'Later' }))
    expect(screen.queryByRole('img', { name: /Your booking on Zeus/ })).not.toBeInTheDocument() // Chloe's, not mine
  })

  it("draws no booking band for a manager looking at other people's bookings", async () => {
    renderTimelines() // manager, userId 2: Apollo's booking is Ben's
    await projectBar('Apollo')
    expect(screen.queryByRole('img', { name: /Your booking/ })).not.toBeInTheDocument()
  })

  it('keeps the weeks in a box that scrolls sideways and the keyboard can reach', async () => {
    renderTimelines()
    await projectBar('Apollo')
    expect(screen.getByRole('region', { name: 'Weeks, scrolls sideways' })).toHaveAttribute('tabindex', '0')
  })

  it('keeps the sticky project name above every mark that scrolls under it', async () => {
    renderTimelines()
    await projectBar('Apollo')
    const row = screen.getByRole('link', { name: 'Apollo' }).closest('li')
    const nameCell = within(row).getByRole('link', { name: 'Apollo' }).parentElement
    const layers = [...row.querySelectorAll('[data-mark]')].map((mark) => Number(getComputedStyle(mark).zIndex) || 0)
    expect(layers.length).toBeGreaterThan(3)
    expect(Number(getComputedStyle(nameCell).zIndex)).toBeGreaterThan(Math.max(...layers))
  })

  it('explains the marks in a legend', async () => {
    renderTimelines()
    await projectBar('Apollo')
    const legend = screen.getByRole('list', { name: 'Legend' })
    expect(within(legend).getAllByRole('listitem').map((li) => li.textContent))
      .toEqual(['Done', 'In progress', 'Not started', 'Blocked', 'Late', 'Today', 'This week'])
  })

  it('pages through projects on the server', async () => {
    const calls = renderTimelines({ answer: [200, page([APOLLO], { total: 14, totalPages: 2, pageSize: 10 })] })
    await projectBar('Apollo')
    await userEvent.click(screen.getByRole('button', { name: /go to page 2/i }))
    await waitFor(() => expect(calls.at(-1).query.page).toBe('2'))
  })

  it('says so when there are no projects', async () => {
    renderTimelines({ answer: [200, page([])] })
    expect(await screen.findByText('No projects yet.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'My projects this week' })).toBeInTheDocument()
  })

  it("shows the server's error with Retry, and loads on Retry", async () => {
    let attempts = 0
    renderTimelines({ answer: () => (++attempts === 1 ? [503, { error: 'The database is waking up.' }] : [200, page([APOLLO])]) })
    expect(await screen.findByText('The database is waking up.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await projectBar('Apollo')).toBeInTheDocument()
  })
})
