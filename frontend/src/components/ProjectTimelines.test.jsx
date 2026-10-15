import { describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ProjectTimelines from './ProjectTimelines'
import theme, { makeTheme } from '../theme/theme'
import { OTHER_COLOUR, PROJECT_COLOURS } from '../theme/chartColours'
import { USERS, holdOpen, page, renderAt, session, stubApi } from '../test/utils'

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

function renderTimelines({ answer = [200, page([APOLLO, ZEUS])], user = USERS.manager, mode = 'light', headingVariant } = {}) {
  const calls = stubApi({ 'GET /dashboard/timeline': answer })
  renderAt(<ProjectTimelines title="My projects this week" today={TODAY} headingVariant={headingVariant} />, {
    path: '/dashboard', auth: session(user), theme: mode === 'dark' ? makeTheme('dark') : theme,
  })
  return calls
}

/** A colour as the browser reports it (rgb(...)), so a hex token can be compared with a computed style. */
function rgb(colour) {
  const probe = document.createElement('div')
  probe.style.backgroundColor = colour
  return probe.style.backgroundColor
}
const fill = (element) => getComputedStyle(element).backgroundColor
/** Every request the page has started, held open or not (holdOpen wraps fetch in a vi.fn). */
const started = () => globalThis.fetch.mock.calls.map(([url]) => url)

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

  it("draws the project's span as a bar, cut at the window's end", async () => {
    renderTimelines()
    const bar = await projectBar('Apollo')
    expect(bar).toHaveAccessibleName('Apollo project, Active, at risk, Oct 1, 2026 to Dec 31, 2026')
    expect(parseFloat(bar.style.left)).toBeCloseTo(300 / 84) // Oct 1 is day 3 of 84
    expect(parseFloat(bar.style.width)).toBeCloseTo(8100 / 84) // Oct 1 to Dec 20, the last day shown
  })

  it("draws every project's bar in the theme's one green, never a project colour another chart uses", async () => {
    // Seven projects: the 6th and 7th used to fall to the pale Other colour, and a project colour
    // here could name a different project in the workload chart on the same page.
    const seven = Array.from({ length: 7 }, (_, i) => ({ ...APOLLO, projectId: i + 1, name: `P${i + 1}`, atRisk: false }))
    renderTimelines({ answer: [200, page(seven)] })
    await projectBar('P7')
    const fills = seven.map((p) => fill(screen.getByRole('img', { name: new RegExp(`^${p.name} project,`) })))
    expect(new Set(fills)).toEqual(new Set([rgb(theme.palette.primary.main)]))
    expect([...PROJECT_COLOURS, OTHER_COLOUR].map(rgb)).not.toContain(fills[0])
  })

  it("draws the bars in dark mode's own accent, which reads on the dark card", async () => {
    renderTimelines({ mode: 'dark' })
    expect(fill(await projectBar('Apollo'))).toBe(rgb(makeTheme('dark').palette.primary.main))
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
    await tabTo(await projectBar('Apollo'))
    await userEvent.keyboard('{End}')
    expect(screen.getByRole('img', { name: /deliverable Launch/ })).toHaveFocus()
    const tip = await screen.findByText('Launch · due Nov 20, 2026 · Not started')
    expect(tip.closest('[role="tooltip"]')).not.toBeNull()
  })

  it("is one Tab stop per row: the arrow keys, Home and End move along that row's marks", async () => {
    renderTimelines()
    const bar = await projectBar('Apollo')
    const design = screen.getByRole('img', { name: /deliverable Design/ })
    const build = screen.getByRole('img', { name: /deliverable Build/ })
    const launch = screen.getByRole('img', { name: /deliverable Launch/ })
    const stops = () => screen.getAllByRole('img').filter((mark) => mark.tabIndex === 0)
    expect(stops()).toEqual([bar]) // Zeus is off screen, so it has no marks
    await tabTo(bar)
    await userEvent.keyboard('{ArrowRight}')
    expect(design).toHaveFocus()
    await userEvent.keyboard('{ArrowRight}')
    expect(build).toHaveFocus()
    await userEvent.keyboard('{End}{ArrowRight}')
    expect(launch).toHaveFocus() // stops at the end
    expect(stops()).toEqual([launch]) // Tab comes back to where you were
    await userEvent.keyboard('{Home}{ArrowLeft}')
    expect(bar).toHaveFocus()
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

  it('gives Earlier, Later and This week the outlined look of every secondary button', async () => {
    renderTimelines()
    await projectBar('Apollo')
    const names = ['Earlier', 'Later', 'This week']
    names.forEach((name) => expect(screen.getByRole('button', { name })).toHaveClass('MuiButton-outlined'))
  })

  it('never disables This week, so focus stays on it; at this week it does nothing', async () => {
    renderTimelines()
    await projectBar('Apollo')
    const thisWeek = screen.getByRole('button', { name: 'This week' })
    expect(thisWeek).toBeEnabled()
    await userEvent.click(thisWeek)
    expect(weekLabels()[0]).toBe('Sep 28')
    await userEvent.click(screen.getByRole('button', { name: 'Later' }))
    await userEvent.click(thisWeek)
    expect(weekLabels()[0]).toBe('Sep 28')
    expect(thisWeek).toHaveFocus()
  })

  it('announces the new weeks politely when they move', async () => {
    renderTimelines()
    await projectBar('Apollo')
    expect(screen.getByText('Sep 28 – Dec 20, 2026')).toHaveAttribute('aria-live', 'polite')
  })

  it("draws my own booking as a thin band labelled with its hours a week, and nobody else's", async () => {
    renderTimelines({ user: USERS.employee }) // userId 3, Ben
    const band = await screen.findByRole('img', { name: 'Your booking on Apollo, 20 hours a week, Oct 5, 2026 to Nov 29, 2026' })
    expect(band).toHaveTextContent('20 h/wk')
    await userEvent.click(screen.getByRole('button', { name: 'Later' }))
    await userEvent.click(screen.getByRole('button', { name: 'Later' }))
    expect(screen.queryByRole('img', { name: /Your booking on Zeus/ })).not.toBeInTheDocument() // Chloe's, not mine
  })

  it('explains my booking band in the legend, in the same colour as the band', async () => {
    renderTimelines({ user: USERS.employee })
    const band = await screen.findByRole('img', { name: /^Your booking on Apollo/ })
    const legend = screen.getByRole('list', { name: 'Legend' })
    const item = within(legend).getByText('Your booking, hours a week')
    const swatch = item.querySelector('[data-mark]')
    expect(fill(within(band).getByTestId('band'))).toBe(rgb(theme.palette.text.secondary))
    expect(fill(swatch)).toBe(fill(within(band).getByTestId('band')))
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

  it('keeps the rows and the page buttons, and your focus, while the next page loads', async () => {
    renderTimelines({ answer: [200, page([APOLLO], { total: 14, totalPages: 2, pageSize: 10 })] })
    const bar = await projectBar('Apollo')
    const release = holdOpen('/dashboard/timeline')
    const next = screen.getByRole('button', { name: /go to page 2/i })
    next.focus()
    await userEvent.keyboard('{Enter}')
    await waitFor(() => expect(started().some((url) => url.includes('page=2'))).toBe(true))
    expect(screen.queryByText(/^Loading/)).not.toBeInTheDocument()
    expect(bar).toBeInTheDocument()
    expect(next).toHaveFocus()
    release()
  })

  it('titles the section as an h2 in the h3 size by default (the Dashboard cards are h3-sized)', async () => {
    renderTimelines()
    expect(await screen.findByRole('heading', { level: 2, name: 'My projects this week' })).toHaveClass('MuiTypography-h3')
  })

  it('takes the h2 size when the page passes headingVariant', async () => {
    renderTimelines({ headingVariant: 'h2' })
    expect(await screen.findByRole('heading', { level: 2, name: 'My projects this week' })).toHaveClass('MuiTypography-h2')
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
