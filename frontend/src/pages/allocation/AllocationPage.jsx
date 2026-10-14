import { useCallback, useState } from 'react'
import PropTypes from 'prop-types'
import {
  Box, Button, Chip, FormControlLabel, IconButton, Pagination, Paper, Switch, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Tooltip, Typography,
} from '@mui/material'
import PrevIcon from '@mui/icons-material/ChevronLeft'
import NextIcon from '@mui/icons-material/ChevronRight'
import PageHeader from '../../components/PageHeader'
import PageState from '../../components/PageState'
import { addDays, formatDay, formatHours } from '../../services/format'
import { request } from '../../services/request'
import { useApi } from '../../services/useApi'

const WEEKS = 6
const PAGE_SIZE = 25
const sticky = { position: 'sticky', left: 0, bgcolor: 'background.paper', zIndex: 1, minWidth: 200 }

function breakdown(projects) {
  return projects.length ? projects.map((p) => `${p.name} ${p.hours} h`).join(', ') : 'Not booked'
}

/** One person-week: booked hours against capacity, and where they come from. */
function WeekCell({ week, capacity }) {
  const label = `Week of ${formatDay(week.week)}: ${week.bookedHours} of ${capacity} hours booked (${breakdown(week.projects)})`
  return (
    <TableCell sx={{ p: 0.5 }}>
      {/* A tap opens it on phones (MUI's default needs a 700 ms press) and it stays up to be read. */}
      <Tooltip title={breakdown(week.projects)} describeChild arrow enterTouchDelay={0} leaveTouchDelay={4000}>
        <Box
          tabIndex={0}
          data-over={String(week.overAllocated)}
          aria-label={label}
          sx={{
            px: 1, py: 0.75, borderRadius: 1, minWidth: 96, cursor: 'default',
            bgcolor: week.overAllocated ? 'rgba(198, 40, 40, 0.10)' : 'transparent',
            border: 1, borderColor: week.overAllocated ? 'error.main' : 'transparent',
          }}
        >
          <Typography variant="body2" sx={{ fontWeight: 600, color: week.overAllocated ? 'error.main' : week.bookedHours ? 'text.primary' : 'text.disabled' }}>
            {week.bookedHours} / {capacity} h
          </Typography>
          {week.overAllocated && <Typography variant="caption" color="error.main" sx={{ display: 'block' }}>+{week.overByHours} h over</Typography>}
          {week.loggedMinutes > 0 && (
            <Typography variant="caption" color={week.overtime ? 'warning.main' : 'text.secondary'} sx={{ display: 'block' }}>
              logged {formatHours(week.loggedMinutes)}{week.overtime ? ' · overtime' : ''}
            </Typography>
          )}
        </Box>
      </Tooltip>
    </TableCell>
  )
}

WeekCell.propTypes = {
  week: PropTypes.shape({
    week: PropTypes.string.isRequired,
    bookedHours: PropTypes.number.isRequired,
    overAllocated: PropTypes.bool.isRequired,
    overByHours: PropTypes.number.isRequired,
    projects: PropTypes.arrayOf(PropTypes.shape({ name: PropTypes.string, hours: PropTypes.number })).isRequired,
    loggedMinutes: PropTypes.number.isRequired,
    overtime: PropTypes.bool.isRequired,
  }).isRequired,
  capacity: PropTypes.number.isRequired,
}

/**
 * Questions 3 and 5: who is booked on what, week by week, across every project.
 * A person is over-allocated when their bookings in a week add up past their own
 * weekly capacity; the server sorts the worst first and can return only those.
 */
export default function AllocationPage() {
  const [weekFrom, setWeekFrom] = useState('')
  const [overOnly, setOverOnly] = useState(false)
  const [pageNumber, setPageNumber] = useState(1)

  const load = useCallback(() => request('GET', '/dashboard/allocation', {
    query: { weekFrom, weeks: WEEKS, overOnly: overOnly ? 'true' : undefined, page: pageNumber, pageSize: PAGE_SIZE },
  }), [weekFrom, overOnly, pageNumber])
  const { data, error, loading, reload } = useApi(load)
  const weeks = data?.weeks ?? []
  const people = data?.items ?? []
  const start = weekFrom || weeks[0]

  function move(days) {
    if (start) setWeekFrom(addDays(start, days))
  }

  return (
    <>
      <PageHeader
        title="Allocation"
        subtitle="Hours booked per person per week, across every project. Hover or tap a week to see which projects the hours come from."
      />

      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2, mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <IconButton aria-label="Previous week" onClick={() => move(-7)} disabled={!start}><PrevIcon /></IconButton>
          <Typography sx={{ minWidth: 150, textAlign: 'center' }}>
            {weeks.length ? `${formatDay(weeks[0])} – ${formatDay(addDays(weeks.at(-1), 6))}` : '…'}
          </Typography>
          <IconButton aria-label="Next week" onClick={() => move(7)} disabled={!start}><NextIcon /></IconButton>
          <Button size="small" onClick={() => setWeekFrom('')} disabled={!weekFrom}>This week</Button>
        </Box>
        <FormControlLabel
          control={<Switch checked={overOnly} onChange={(e) => { setOverOnly(e.target.checked); setPageNumber(1) }} />}
          label="Only over-allocated"
        />
        <Box sx={{ display: 'flex', gap: 1, ml: { md: 'auto' }, flexWrap: 'wrap' }}>
          <Chip size="small" variant="outlined" color="error" label="Red: booked past capacity" />
          <Chip size="small" variant="outlined" color="warning" label="Orange: logged past capacity (overtime)" />
        </Box>
      </Box>

      <PageState
        loading={loading}
        error={error}
        onRetry={reload}
        empty={data && people.length === 0 ? (overOnly ? 'No one is over capacity in these weeks.' : 'No employees to show.') : null}
      >
        <TableContainer component={Paper} variant="outlined" sx={{ overflowX: 'auto' }}>
          <Table size="small" aria-label="Hours booked per person per week">
            <TableHead>
              <TableRow>
                <TableCell sx={sticky}>Person</TableCell>
                {weeks.map((w) => (
                  <TableCell key={w} aria-label={`Week of ${formatDay(w)}`}>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>Week of</Typography>
                    {formatDay(w)}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {people.map((person) => (
                <TableRow key={person.userId}>
                  <TableCell sx={sticky}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>{person.name}</Typography>
                    {person.jobTitle && <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{person.jobTitle}</Typography>}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5, flexWrap: 'wrap' }}>
                      {person.status === 'OVER_ALLOCATED'
                        ? <Chip size="small" color="error" label="Over-allocated" />
                        : <Chip size="small" color="success" variant="outlined" label="OK" />}
                      <Typography variant="caption" color="text.secondary">
                        {person.capacityHours} h/week{person.overtimeAllowed ? ' · overtime allowed' : ''}
                      </Typography>
                    </Box>
                  </TableCell>
                  {person.weeks.map((w) => <WeekCell key={w.week} week={w} capacity={person.capacityHours} />)}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        {data?.totalPages > 1 && (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
            <Pagination count={data.totalPages} page={pageNumber} onChange={(_, value) => setPageNumber(value)} />
          </Box>
        )}
      </PageState>
    </>
  )
}
