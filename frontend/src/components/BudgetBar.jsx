import PropTypes from 'prop-types'
import { Box, Chip, LinearProgress, Typography } from '@mui/material'
import { formatCents } from '../services/format'

/**
 * Question 7: budget consumed versus planned. All figures and the percentage come
 * from the server; this only formats them (no money arithmetic in the browser).
 * Consumed = approved time; pending = logged but not yet approved; planned = bookings.
 */
export default function BudgetBar({
  budgetCents, consumedCents, plannedCents, pendingCents, consumedPercent, remainingCents, plannedOverBudget,
}) {
  const hasBudget = budgetCents > 0
  // The server's remaining figure, not the (rounded-down) percentage: $5 over still reads 100%.
  const over = hasBudget && remainingCents < 0
  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 1, flexWrap: 'wrap' }}>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {hasBudget ? `${formatCents(consumedCents)} spent of ${formatCents(budgetCents)}` : `No budget set · ${formatCents(consumedCents)} spent`}
        </Typography>
        {over && <Chip size="small" color="error" label="Over budget" />}
      </Box>
      {hasBudget && (
        <LinearProgress
          variant="determinate"
          value={Math.min(consumedPercent ?? 0, 100)}
          color={over ? 'error' : 'primary'}
          aria-label="Budget spent"
          sx={{ my: 1, height: 8, borderRadius: 4 }}
        />
      )}
      <Typography variant="caption" color="text.secondary">
        planned {formatCents(plannedCents)}
        {pendingCents > 0 && ` · ${formatCents(pendingCents)} waiting for approval`}
      </Typography>
      {plannedOverBudget && (
        <Typography variant="caption" color="warning.main" sx={{ display: 'block', fontWeight: 600 }}>
          Planned cost is over budget: the people booked will cost more than the budget.
        </Typography>
      )}
    </Box>
  )
}

BudgetBar.propTypes = {
  budgetCents: PropTypes.number.isRequired,
  consumedCents: PropTypes.number.isRequired,
  plannedCents: PropTypes.number.isRequired,
  pendingCents: PropTypes.number,
  /** consumed / budget, as the server computed it; null without a budget. */
  consumedPercent: PropTypes.number,
  /** budget - consumed, from the server; negative means over budget. */
  remainingCents: PropTypes.number,
  plannedOverBudget: PropTypes.bool,
}
