import { describe, expect, it } from 'vitest'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AllocationPage from './AllocationPage'
import { holdOpen, page, renderAt, stubApi } from '../../test/utils'

const WEEKS = ['2026-10-12', '2026-10-19']
function week(iso, booked, projects, extra = {}) {
  return {
    week: iso, bookedHours: booked, projectCount: projects.length, overAllocated: booked > 40,
    overByHours: Math.max(booked - 40, 0), projects, loggedMinutes: 0, loggedHours: 0, overtime: false, ...extra,
  }
}
const BEN = {
  userId: 4, name: 'Ben Okafor', jobTitle: 'Developer', capacityHours: 40, overtimeAllowed: false,
  peakOverByHours: 5, status: 'OVER_ALLOCATED',
  weeks: [
    week('2026-10-12', 45, [{ projectId: 1, name: 'Apollo', hours: 25 }, { projectId: 2, name: 'Zeus', hours: 20 }]),
    week('2026-10-19', 25, [{ projectId: 1, name: 'Apollo', hours: 25 }]),
  ],
}
const CHLOE = {
  userId: 5, name: 'Chloe Kim', jobTitle: 'Analyst', capacityHours: 40, overtimeAllowed: true,
  peakOverByHours: 0, status: 'OK',
  weeks: [
    week('2026-10-12', 30, [{ projectId: 2, name: 'Zeus', hours: 30 }], { loggedMinutes: 3000, loggedHours: 50, overtime: true }),
    week('2026-10-19', 0, []),
  ],
}

/** Ben's full account record, as GET /users/4 returns it; Maria (the default signed-in manager) is his line manager. */
const BEN_RECORD = { userId: 4, username: 'BO435681', firstName: 'Ben', lastName: 'Okafor', email: 'ben.okafor@acme.test', role: 'EMPLOYEE', jobTitle: 'Developer', managerId: 2, weeklyCapacityHours: 40, overtimeAllowed: false, taskLimit: 2, isArchived: false }

function renderGrid(answer = () => [200, { ...page([BEN, CHLOE]), weeks: WEEKS }], answers = {}) {
  const calls = stubApi({ 'GET /dashboard/allocation': answer, ...answers })
  renderAt(<AllocationPage />, { path: '/allocation' })
  return calls
}

/** "How to read this" is folded away by default; open it and return its region. */
async function openHelp() {
  await userEvent.click(screen.getByRole('button', { name: 'How to read this' }))
  return screen.findByRole('region', { name: 'How to read this' })
}

