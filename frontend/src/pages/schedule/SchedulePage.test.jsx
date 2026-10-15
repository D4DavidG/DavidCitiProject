import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route } from 'react-router'
import SchedulePage from './SchedulePage'
import { makeTheme } from '../../theme/theme'
import { CHART_COLOURS } from '../../theme/chartColours'
import { page, renderAt, stubApi } from '../../test/utils'

const WEEKS = ['2026-10-12', '2026-10-19', '2026-10-26']
const apollo = (hours) => ({ projectId: 1, name: 'Apollo', hours })
const zeus = (hours) => ({ projectId: 2, name: 'Zeus', hours })
const hoursOf = (projects) => projects.reduce((sum, p) => sum + p.hours, 0)
function week(iso, projects) {
  const booked = hoursOf(projects)
  return { week: iso, bookedHours: booked, shownHours: booked, overAllocated: booked > 40, overByHours: Math.max(booked - 40, 0), projects }
}
/**
 * A person as the server sends them with projectIds: each week lists only the chosen projects,
 * with their hours as shownHours, while bookedHours, the over flag and over by still count every
 * booking (b676892), so choosing projects never hides that someone is over.
 */
function onlyProjects(person, ids) {
  return {
    ...person,
    weeks: person.weeks.map((w) => {
      const projects = w.projects.filter((p) => ids.includes(p.projectId))
      return { ...w, projects, shownHours: hoursOf(projects) }
    }),
  }
}
/** The server's answer for `people`, narrowed as above to the projectIds asked for; anyone with none of them drops out. */
const narrowed = (people) => ({ query }) => {
  const ids = query.projectIds?.split(',').map(Number)
  const shown = ids ? people.map((p) => onlyProjects(p, ids)).filter((p) => p.weeks.some((w) => w.projects.length)) : people
  return [200, { ...page(shown), weeks: WEEKS }]
}
// Ben: Apollo 25 h for two weeks then 10 h; Zeus 20 h for two weeks; 45 h (5 over) in each of the first two.
const BEN = {
  userId: 4, name: 'Ben Okafor', jobTitle: 'Developer', capacityHours: 40, status: 'OVER_ALLOCATED',
  weeks: [week(WEEKS[0], [apollo(25), zeus(20)]), week(WEEKS[1], [apollo(25), zeus(20)]), week(WEEKS[2], [apollo(10)])],
}
const CHLOE = {
  userId: 5, name: 'Chloe Kim', jobTitle: 'Analyst', capacityHours: 40, status: 'OK',
  weeks: [week(WEEKS[0], [zeus(30)]), week(WEEKS[1], [zeus(30)]), week(WEEKS[2], [])],
}
const DAN = {
  userId: 6, name: 'Dan Wu', jobTitle: 'Tester', capacityHours: 40, status: 'OK',
  weeks: WEEKS.map((w) => week(w, [])),
}

function renderSchedule(answer = () => [200, { ...page([BEN, CHLOE]), weeks: WEEKS }], theme = undefined) {
  const calls = stubApi({
    'GET /dashboard/allocation': answer,
    'GET /projects': [200, page([{ projectId: 1, name: 'Apollo' }, { projectId: 2, name: 'Zeus' }])],
  })
  renderAt(<SchedulePage />, {
    path: '/schedule',
    theme,
    extraRoutes: <Route path="/projects/:id" element={<p>Project page</p>} />,
  })
  return calls
}

/** Press Tab until `element` has focus (the controls come first). */
async function tabTo(element) {
  for (let i = 0; i < 40 && document.activeElement !== element; i += 1) await userEvent.tab()
  expect(element).toHaveFocus()
}

