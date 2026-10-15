import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { ThemeProvider } from '@mui/material/styles'
import theme, { makeTheme } from '../../theme/theme'
import WorkloadChart from './WorkloadChart'

const week = (bookedHours, overByHours, projects) => ({
  week: '2026-10-12', bookedHours, overByHours, overAllocated: overByHours > 0, projects,
})
const BEN = {
  userId: 4, name: 'Ben Okafor', capacityHours: 40, peakOverByHours: 5,
  weeks: [week(45, 5, [{ projectId: 1, name: 'Apollo', hours: 25 }, { projectId: 2, name: 'Zeus', hours: 20 }])],
}
const ANA = {
  userId: 3, name: 'Ana Ruiz', capacityHours: 40, peakOverByHours: 0,
  weeks: [week(30, 0, [{ projectId: 1, name: 'Apollo', hours: 30 }])],
}
const DEV = {
  userId: 5, name: 'Dev Shah', capacityHours: 20, peakOverByHours: 0,
  weeks: [week(0, 0, [])],
}

function draw(people, total = people.length, chosen = theme) {
  return render(<ThemeProvider theme={chosen}><WorkloadChart people={people} total={total} /></ThemeProvider>)
}

const row = (name) => screen.getByRole('img', { name: new RegExp(` · ${name}$`) })
const width = (el) => parseFloat(el.style.width)
const left = (el) => parseFloat(el.style.left)

