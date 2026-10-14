import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { ThemeProvider } from '@mui/material/styles'
import theme from '../../theme/theme'
import BudgetChart from './BudgetChart'

const APOLLO = {
  projectId: 1, name: 'Apollo', budgetCents: 15_000_000,
  consumedCents: 137_000, consumedPercent: 0, pendingCents: 153_800, pendingPercent: 1,
  plannedCents: 3_197_600, plannedPercent: 21, remainingCents: 14_863_000, plannedOverBudget: false,
}
const ZEUS = {
  projectId: 2, name: 'Zeus', budgetCents: 4_000_000,
  consumedCents: 288_500, consumedPercent: 7, pendingCents: 0, pendingPercent: 0,
  plannedCents: 2_535_600, plannedPercent: 63, remainingCents: 3_711_500, plannedOverBudget: false,
}
const HERMES = {
  projectId: 3, name: 'Hermes', budgetCents: 8_000_000,
  consumedCents: 0, consumedPercent: 0, pendingCents: 0, pendingPercent: 0,
  plannedCents: 0, plannedPercent: 0, remainingCents: 8_000_000, plannedOverBudget: false,
}
const ARES = {
  projectId: 4, name: 'Ares', budgetCents: 4_000_000,
  consumedCents: 5_290_000, consumedPercent: 132, pendingCents: 0, pendingPercent: 0,
  plannedCents: 9_200_000, plannedPercent: 230, remainingCents: -1_290_000, plannedOverBudget: true,
}
const JUNO = {
  projectId: 5, name: 'Juno', budgetCents: 0,
  consumedCents: 137_000, consumedPercent: null, pendingCents: 0, pendingPercent: null,
  plannedCents: 0, plannedPercent: null, remainingCents: -137_000, plannedOverBudget: false,
}

function draw(projects) {
  return render(<ThemeProvider theme={theme}><BudgetChart projects={projects} /></ThemeProvider>)
}

const row = (name) => screen.getByRole('img', { name: new RegExp(` · ${name}$`) })

describe('BudgetChart', () => {
  it('draws a row per project, in the order the server sent them', () => {
    draw([APOLLO, ZEUS, HERMES])
    expect(screen.getAllByRole('img').map((r) => r.getAttribute('aria-label'))).toEqual([
      '$1,370 spent (<1%) · $1,538 waiting (1%) · $31,976 planned (21%) · budget $150,000 · Apollo',
      '$2,885 spent (7%) · $0 waiting (0%) · $25,356 planned (63%) · budget $40,000 · Zeus',
      '$0 spent (0%) · $0 waiting (0%) · nothing planned · budget $80,000 · Hermes',
    ])
  })

  it('places spent, waiting and planned from the server percentages, with a sliver under 1%', () => {
    draw([APOLLO, ZEUS, HERMES])
    const apollo = row('Apollo')
    expect(within(apollo).getByTestId('spent')).toHaveStyle({ width: '0.8%' })
    expect(within(apollo).getByTestId('waiting')).toHaveStyle({ left: '0.8%', width: '0.8%' })
    expect(within(apollo).getByTestId('planned')).toHaveStyle({ left: '16.8%' })
    const zeus = row('Zeus')
    expect(within(zeus).getByTestId('spent')).toHaveStyle({ width: '5.6%' })
    expect(within(zeus).getByTestId('planned')).toHaveStyle({ left: '50.4%' })
    const hermes = row('Hermes')
    expect(within(hermes).queryByTestId('planned')).toBeNull()
    expect(within(hermes).getByText('$0 of $80,000')).toBeInTheDocument()
  })

  it('turns red with words and the icon when over budget, with arrows past 125%', () => {
    draw([ARES])
    const ares = row('Ares')
    expect(within(ares).getByText('Over budget')).toBeInTheDocument()
    expect(within(ares).getByTestId('WarningAmberRoundedIcon')).toBeInTheDocument()
    expect(within(ares).getByTestId('spent')).toHaveAttribute('data-state', 'over')
    expect(within(ares).getByTestId('spent')).toHaveStyle({ width: '100%' })
    expect(within(ares).getByText('$52,900 of $40,000 · Planned 230%')).toBeInTheDocument()
    expect(within(ares).getAllByText('▸')).toHaveLength(2)
    expect(within(ares).getByText('Planned cost is over budget')).toBeInTheDocument()
  })

  it('says Over budget when $5 over still rounds to 100%', () => {
    draw([{ ...ZEUS, consumedCents: 4_000_500, consumedPercent: 100, remainingCents: -500 }])
    expect(within(screen.getByRole('img')).getByText('Over budget')).toBeInTheDocument()
  })

  it('shows No budget set with no bar, and never calls it over budget', () => {
    draw([JUNO])
    const juno = row('Juno')
    expect(within(juno).getByText('No budget set · $1,370 spent')).toBeInTheDocument()
    expect(within(juno).queryByTestId('spent')).toBeNull()
    expect(within(juno).queryByText('Over budget')).toBeNull()
  })

  it('labels the budget line once, sums up and keys the colours', () => {
    draw([APOLLO, ZEUS, HERMES, ARES])
    expect(screen.getAllByText('100% Budget')).toHaveLength(1)
    expect(screen.getByText('1 of 4 projects are over budget.')).toBeInTheDocument()
    const legend = screen.getByRole('list', { name: 'Legend' })
    expect(within(legend).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Spent', 'Waiting for approval', 'Planned', 'Over budget'])
    expect(screen.getByRole('figure', { name: 'Budget by project' })).toBeInTheDocument()
  })
})
