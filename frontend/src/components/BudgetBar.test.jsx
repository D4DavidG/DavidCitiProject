import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ThemeProvider } from '@mui/material/styles'
import BudgetBar from './BudgetBar'
import StatusChip from './StatusChip'
import { makeTheme } from '../theme/theme'

describe('BudgetBar', () => {
  const apollo = { budgetCents: 15_000_000, plannedCents: 3_197_600, consumedCents: 137_000, pendingCents: 153_800, consumedPercent: 0, plannedOverBudget: false, remainingCents: 14_863_000 }

  it('states spent against budget, and planned, in words', () => {
    render(<BudgetBar {...apollo} />)
    expect(screen.getByText('$1,370 spent of $150,000')).toBeInTheDocument()
    expect(screen.getByText(/planned \$31,976/)).toBeInTheDocument()
    expect(screen.getByText(/\$1,538 waiting for approval/)).toBeInTheDocument()
  })

  it('says "under 1%" rather than 0% when something has been spent', () => {
    render(<BudgetBar {...apollo} consumedPercent={0} />)
    expect(screen.getByText(/under 1% of budget spent/i)).toBeInTheDocument()
  })

  it('shows a sliver of fill when something has been spent, even under 1%', () => {
    // $1,370 of $150,000 rounds down to 0%, which used to draw an empty bar.
    render(<BudgetBar {...apollo} consumedPercent={0} />)
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1')
  })

  it('leaves the bar empty when nothing has been spent', () => {
    render(<BudgetBar {...apollo} consumedCents={0} consumedPercent={0} />)
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0')
  })

  it.each([['light', 'rgb(238, 238, 238)'], ['dark', 'rgb(42, 55, 44)']])(
    'draws the bar on the quiet track of the mode (%s), not a fixed light grey',
    (mode, track) => {
      render(<ThemeProvider theme={makeTheme(mode)}><BudgetBar {...apollo} consumedPercent={42} /></ThemeProvider>)
      expect(screen.getByRole('progressbar')).toHaveStyle({ backgroundColor: track })
    },
  )

  it('fills the bar to the share spent, from the server', () => {
    render(<BudgetBar {...apollo} consumedPercent={42} />)
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '42')
  })

  it('warns when spending is just over budget, even though the percentage rounds down to 100', () => {
    // The server floors the percentage, so $5 over a $150,000 budget reads 100%.
    render(<BudgetBar {...apollo} consumedCents={15_000_500} consumedPercent={100} remainingCents={-500} />)
    expect(screen.getByText(/over budget/i)).toBeInTheDocument()
  })

  it('caps the bar at 100% and warns when over budget', () => {
    render(<BudgetBar {...apollo} consumedPercent={130} remainingCents={-4_500_000} />)
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100')
    expect(screen.getByText(/over budget/i)).toBeInTheDocument()
  })

  it('warns when the planned cost is already over the budget', () => {
    render(<BudgetBar {...apollo} plannedOverBudget />)
    expect(screen.getByText(/planned cost is over budget/i)).toBeInTheDocument()
  })

  it('handles a project with no budget set', () => {
    render(<BudgetBar {...apollo} budgetCents={0} consumedPercent={null} />)
    expect(screen.getByText(/no budget set/i)).toBeInTheDocument()
  })
})

describe('StatusChip', () => {
  it.each([
    ['ACTIVE', 'Active'], ['ON_HOLD', 'On hold'], ['COMPLETE', 'Complete'], ['PLANNING', 'Planning'],
    ['BLOCKED', 'Blocked'], ['IN_PROGRESS', 'In progress'], ['NOT_STARTED', 'Not started'], ['DONE', 'Done'],
    ['TODO', 'To do'], ['PENDING', 'Pending'], ['APPROVED', 'Approved'], ['REJECTED', 'Rejected'],
  ])('labels %s as "%s"', (status, label) => {
    render(<StatusChip status={status} />)
    expect(screen.getByText(label)).toBeInTheDocument()
  })

  it('falls back to the raw value for anything unknown', () => {
    render(<StatusChip status="SOMETHING_NEW" />)
    expect(screen.getByText('SOMETHING_NEW')).toBeInTheDocument()
  })
})
