import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import BudgetBar from './BudgetBar'
import StatusChip from './StatusChip'

describe('BudgetBar', () => {
  const apollo = { budgetCents: 15_000_000, plannedCents: 3_197_600, consumedCents: 137_000, pendingCents: 153_800, consumedPercent: 0, plannedOverBudget: false }

  it('states spent against budget, and planned, in words', () => {
    render(<BudgetBar {...apollo} />)
    expect(screen.getByText('$1,370 spent of $150,000')).toBeInTheDocument()
    expect(screen.getByText(/planned \$31,976/)).toBeInTheDocument()
    expect(screen.getByText(/\$1,538 waiting for approval/)).toBeInTheDocument()
  })

  it('fills the bar to the share spent, from the server', () => {
    render(<BudgetBar {...apollo} consumedPercent={42} />)
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '42')
  })

  it('caps the bar at 100% and warns when over budget', () => {
    render(<BudgetBar {...apollo} consumedPercent={130} />)
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