describe('AllocationPage', () => {
  it('shows one row per person with their capacity and status', async () => {
    renderGrid()
    const row = await screen.findByRole('row', { name: /Ben Okafor/ })
    expect(within(row).getByText('Developer')).toBeInTheDocument()
    expect(within(row).getByText('Over-allocated')).toBeInTheDocument()
    expect(within(screen.getByRole('row', { name: /Chloe Kim/ })).getByText('OK')).toBeInTheDocument()
  })

  it('shows booked against capacity in each week, red when over', async () => {
    renderGrid()
    const row = await screen.findByRole('row', { name: /Ben Okafor/ })
    const over = within(row).getByText('45 / 40 h').closest('[data-over]')
    expect(over).toHaveAttribute('data-over', 'true')
    expect(within(row).getByText('+5 h over')).toBeInTheDocument()
    expect(within(row).getByText('25 / 40 h').closest('[data-over]')).toHaveAttribute('data-over', 'false')
  })

  it('says which projects the hours come from', async () => {
    renderGrid()
    const row = await screen.findByRole('row', { name: /Ben Okafor/ })
    expect(within(row).getByLabelText(/week of oct 12: 45 of 40 hours booked \(apollo 25 h, zeus 20 h\)/i)).toBeInTheDocument()
    await userEvent.hover(within(row).getByText('45 / 40 h'))
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Apollo 25 h, Zeus 20 h')
  })

  it('opens the project breakdown on a tap, for phones (no hover)', async () => {
    renderGrid()
    const row = await screen.findByRole('row', { name: /Ben Okafor/ })
    fireEvent.touchStart(within(row).getByText('45 / 40 h'))
    expect(await screen.findByRole('tooltip', {}, { timeout: 200 })).toHaveTextContent('Apollo 25 h, Zeus 20 h')
  })

  it('marks weeks logged past capacity as overtime', async () => {
    renderGrid()
    const row = await screen.findByRole('row', { name: /Chloe Kim/ })
    expect(within(row).getByText(/logged 50 h · overtime/i)).toBeInTheDocument()
  })

  it('labels the week columns', async () => {
    renderGrid()
    expect(await screen.findByRole('columnheader', { name: /week of oct 12/i })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /week of oct 19/i })).toBeInTheDocument()
  })

  it('asks the server for over-allocated people only when the switch is on', async () => {
    const calls = renderGrid()
    await screen.findByRole('row', { name: /Ben Okafor/ })
    await userEvent.click(screen.getByLabelText(/only over-allocated/i))
    await waitFor(() => expect(calls.at(-1).query.overOnly).toBe('true'))
  })

  it('moves a week at a time', async () => {
    const calls = renderGrid()
    await screen.findByRole('row', { name: /Ben Okafor/ })
    await userEvent.click(screen.getByRole('button', { name: /next week/i }))
    await waitFor(() => expect(calls.at(-1).query.weekFrom).toBe('2026-10-19'))
    await userEvent.click(screen.getByRole('button', { name: /previous week/i }))
    await waitFor(() => expect(calls.at(-1).query.weekFrom).toBe('2026-10-12'))
  })

  it('treats a week with nobody over capacity as good news', async () => {
    renderGrid(({ query }) => [200, { ...page(query.overOnly === 'true' ? [] : [CHLOE]), weeks: WEEKS }])
    await screen.findByRole('row', { name: /Chloe Kim/ })
    await userEvent.click(screen.getByLabelText(/only over-allocated/i))
    expect(await screen.findByText(/no one is over capacity in these weeks/i)).toBeInTheDocument()
  })

  it('folds "How to read this" away by default, and opens it to plain words', async () => {
    renderGrid()
    await screen.findByRole('row', { name: /Ben Okafor/ })
    const summary = screen.getByRole('button', { name: 'How to read this' })
    expect(summary).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText(/each row is a person and each column is a week/i)).not.toBeInTheDocument()
    const panel = await openHelp()
    expect(summary).toHaveAttribute('aria-expanded', 'true')
    expect(within(panel).getByText(/each row is a person and each column is a week/i)).toBeInTheDocument()
    expect(within(panel).getByText(/booked against that person's weekly capacity/i)).toBeInTheDocument()
    expect(within(panel).getByText(/red with a warning icon means they are over capacity/i)).toBeInTheDocument()
    expect(within(panel).getByText(/spot overbooking before it happens/i)).toBeInTheDocument()
  })

  it('titles the dropdown as a level-2 heading with the h3 look', async () => {
    renderGrid()
    await screen.findByRole('row', { name: /Ben Okafor/ })
    const title = screen.getByRole('heading', { level: 2, name: 'How to read this' })
    expect(within(title).getByText('How to read this')).toHaveClass('MuiTypography-h3')
  })

  it('draws "This week" as a filled button', async () => {
    renderGrid()
    await screen.findByRole('row', { name: /Ben Okafor/ })
    expect(screen.getByRole('button', { name: 'This week' })).toHaveClass('MuiButton-contained')
  })

  it('shows the "How to read this" dropdown while the grid is still loading', async () => {
    stubApi({ 'GET /dashboard/allocation': [200, { ...page([BEN]), weeks: WEEKS }] })
    const release = holdOpen('/dashboard/allocation')
    renderAt(<AllocationPage />, { path: '/allocation' })
    expect(screen.getByRole('button', { name: 'How to read this' })).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    release()
    expect(await screen.findByRole('table')).toBeInTheDocument()
  })

  it('has a one-line legend for the two warnings inside the dropdown', async () => {
    renderGrid()
    await screen.findByRole('row', { name: /Ben Okafor/ })
    const panel = await openHelp()
    const legend = within(panel).getByRole('group', { name: 'Legend' })
    expect(within(legend).getByText('Booked past capacity')).toBeInTheDocument()
    expect(within(legend).getByText('Logged past capacity (overtime)')).toBeInTheDocument()
  })

  it('searches people on the server as you type, from page 1', async () => {
    const calls = renderGrid(() => [200, { ...page([BEN, CHLOE], { totalPages: 3 }), weeks: WEEKS }])
    await screen.findByRole('row', { name: /Ben Okafor/ })
    await userEvent.click(screen.getByRole('button', { name: /go to page 2/i }))
    await waitFor(() => expect(calls.at(-1).query.page).toBe('2'))
    await userEvent.type(screen.getByRole('textbox', { name: 'Search people' }), 'ben')
    await waitFor(() => expect(calls.at(-1).query).toMatchObject({ q: 'ben', page: '1' }))
  })

  it('says so when a search finds nobody', async () => {
    renderGrid(({ query }) => [200, { ...page(query.q ? [] : [BEN]), weeks: WEEKS }])
    await screen.findByRole('row', { name: /Ben Okafor/ })
    await userEvent.type(screen.getByRole('textbox', { name: 'Search people' }), 'zzz{Enter}')
    expect(await screen.findByText('Nobody matches that search.')).toBeInTheDocument()
  })

  it("opens a person's People actions from their name, and redraws the grid after a change", async () => {
    const calls = renderGrid(undefined, {
      'GET /users/4': [200, BEN_RECORD],
      'PATCH /users/4/capacity': [200, { ...BEN_RECORD, weeklyCapacityHours: 45 }],
    })
    const row = await screen.findByRole('row', { name: /Ben Okafor/ })
    const name = within(row).getByRole('button', { name: 'Actions for Ben Okafor' })
    expect(name).toHaveTextContent(/^Ben Okafor$/)
    await userEvent.click(name)
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Capacity, overtime and task limit' }))
    const hours = await screen.findByLabelText(/weekly capacity/i)
    await userEvent.clear(hours)
    await userEvent.type(hours, '45')
    const gridsBefore = calls.filter((c) => c.path === '/dashboard/allocation').length
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(calls.find((c) => c.method === 'PATCH').body).toEqual({ weeklyCapacityHours: 45 }))
    await waitFor(() => expect(calls.filter((c) => c.path === '/dashboard/allocation').length).toBeGreaterThan(gridsBefore))
  })

  it('marks an over-capacity week with an icon as well as red, and an ordinary week with none', async () => {
    renderGrid()
    const ben = await screen.findByRole('row', { name: /Ben Okafor/ })
    const over = within(ben).getByText('45 / 40 h').closest('[data-over]')
    expect(within(over).getByTestId('WarningAmberOutlinedIcon')).toBeInTheDocument()
    const fine = within(ben).getByText('25 / 40 h').closest('[data-over]')
    expect(within(fine).queryByTestId('WarningAmberOutlinedIcon')).not.toBeInTheDocument()
  })
})
