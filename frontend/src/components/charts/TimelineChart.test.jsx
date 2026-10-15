import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { ThemeProvider } from '@mui/material/styles'
import theme, { makeTheme } from '../../theme/theme'
import { BUILD, DESIGN } from '../../pages/projects/fixtures'
import TimelineChart from './TimelineChart'

const MIGRATION = { ...BUILD, milestoneId: 13, name: 'Migration', startDate: '2026-08-14', dueDate: '2026-10-10' }

function draw({ deliverables = [DESIGN, BUILD, MIGRATION], today = '2026-10-14', chosen = theme } = {}) {
  return render(
    <ThemeProvider theme={chosen}>
      <TimelineChart deliverables={deliverables} edges={[{ from: 11, to: 10 }]} projectStart="2026-10-01" projectEnd="2026-12-31" today={today} />
    </ThemeProvider>,
  )
}

const row = (name) => screen.getByRole('img', { name: new RegExp(` · ${name} · `) })

describe('TimelineChart', () => {
  it('draws the Today line gold', () => {
    draw()
    expect(screen.getByTestId('today')).toHaveStyle({ background: '#8A6100' })
  })

  it('takes the dark set in dark mode', () => {
    draw({ chosen: makeTheme('dark') })
    expect(within(row('Design')).getByTestId('fill')).toHaveStyle({ background: '#8FD3A0' })
    expect(within(row('Migration')).getByTestId('fill')).toHaveStyle({ background: '#FF5A5A' })
    expect(screen.getByTestId('today')).toHaveStyle({ background: '#FFD54A' })
    expect(within(row('Build')).getByText('Build · after Design')).toHaveStyle({ backgroundColor: 'rgb(33, 45, 35)' })
  })

  it('draws bars square', () => {
    draw()
    expect(within(row('Build')).getByTestId('bar').style.borderRadius).toBe('0px')
  })

  it('draws a row per deliverable, value first in its sentence', () => {
    draw()
    expect(screen.getAllByRole('img').map((r) => r.getAttribute('aria-label'))).toEqual([
      '100% done · Design · Oct 1 – Oct 6, 2026 · Done',
      '0% done · Build · Oct 1 – Nov 12, 2026 · In progress · after Design',
      '0% done · Migration · Aug 14 – Oct 10, 2026 · Late · was due Sat, Oct 10 · today is Wed, Oct 14 · 4 days late · Outside project dates',
    ])
    expect(within(row('Build')).getByText('Build · after Design')).toBeInTheDocument()
  })

  it('fills each bar to its progress', () => {
    draw()
    expect(within(row('Design')).getByTestId('fill')).toHaveStyle({ width: '100%' })
    expect(within(row('Build')).getByTestId('fill')).toHaveStyle({ width: '0%' })
  })

  it('marks a past-due, unsigned deliverable Late with the icon; a done one stays Done', () => {
    draw()
    const late = row('Migration')
    expect(within(late).getByText('Late, 0%')).toBeInTheDocument()
    expect(within(late).getByTestId('WarningAmberRoundedIcon')).toBeInTheDocument()
    expect(within(late).getByTestId('bar')).toHaveAttribute('data-state', 'late')
    expect(within(row('Design')).getByText('Done')).toBeInTheDocument()
    expect(within(row('Design')).getByTestId('bar')).not.toHaveAttribute('data-state')
  })

  it('says when a deliverable sits outside the project dates', () => {
    draw()
    expect(within(row('Migration')).getByText('Outside project dates')).toBeInTheDocument()
    // role="img" hides the row's own text from screen readers, so its name must carry the words too.
    expect(row('Migration')).toHaveAccessibleName(/ · Outside project dates$/)
    expect(within(row('Build')).queryByText('Outside project dates')).toBeNull()
    expect(row('Build')).not.toHaveAccessibleName(/Outside project dates/)
    expect(within(row('Migration')).getByTestId('bar')).toHaveStyle({ left: '0%' })
  })

  it('draws the Today line, or says which side of the axis today is on', () => {
    const { unmount } = draw()
    expect(parseFloat(screen.getByTestId('today').style.left)).toBeCloseTo(43.57, 2)
    expect(screen.getByText('Today')).toBeInTheDocument()
    unmount()

    const after = draw({ today: '2027-02-01' })
    expect(screen.queryByTestId('today')).toBeNull()
    expect(screen.getByText('Today is after the end')).toBeInTheDocument()
    after.unmount()

    draw({ today: '2026-01-01' })
    expect(screen.queryByTestId('today')).toBeNull()
    expect(screen.getByText('Today is before the start')).toBeInTheDocument()
  })

  it("paints names and words over the Today line, on the card colour, so the line never strikes through text", () => {
    draw()
    const onTop = { position: 'relative', zIndex: '1', backgroundColor: '#FAFBF5', width: 'fit-content' }
    expect(within(row('Build')).getByText('Build · after Design')).toHaveStyle(onTop)
    expect(within(row('Migration')).getByText('Outside project dates')).toHaveStyle(onTop)
    expect(within(row('Build')).getByText('In progress 0%').parentElement).toHaveStyle(onTop)
    expect(within(row('Migration')).getByText('Late, 0%').parentElement).toHaveStyle(onTop)
  })

  it('writes Late in error red and the other words and captions in secondary text', () => {
    // MUI 9 dropped dotted palette paths on Typography's color prop (color="error.main" painted
    // nothing, so Late read in plain ink): the colours go through sx.
    draw()
    const secondary = { color: theme.palette.text.secondary }
    expect(within(row('Migration')).getByText('Late, 0%').parentElement).toHaveStyle({ color: theme.palette.error.main })
    expect(within(row('Build')).getByText('In progress 0%').parentElement).toHaveStyle(secondary)
    expect(within(row('Migration')).getByText('Outside project dates')).toHaveStyle(secondary)
    expect(screen.getByText('3 deliverables: 1 done, 1 late.')).toHaveStyle(secondary)
    expect(screen.getByText('Today')).toHaveStyle(secondary)
  })

  it('keeps a one-day deliverable at least 8 px wide', () => {
    draw({ deliverables: [{ ...BUILD, startDate: '2026-11-12' }] })
    expect(within(row('Build')).getByTestId('bar')).toHaveStyle({ minWidth: '8px' })
  })

  it('sums it up and keys the colours', () => {
    draw()
    expect(screen.getByRole('figure', { name: 'Deliverables timeline' })).toHaveTextContent('3 deliverables: 1 done, 1 late.')
    const legend = screen.getByRole('list', { name: 'Legend' })
    expect(within(legend).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Done', 'In progress', 'Not started or blocked', 'Late'])
  })

  it('says "1 deliverable" when there is one', () => {
    draw({ deliverables: [DESIGN] })
    expect(screen.getByRole('figure', { name: 'Deliverables timeline' })).toHaveTextContent('1 deliverable: 1 done, 0 late.')
  })
})
