import { useCallback, useState } from 'react'
import PropTypes from 'prop-types'
import {
  Accordion, AccordionDetails, AccordionSummary, Box, Button, Chip, FormControlLabel, IconButton, Paper, Switch, Table,
  TableBody, TableCell, TableContainer, TableHead, TableRow, Tooltip, Typography,
} from '@mui/material'
import { alpha } from '@mui/material/styles'
import PrevIcon from '@mui/icons-material/ChevronLeft'
import NextIcon from '@mui/icons-material/ChevronRight'
import ExpandIcon from '@mui/icons-material/ExpandMoreOutlined'
import WarningAmberOutlined from '@mui/icons-material/WarningAmberOutlined'
import PageHeader from '../../components/PageHeader'
import PageState, { Pager } from '../../components/PageState'
import PersonActions from '../../components/PersonActions'
import SearchField from '../../components/SearchField'
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
          sx={(theme) => ({
            px: 1, py: 0.75, minWidth: 96, cursor: 'default',
            bgcolor: week.overAllocated ? alpha(theme.palette.error.main, 0.1) : 'transparent',
            border: 1, borderColor: week.overAllocated ? 'error.main' : 'transparent',
          })}
        >
          <Typography variant="body2" sx={{ fontWeight: 600, color: week.overAllocated ? 'error.main' : week.bookedHours ? 'text.primary' : 'text.secondary' }}>
            {week.bookedHours} / {capacity} h
          </Typography>
          {week.overAllocated && (
            // An icon as well as red, so the warning never depends on colour alone.
            <Typography variant="caption" color="error.main" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <WarningAmberOutlined fontSize="inherit" aria-hidden />+{week.overByHours} h over
            </Typography>
          )}
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

/** What the grid says when it has nobody to show. */
function emptyText(q, overOnly) {
  if (q) return 'Nobody matches that search.'
  return overOnly ? 'No one is over capacity in these weeks.' : 'No employees to show.'
}

/**
 * Questions 3 and 5: who is booked on what, week by week, across every project.
 * A person is over-allocated when their bookings in a week add up past their own
 * weekly capacity; the server sorts the worst first and can return only those.
 * A person's name opens the same Actions menu as their row on People.
 */
export default function AllocationPage() {
  const [q, setQ] = useState('')
  const [weekFrom, setWeekFrom] = useState('')
  const [overOnly, setOverOnly] = useState(false)
  const [pageNumber, setPageNumber] = useState(1)

  const load = useCallback(() => request('GET', '/dashboard/allocation', {
    query: { q, weekFrom, weeks: WEEKS, overOnly: overOnly ? 'true' : undefined, page: pageNumber, pageSize: PAGE_SIZE },
  }), [q, weekFrom, overOnly, pageNumber])
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

      {/* Folded away by default (spec 6.4). MUI gives the region the id named in aria-controls,
          so AccordionDetails must not repeat it. */}
      <Accordion variant="outlined" disableGutters sx={{ mb: 3 }} slotProps={{ heading: { component: 'h2' }, transition: { unmountOnExit: true } }}>
        <AccordionSummary expandIcon={<ExpandIcon />} id="allocation-help-summary" aria-controls="allocation-help-details">
          <Typography variant="h3" component="span">How to read this</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Typography variant="body2">
            Each row is a person and each column is a week. A cell shows the hours booked against that person&apos;s weekly
            capacity, for example 32 / 40 h. Red with a warning icon means they are over capacity. Use it to spot
            overbooking before it happens. Press a person&apos;s name for what you can change for them.
          </Typography>
          <Box role="group" aria-label="Legend" sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center', mt: 1.5 }}>
            <Typography variant="caption" color="text.secondary">Legend</Typography>
            <Chip size="small" variant="outlined" color="error" icon={<WarningAmberOutlined />} label="Booked past capacity" />
            <Chip size="small" variant="outlined" color="warning" label="Logged past capacity (overtime)" />
          </Box>
        </AccordionDetails>
      </Accordion>

      <Box sx={{ mb: 2 }}>
        <SearchField id="allocation-search" label="Search people" placeholder="Name" onSearch={(text) => { setQ(text); setPageNumber(1) }} />
      </Box>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2, mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <IconButton aria-label="Previous week" onClick={() => move(-7)} disabled={!start}><PrevIcon /></IconButton>
          <Typography sx={{ minWidth: 150, textAlign: 'center' }}>
            {weeks.length ? `${formatDay(weeks[0])} – ${formatDay(addDays(weeks.at(-1), 6))}` : '…'}
          </Typography>
          <IconButton aria-label="Next week" onClick={() => move(7)} disabled={!start}><NextIcon /></IconButton>
          <Button size="small" variant="contained" onClick={() => setWeekFrom('')} disabled={!weekFrom}>This week</Button>
        </Box>
        <FormControlLabel
          control={<Switch checked={overOnly} onChange={(e) => { setOverOnly(e.target.checked); setPageNumber(1) }} />}
          label="Only over-allocated"
        />
      </Box>

      <PageState
        loading={loading}
        error={error}
        onRetry={reload}
        empty={data && people.length === 0 ? emptyText(q, overOnly) : null}
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
                    <PersonActions userId={person.userId} name={person.name} label={person.name} onChanged={reload} />
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
        <Pager page={pageNumber} totalPages={data?.totalPages} onChange={setPageNumber} />
      </PageState>
    </>
  )
}