describe('WorkloadChart', () => {
  it('takes the dark set in dark mode: project colours, red, the capacity line and the card', () => {
    draw([BEN, ANA, DEV], 3, makeTheme('dark'))
    const ben = row('Ben Okafor')
    const [apollo, zeus] = within(ben).getAllByTestId('segment')
    expect(apollo).toHaveStyle({ backgroundColor: '#3987e5' })
    expect(zeus).toHaveStyle({ backgroundColor: '#c98500', borderLeft: '2px solid #212D23' }) // the gap is the dark card
    expect(within(ben).getByTestId('over')).toHaveStyle({ backgroundColor: '#FF5A5A' })
    expect(within(ben).getByTestId('capacity')).toHaveStyle({ background: '#ECEEE6' })
    expect(screen.getByRole('figure')).toHaveStyle({ backgroundColor: 'rgb(33, 45, 35)' })
  })

  it('draws a row per person, in server order, each with its sentence', () => {
    draw([BEN, ANA, DEV])
    expect(screen.getByRole('figure', { name: 'Workload this week · all projects' })).toBeInTheDocument()
    expect(screen.getAllByRole('img').map((r) => r.getAttribute('aria-label'))).toEqual([
      '45 h booked, capacity 40 h, +5 h over · Apollo 25 h, Zeus 20 h · Ben Okafor',
      '30 h booked, capacity 40 h · Apollo 30 h · Ana Ruiz',
      '0 h booked, capacity 20 h · Not booked · Dev Shah',
    ])
  })

  it('colours a project the same in every bar and fills to capacity, then red', () => {
    draw([BEN, ANA, DEV])
    const ben = row('Ben Okafor')
    const [apollo, zeus] = within(ben).getAllByTestId('segment')
    expect(within(ben).getAllByTestId('segment')).toHaveLength(2)
    expect(apollo).toHaveStyle({ backgroundColor: '#1c5cab' })
    expect(width(apollo)).toBeCloseTo(41.67, 2)
    expect(zeus).toHaveStyle({ backgroundColor: '#eda100' })
    expect(left(zeus)).toBeCloseTo(41.67, 2)
    expect(width(zeus)).toBeCloseTo(25, 2) // 15 h fill Ben up to his 40 h
    const over = within(ben).getByTestId('over')
    expect(over).toHaveAttribute('data-state', 'over')
    expect(over).toHaveStyle({ backgroundColor: '#C21F1F' })
    expect(left(over)).toBeCloseTo(66.67, 2)
    expect(width(over)).toBeCloseTo(8.33, 2)
    expect(within(ben).getByText('+5 h over')).toBeInTheDocument()
    // role="img" hides the row's own text from screen readers, so its name must carry the words too.
    expect(ben).toHaveAccessibleName(/^45 h booked, capacity 40 h, \+5 h over · /)
    expect(within(ben).getByTestId('WarningAmberRoundedIcon')).toBeInTheDocument()
    expect(within(ben).getByText('45 / 40 h')).toBeInTheDocument()
    expect(left(within(ben).getByTestId('capacity'))).toBeCloseTo(66.67, 2)

    const ana = row('Ana Ruiz')
    expect(within(ana).getByTestId('segment')).toHaveStyle({ backgroundColor: '#1c5cab' })
    expect(within(ana).queryByTestId('over')).toBeNull()
    expect(left(within(ana).getByTestId('capacity'))).toBeCloseTo(66.67, 2)

    const dev = row('Dev Shah')
    expect(within(dev).queryByTestId('segment')).toBeNull()
    expect(within(dev).getByText('Not booked')).toBeInTheDocument()
    expect(within(dev).getByText('0 / 20 h')).toBeInTheDocument()
    expect(left(within(dev).getByTestId('capacity'))).toBeCloseTo(33.33, 2)
  })

  it('runs the hour axis to the next 20 h past the largest booking or capacity, never under 20 h', () => {
    draw([BEN, ANA, DEV])
    const axis = screen.getByTestId('hour-axis')
    expect(within(axis).getAllByText(/ h$/).map((t) => t.textContent)).toEqual(['0 h', '20 h', '40 h', '60 h'])
  })

  it('keeps a 20 h axis when nobody is booked or able to work much', () => {
    draw([{ ...DEV, capacityHours: 8 }])
    expect(within(screen.getByTestId('hour-axis')).getAllByText(/ h$/).map((t) => t.textContent)).toEqual(['0 h', '20 h'])
    expect(left(screen.getByTestId('capacity'))).toBeCloseTo(40, 2)
  })

  it('folds the 5th project and later into Other, and lists them all in the sentence', () => {
    const projects = [1, 2, 3, 4, 5, 6, 7].map((id) => ({ projectId: id, name: `P${id}`, hours: 2 }))
    draw([{ ...ANA, weeks: [week(14, 0, projects)] }])
    const legend = screen.getByRole('list', { name: 'Legend' })
    expect(within(legend).getAllByRole('listitem').map((li) => li.textContent))
      .toEqual(['P1', 'P2', 'P3', 'P4', 'Other (3)', 'Over capacity', 'Capacity'])
    const segments = within(row('Ana Ruiz')).getAllByTestId('segment')
    expect(segments).toHaveLength(5)
    expect(segments.at(-1)).toHaveStyle({ backgroundColor: '#D6DACB' })
    expect(width(segments.at(-1))).toBeCloseTo(15, 2) // 6 h of a 40 h axis
    expect(row('Ana Ruiz')).toHaveAttribute(
      'aria-label',
      '14 h booked, capacity 40 h · P1 2 h, P2 2 h, P3 2 h, P4 2 h, P5 2 h, P6 2 h, P7 2 h · Ana Ruiz',
    )
  })

  it('keys two projects with the same name apart in the legend', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    draw([{ ...ANA, weeks: [week(20, 0, [{ projectId: 1, name: 'Apollo', hours: 10 }, { projectId: 9, name: 'Apollo', hours: 10 }])] }])
    const legend = screen.getByRole('list', { name: 'Legend' })
    expect(within(legend).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Apollo', 'Apollo', 'Over capacity', 'Capacity'])
    expect(errors).not.toHaveBeenCalled()
    errors.mockRestore()
  })

  it('sums up who is over, or says no one is', () => {
    const { unmount } = draw([BEN, ANA, DEV])
    expect(screen.getByText('1 person is over capacity this week: Ben Okafor, +5 h.')).toBeInTheDocument()
    const legend = screen.getByRole('list', { name: 'Legend' })
    expect(within(legend).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Apollo', 'Zeus', 'Over capacity', 'Capacity'])
    unmount()

    const CHLOE = { ...ANA, userId: 6, name: 'Chloe Kim', weeks: [week(42, 2, [{ projectId: 2, name: 'Zeus', hours: 42 }])] }
    const second = draw([BEN, CHLOE])
    expect(screen.getByText('2 people are over capacity this week: Ben Okafor, +5 h; Chloe Kim, +2 h.')).toBeInTheDocument()
    second.unmount()

    const { container } = draw([ANA, DEV])
    expect(screen.getByText('No one is over capacity this week.')).toBeInTheDocument()
    expect(container.querySelector('[data-state="over"]')).toBeNull()
  })

  it('says how many people are shown when there are more than 8', () => {
    draw([BEN, ANA, DEV], 12)
    expect(screen.getByText('Showing 3 of 12 people, most over first.')).toBeInTheDocument()
  })

  it('says nothing about missing people when everyone is shown', () => {
    draw([BEN, ANA, DEV], 3)
    expect(screen.queryByText(/^Showing /)).toBeNull()
  })
})
