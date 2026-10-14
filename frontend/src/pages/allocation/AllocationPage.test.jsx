import { describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AllocationPage from './AllocationPage'
import { page, renderAt, stubApi } from '../../test/utils'

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

function renderGrid(answer = () => [200, { ...page([BEN, CHLOE]), weeks: WEEKS }]) {
  const calls = stubApi({ 'GET /dashboard/allocation': answer })
  renderAt(<AllocationPage />, { path: '/allocation' })
  return calls
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

  it('explains the colours', async () => {
    renderGrid()
    await screen.findByRole('row', { name: /Ben Okafor/ })
    expect(screen.getByText(/booked past capacity/i)).toBeInTheDocument()
  })
})
