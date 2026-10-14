import { useCallback } from 'react'
import PropTypes from 'prop-types'
import { Box, Card, CardContent, Typography } from '@mui/material'
import BudgetBar from '../../components/BudgetBar'
import PageState from '../../components/PageState'
import { formatCents } from '../../services/format'
import { request } from '../../services/request'
import { useApi } from '../../services/useApi'

/**
 * Question 7 in full. Planned = the people booked x their hourly rate x the dates;
 * spent = approved logged time at the rate frozen when it was logged. The server
 * computes every figure; this tab only formats them.
 */
export default function BudgetTab({ projectId }) {
  const load = useCallback(() => request('GET', `/projects/${projectId}/budget`), [projectId])
  const { data, error, loading, reload } = useApi(load)

  const figures = data && [
    ['Budget', formatCents(data.budgetCents)],
    ['Planned (from bookings)', formatCents(data.plannedCents)],
    ['Spent (approved time)', formatCents(data.consumedCents)],
    ['Waiting for approval', formatCents(data.pendingCents)],
    ['Remaining', formatCents(data.remainingCents)],
    ['Budget spent', data.consumedPercent === null ? '—' : `${data.consumedPercent}%`],
    ['Schedule elapsed', `${data.scheduleElapsedPercent}%`],
  ]

  return (
    <PageState loading={loading} error={error} onRetry={reload}>
      {data && (
        <Box sx={{ display: 'grid', gap: 2 }}>
          <Card><CardContent><BudgetBar {...data} /></CardContent></Card>
          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' } }}>
            {figures.map(([label, value]) => (
              <Card key={label}>
                <CardContent>
                  <Typography variant="body2" color="text.secondary">{label}</Typography>
                  <Typography variant="h3" component="p">{value}</Typography>
                </CardContent>
              </Card>
            ))}
          </Box>
          <Typography variant="body2" color="text.secondary">
            Only approved time counts as spent. Rates are frozen when time is logged, so a later pay change never rewrites past costs.
          </Typography>
        </Box>
      )}
    </PageState>
  )
}

BudgetTab.propTypes = { projectId: PropTypes.number.isRequired }