const bar = (name) => screen.findByRole('link', { name })
const colourOf = (link) => within(link).getByTestId('bar').style.backgroundColor
/** A colour as the browser writes it back (hex to rgb), so a check follows the theme's value. */
function asCss(colour) {
  const probe = document.createElement('div')
  probe.style.backgroundColor = colour
  return probe.style.backgroundColor
}
/** The last question to GET /dashboard/allocation (the project picker asks GET /projects too). */
const lastAllocation = (calls) => calls.filter((c) => c.path === '/dashboard/allocation').at(-1)
/** Choose a project in the picker by its name. */
async function choose(name) {
  await userEvent.click(screen.getByRole('combobox', { name: 'Projects' }))
  await userEvent.click(await screen.findByRole('option', { name }))
}

describe('SchedulePage', () => {
  it('draws a bar per project across the weeks it has hours, split where the hours change', async () => {
    renderSchedule()
    expect(await bar('Ben Okafor, Apollo, 25 hours a week, Oct 12 to Oct 25')).toHaveTextContent('Apollo · 25 h/wk')
    expect(screen.getByRole('link', { name: 'Ben Okafor, Apollo, 10 hours a week, Oct 26 to Nov 1' })).toHaveTextContent('Apollo · 10 h/wk')
    expect(screen.getByRole('link', { name: 'Ben Okafor, Zeus, 20 hours a week, Oct 12 to Oct 25' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Chloe Kim, Zeus, 30 hours a week, Oct 12 to Oct 25' })).toBeInTheDocument()
  })

  it('says "Week of" at the start of the row of week dates, in the dates\' caption style', async () => {
    renderSchedule()
    await bar(/Ben Okafor, Apollo, 25/)
    const weekOf = screen.getByTestId('week-of')
    expect(weekOf).toHaveTextContent(/^Week of$/)
    expect(weekOf).toHaveClass('MuiTypography-caption')
    // A block, as the dates are: an inline caption took the cell's taller line and sat 6 px below them.
    expect(weekOf).toHaveStyle({ display: 'block' })
  })

  it("places each bar on its own weeks (grid columns) and its project's lane (grid row)", async () => {
    renderSchedule()
    const place = (link) => { const s = getComputedStyle(link); return [s.gridColumn, s.gridRow] }
    // Column 1 is the name, so week 0 is column 2; a bar ends at the line after its last week.
    expect(place(await bar(/Ben Okafor, Apollo, 25/))).toEqual(['2/4', '1'])
    expect(place(screen.getByRole('link', { name: /Ben Okafor, Apollo, 10/ }))).toEqual(['4/5', '1'])
    expect(place(screen.getByRole('link', { name: /Ben Okafor, Zeus/ }))).toEqual(['2/4', '2'])
    expect(place(screen.getByRole('link', { name: /Chloe Kim, Zeus/ }))).toEqual(['2/4', '1'])
  })

  it('tabs through a person\'s bars lane by lane, then week by week, so focus never jumps between lanes', async () => {
    renderSchedule()
    await bar(/Ben Okafor, Apollo, 25/)
    const order = screen.getAllByRole('link', { name: /^Ben Okafor/ }).map((link) => link.getAttribute('aria-label'))
    expect(order).toEqual([
      'Ben Okafor, Apollo, 25 hours a week, Oct 12 to Oct 25',
      'Ben Okafor, Apollo, 10 hours a week, Oct 26 to Nov 1',
      'Ben Okafor, Zeus, 20 hours a week, Oct 12 to Oct 25',
    ])
  })

  it('colours a bar by its project, the same in every row', async () => {
    renderSchedule()
    const benZeus = await bar(/Ben Okafor, Zeus/)
    expect(colourOf(screen.getByRole('link', { name: /Ben Okafor, Apollo, 25/ }))).toBe(asCss(CHART_COLOURS.light.project[0]))
    expect(colourOf(benZeus)).toBe(colourOf(screen.getByRole('link', { name: /Chloe Kim, Zeus/ })))
  })

  it('takes the dark project colours in dark mode, and keeps the name column on the dark card', async () => {
    renderSchedule(undefined, makeTheme('dark'))
    expect(colourOf(await bar(/Ben Okafor, Apollo, 25/))).toBe(asCss(CHART_COLOURS.dark.project[0]))
    expect(colourOf(screen.getByRole('link', { name: /Ben Okafor, Zeus/ }))).toBe(asCss(CHART_COLOURS.dark.project[1]))
    expect(screen.getByText('Ben Okafor').parentElement).toHaveStyle({ backgroundColor: asCss(makeTheme('dark').palette.background.paper) })
  })

  it('draws bars square', async () => {
    renderSchedule()
    expect(within(await bar(/Ben Okafor, Apollo, 25/)).getByTestId('bar').style.borderRadius).toBe('0px')
  })

  it('keeps a project\'s colour when a filter or page leaves only other projects in view', async () => {
    renderSchedule(({ query }) => [200, { ...page(query.overOnly === 'true' ? [CHLOE] : [BEN, CHLOE]), weeks: WEEKS }])
    const before = colourOf(await bar(/Chloe Kim, Zeus/))
    await userEvent.click(screen.getByLabelText(/over capacity only/i))
    await waitFor(() => expect(screen.queryByText('Ben Okafor')).not.toBeInTheDocument())
    expect(colourOf(screen.getByRole('link', { name: /Chloe Kim, Zeus/ }))).toBe(before)
    expect(before).not.toBe(asCss(CHART_COLOURS.light.project[0])) // Zeus alone would have taken the first colour
  })

  it('names the project colours in a legend, with over capacity', async () => {
    renderSchedule()
    await bar(/Ben Okafor, Apollo, 25/)
    const legend = screen.getByRole('list', { name: 'Legend' })
    expect(within(legend).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Apollo', 'Zeus', 'Over capacity'])
  })

  it('leaves Over capacity out of the legend when no one shown is over', async () => {
    renderSchedule(() => [200, { ...page([CHLOE]), weeks: WEEKS }])
    await bar(/Chloe Kim, Zeus/)
    const legend = screen.getByRole('list', { name: 'Legend' })
    expect(within(legend).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Zeus'])
  })

  it('names a colour per project while the palette lasts, then the quiet Other with how many share it', async () => {
    const seven = [1, 2, 3, 4, 5, 6, 7].map((id) => ({ projectId: id, name: `P${id}`, hours: 6 })) // 42 h: over
    const busy = { ...BEN, weeks: WEEKS.map((w) => week(w, seven)) }
    renderSchedule(() => [200, { ...page([busy]), weeks: WEEKS }])
    await bar(/Ben Okafor, P7/)
    const named = CHART_COLOURS.light.project.length // 4 since spec 6.1 took the green out
    const legend = screen.getByRole('list', { name: 'Legend' })
    expect(within(legend).getAllByRole('listitem').map((li) => li.textContent))
      .toEqual([...seven.slice(0, named).map((p) => p.name), `Other (${7 - named})`, 'Over capacity'])
  })

  it('marks an over-capacity week with words, the warning icon and a red outline', async () => {
    renderSchedule()
    await bar(/Ben Okafor, Apollo, 25/)
    const over = screen.getAllByText('+5 h over')
    expect(over).toHaveLength(2)
    const words = over[0].closest('[data-testid="over-words"]')
    expect(words).toHaveTextContent('Week of Oct 12: 45 of 40 hours booked, +5 h over')
    expect(within(words).getByTestId('WarningAmberRoundedIcon')).toBeInTheDocument()
    expect(document.querySelectorAll('[data-state="over"]')).toHaveLength(2)
  })

  it('says when someone has nothing booked', async () => {
    renderSchedule(() => [200, { ...page([DAN]), weeks: WEEKS }])
    expect(await screen.findByText('Not booked')).toBeInTheDocument()
  })

  it('lets the keyboard reach the scrolling weeks even when no bar can take focus', async () => {
    renderSchedule(() => [200, { ...page([DAN]), weeks: WEEKS }])
    await screen.findByText('Not booked')
    expect(screen.getByRole('region', { name: 'Weeks, scrolls sideways' })).toHaveAttribute('tabindex', '0')
  })

  it('shows project, hours and dates in a tooltip on hover', async () => {
    renderSchedule()
    await userEvent.hover(await bar(/Ben Okafor, Apollo, 25/))
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Apollo · 25 h/wk · Oct 12 – Oct 25')
  })

  it('shows the same tooltip when a bar gets keyboard focus', async () => {
    // jsdom says :focus-visible only for a test's first Tab; a browser says it for every keyboard
    // focus (e2e/schedule.spec.js checks there). So answer as a browser would.
    const matches = Element.prototype.matches
    vi.spyOn(Element.prototype, 'matches').mockImplementation(function focusVisible(selector) {
      return selector === ':focus-visible' ? this === document.activeElement : matches.call(this, selector)
    })
    renderSchedule()
    await tabTo(await bar(/Ben Okafor, Zeus/))
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Zeus · 20 h/wk · Oct 12 – Oct 25')
  })

  it('on a phone, shows the tooltip on the first tap and opens the project on the second', async () => {
    renderSchedule()
    const link = await bar(/Ben Okafor, Zeus/)
    fireEvent.touchStart(link)
    fireEvent.click(link)
    expect(await screen.findByRole('tooltip', {}, { timeout: 200 })).toHaveTextContent('Zeus · 20 h/wk · Oct 12 – Oct 25')
    expect(screen.queryByText('Project page')).not.toBeInTheDocument()
    fireEvent.touchStart(link)
    fireEvent.click(link)
    expect(await screen.findByText('Project page')).toBeInTheDocument()
  })

  it('opens the project when a bar is clicked', async () => {
    renderSchedule()
    await userEvent.click(await bar(/Ben Okafor, Zeus/))
    expect(await screen.findByText('Project page')).toBeInTheDocument()
  })

  it('opens the project when Enter is pressed on a bar', async () => {
    renderSchedule()
    await tabTo(await bar(/Ben Okafor, Apollo, 25/))
    await userEvent.keyboard('{Enter}')
    expect(await screen.findByText('Project page')).toBeInTheDocument()
  })

  it('moves with Earlier, Later and This week, filled buttons (spec 6.2), Earlier and Later with their arrows', async () => {
    renderSchedule()
    await bar(/Ben Okafor, Apollo, 25/)
    const earlier = screen.getByRole('button', { name: 'Earlier' })
    const later = screen.getByRole('button', { name: 'Later' })
    const thisWeek = screen.getByRole('button', { name: 'This week' })
    for (const button of [earlier, later, thisWeek]) expect(button).toHaveClass('MuiButton-contained', 'MuiButton-colorPrimary')
    expect(within(earlier).getByTestId('ChevronLeftIcon')).toBeInTheDocument()
    expect(within(later).getByTestId('ChevronRightIcon')).toBeInTheDocument()
  })

  it('gives a bar the site\'s one focus ring (the theme\'s), not a ring of its own', async () => {
    renderSchedule()
    const scope = [...(await bar(/Ben Okafor, Apollo, 25/)).classList].find((name) => name.startsWith('css-'))
    const css = [...document.querySelectorAll('style')].map((tag) => tag.textContent).join('')
    expect(css).not.toContain(`.${scope}:focus-visible`)
  })

  it('asks for 8 weeks from this week, then moves a week at a time', async () => {
    const calls = renderSchedule()
    await bar(/Ben Okafor, Apollo, 25/)
    expect(calls[0].query).toMatchObject({ weeks: '8', page: '1' })
    expect(calls[0].query.weekFrom).toBeUndefined()
    await userEvent.click(screen.getByRole('button', { name: 'Later' }))
    await waitFor(() => expect(calls.at(-1).query.weekFrom).toBe('2026-10-19'))
    await userEvent.click(screen.getByRole('button', { name: 'Earlier' }))
    await waitFor(() => expect(calls.at(-1).query.weekFrom).toBe('2026-10-12'))
    await userEvent.click(screen.getByRole('button', { name: /this week/i }))
    await waitFor(() => expect(calls.at(-1).query.weekFrom).toBeUndefined())
  })

  it('shows 8, 13 or 26 weeks, chosen in a Weeks shown field like the other filters', async () => {
    const calls = renderSchedule()
    await bar(/Ben Okafor, Apollo, 25/)
    const field = screen.getByRole('combobox', { name: 'Weeks shown' })
    expect(field).toHaveTextContent('8 weeks')
    await userEvent.click(field)
    await userEvent.click(await screen.findByRole('option', { name: '13 weeks' }))
    await waitFor(() => expect(lastAllocation(calls).query.weeks).toBe('13'))
    expect(field).toHaveTextContent('13 weeks')
    await userEvent.click(field)
    await userEvent.click(await screen.findByRole('option', { name: '26 weeks' }))
    await waitFor(() => expect(lastAllocation(calls).query.weeks).toBe('26'))
  })

  it('has no outline-only buttons: no toggle group, and every button with words is filled (spec 6.2)', async () => {
    renderSchedule()
    await bar(/Ben Okafor, Apollo, 25/)
    expect(document.querySelector('.MuiToggleButton-root, .MuiToggleButtonGroup-root')).toBeNull()
    const buttons = [...document.querySelectorAll('.MuiButton-root')]
    expect(buttons.length).toBeGreaterThan(0)
    for (const button of buttons) expect(button).toHaveClass('MuiButton-contained')
  })

  it('asks the server for over-capacity people only when the switch is on', async () => {
    const calls = renderSchedule()
    await bar(/Ben Okafor, Apollo, 25/)
    await userEvent.click(screen.getByLabelText(/over capacity only/i))
    await waitFor(() => expect(calls.at(-1).query.overOnly).toBe('true'))
  })

  it('pages by person', async () => {
    const calls = renderSchedule(() => [200, { ...page([BEN], { total: 30, totalPages: 2 }), weeks: WEEKS }])
    await bar(/Ben Okafor, Apollo, 25/)
    await userEvent.click(screen.getByRole('button', { name: /page 2/i }))
    await waitFor(() => expect(calls.at(-1).query.page).toBe('2'))
  })

  it('goes back to page 1 when the weeks change, since who is worst depends on them', async () => {
    const calls = renderSchedule(() => [200, { ...page([BEN], { total: 30, totalPages: 2 }), weeks: WEEKS }])
    await bar(/Ben Okafor, Apollo, 25/)
    await userEvent.click(screen.getByRole('button', { name: /page 2/i }))
    await waitFor(() => expect(calls.at(-1).query.page).toBe('2'))
    await userEvent.click(screen.getByRole('button', { name: 'Later' }))
    await waitFor(() => expect(calls.at(-1).query.weekFrom).toBe('2026-10-19'))
    expect(calls.at(-1).query.page).toBe('1')
  })

  it('filters by project: asks the server for only those projects\' bookings, from page 1', async () => {
    const calls = renderSchedule(() => [200, { ...page([BEN], { total: 30, totalPages: 2 }), weeks: WEEKS }])
    await bar(/Ben Okafor, Apollo, 25/)
    expect(lastAllocation(calls).query.projectIds).toBeUndefined()
    await userEvent.click(screen.getByRole('button', { name: /page 2/i }))
    await waitFor(() => expect(lastAllocation(calls).query.page).toBe('2'))
    await choose('Zeus')
    await waitFor(() => expect(lastAllocation(calls).query).toMatchObject({ projectIds: '2', page: '1' }))
    await choose('Apollo')
    await waitFor(() => expect(lastAllocation(calls).query.projectIds).toBe('2,1'))
  })

  it('shows everyone again when the last chosen project is taken off', async () => {
    const calls = renderSchedule()
    await bar(/Ben Okafor, Apollo, 25/)
    await choose('Zeus')
    await waitFor(() => expect(lastAllocation(calls).query.projectIds).toBe('2'))
    await userEvent.click(within(screen.getByRole('button', { name: 'Zeus' })).getByTestId('CancelIcon'))
    await waitFor(() => expect(lastAllocation(calls).query.projectIds).toBeUndefined())
  })

  it('says when no one is booked on the chosen projects', async () => {
    renderSchedule(({ query }) => [200, { ...page(query.projectIds ? [] : [CHLOE]), weeks: WEEKS }])
    await bar(/Chloe Kim, Zeus/)
    await choose('Apollo')
    expect(await screen.findByText('No one is booked on the chosen projects in these weeks.')).toBeInTheDocument()
  })

  it('says, with projects chosen, that over capacity still counts all their projects (the server counts every booking)', async () => {
    // Ben with Apollo chosen: one 25 h bar, yet 45 h booked in all (20 h on Zeus), so his weeks are still over.
    renderSchedule(narrowed([BEN, CHLOE]))
    await bar(/Ben Okafor, Apollo, 25/)
    expect(screen.getByText('1 of 2 people shown are booked past capacity in at least one of these weeks.')).toBeInTheDocument()
    await choose('Apollo')
    expect(await screen.findByText('1 of 1 people shown are booked past capacity in at least one of these weeks, counting all their projects, not only the chosen ones.')).toBeInTheDocument()
    expect(screen.queryByText(/chosen projects alone/)).not.toBeInTheDocument()
  })

  it('says no one shown is over, counting all their projects, when projects are chosen and no one is', async () => {
    renderSchedule(narrowed([CHLOE]))
    await bar(/Chloe Kim, Zeus/)
    expect(screen.getByText('No one shown is booked past capacity in these weeks.')).toBeInTheDocument()
    await choose('Zeus')
    expect(await screen.findByText('No one shown is booked past capacity in these weeks, counting all their projects, not only the chosen ones.')).toBeInTheDocument()
  })

  it('with projects chosen, says in an over week the hours booked in all and the hours on the chosen projects', async () => {
    renderSchedule(narrowed([BEN, CHLOE]))
    await bar(/Ben Okafor, Zeus/)
    await choose('Apollo')
    await waitFor(() => expect(screen.queryByRole('link', { name: /Ben Okafor, Zeus/ })).not.toBeInTheDocument())
    const words = screen.getAllByTestId('over-words')
    expect(words).toHaveLength(2) // still over: the Zeus hours count though their bar is not drawn
    expect(words[0]).toHaveTextContent('Week of Oct 12: 45 of 40 hours booked in all, 25 on the chosen projects, +5 h over')
    expect(words[1]).toHaveTextContent('Week of Oct 19: 45 of 40 hours booked in all, 25 on the chosen projects, +5 h over')
  })

  it('leaves out the chosen-projects hours when every booked hour is on them', async () => {
    const calls = renderSchedule(narrowed([BEN]))
    await bar(/Ben Okafor, Zeus/)
    await choose('Apollo')
    await choose('Zeus')
    await waitFor(() => expect(lastAllocation(calls).query.projectIds).toBe('1,2'))
    expect(await bar(/Ben Okafor, Zeus/)).toBeInTheDocument()
    expect(screen.getAllByTestId('over-words')[0]).toHaveTextContent(/^Week of Oct 12: 45 of 40 hours booked, \+5 h over$/)
  })

  it('says so when there is no one to show', async () => {
    renderSchedule(({ query }) => [200, { ...page(query.overOnly === 'true' ? [] : [CHLOE]), weeks: WEEKS }])
    await bar(/Chloe Kim, Zeus/)
    await userEvent.click(screen.getByLabelText(/over capacity only/i))
    expect(await screen.findByText(/no one is over capacity in these weeks/i)).toBeInTheDocument()
  })

  it('shows the server\'s error with a Retry button', async () => {
    renderSchedule(() => [500, { error: 'The database is waking up.' }])
    expect(await screen.findByText('The database is waking up.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
  })

  it('has a heading for the grid and labels the weeks', async () => {
    renderSchedule()
    await bar(/Ben Okafor, Apollo, 25/)
    expect(screen.getByRole('figure', { name: /bookings, week by week/i })).toBeInTheDocument()
    expect(screen.getByText('Oct 26')).toBeInTheDocument()
  })
})
