import { useCallback, useRef, useState } from 'react'
import PropTypes from 'prop-types'
import { Link } from 'react-router'
import {
  Box, Button, FormControlLabel, MenuItem, Switch, TextField, Tooltip, Typography,
} from '@mui/material'
import PrevIcon from '@mui/icons-material/ChevronLeft'
import NextIcon from '@mui/icons-material/ChevronRight'
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded'
import { visuallyHidden } from '@mui/utils'
import { ChartFigure, ChartLegend } from '../../components/charts/ChartParts'
import PageHeader from '../../components/PageHeader'
import PageState, { Pager } from '../../components/PageState'
import ProjectPicker from '../../components/ProjectPicker'
import { addDays, formatDay, formatPerWeek } from '../../services/format'
import { request } from '../../services/request'
import { useApi } from '../../services/useApi'
import { MARK, useChartColours } from '../../theme/chartColours'
import { keepSlots, scheduleBars, slotColours } from './schedule'

const SPANS = [8, 13, 26]
const PAGE_SIZE = 25
/** The name column (narrower on phones) and the smallest a week may get before the time line scrolls. */
const NAME = { xs: '7.5rem', md: '11rem' }
const WEEK = '6rem'

/** The grid every row and the week header share: the name, then one column per week. */
function rowGrid(weekCount) {
  const at = (name) => ({ columns: `${name} repeat(${weekCount}, minmax(${WEEK}, 1fr))`, min: `calc(${name} + ${weekCount} * ${WEEK})` })
  return {
    display: 'grid',
    gridTemplateColumns: { xs: at(NAME.xs).columns, md: at(NAME.md).columns },
    // At least as wide as its weeks, so the sticky name has room to stay put while the weeks scroll under it.
    minWidth: { xs: at(NAME.xs).min, md: at(NAME.md).min },
  }
}

/** The name column stays on screen while the weeks scroll sideways (phones, 26 weeks), on the card's colour. */
const nameCell = (grid) => ({
  gridColumn: 1, gridRow: '1 / -1', position: 'sticky', left: 0, zIndex: 2, bgcolor: 'background.paper', pr: 1, py: 0.5,
  borderRight: `1px solid ${grid}`, overflowWrap: 'anywhere',
})

/**
 * One booking bar: the project's colour across the weeks it runs, its name and hours above.
 * It is a link to the project, so keyboard focus draws the theme's one green-ink ring. Hover,
 * keyboard focus or a tap shows the tooltip; on a phone the first tap only shows it (a tap is
 * also a click) and the second opens the project.
 */
function BookingBar({ person, bar, weeks, colour, lane }) {
  const [open, setOpen] = useState(false)
  const tap = useRef(null) // during a tap: was the tooltip already open when it began?
  const from = formatDay(weeks[bar.first])
  const to = formatDay(addDays(weeks[bar.last], 6))
  const name = `${person.name}, ${bar.name}, ${formatPerWeek(bar.hours, { spoken: true })}, ${from} to ${to}`
  return (
    <Tooltip
      title={`${bar.name} · ${formatPerWeek(bar.hours)} · ${from} – ${to}`}
      open={open}
      onOpen={() => setOpen(true)}
      onClose={() => setOpen(false)}
      describeChild
      arrow
      enterTouchDelay={0}
      leaveTouchDelay={4000}
    >
      <Box
        component={Link}
        to={`/projects/${bar.projectId}`}
        aria-label={name}
        onTouchStart={() => { tap.current = open }}
        onClick={(event) => {
          if (tap.current === false) event.preventDefault()
          tap.current = null
        }}
        sx={{
          gridColumn: `${bar.first + 2} / ${bar.last + 3}`, gridRow: lane + 1, position: 'relative', zIndex: 1,
          display: 'block', minWidth: 0, minHeight: 24, mx: 0.5, py: 0.25, color: 'text.primary', textDecoration: 'none',
        }}
      >
        <Typography variant="caption" noWrap component="span" sx={{ display: 'block' }}>
          {`${bar.name} · ${formatPerWeek(bar.hours)}`}
        </Typography>
        <Box data-testid="bar" data-mark style={{ height: MARK.bar, borderRadius: MARK.radius, backgroundColor: colour }} />
      </Box>
    </Tooltip>
  )
}

BookingBar.propTypes = {
  person: PropTypes.shape({ name: PropTypes.string.isRequired }).isRequired,
  bar: PropTypes.shape({
    projectId: PropTypes.number.isRequired,
    name: PropTypes.string.isRequired,
    hours: PropTypes.number.isRequired,
    first: PropTypes.number.isRequired,
    last: PropTypes.number.isRequired,
  }).isRequired,
  weeks: PropTypes.arrayOf(PropTypes.string).isRequired,
  colour: PropTypes.string.isRequired,
  lane: PropTypes.number.isRequired,
}

/**
 * One person's row: their name, a lane per project with its bars, and a last line with the words
 * for any week booked past their capacity (that week also gets a red outline).
 */
function PersonRow({ person, weeks, colours }) {
  const c = useChartColours()
  const bars = scheduleBars(person.weeks)
  const lanes = [...new Set(bars.map((bar) => bar.projectId))].sort((x, y) => x - y)
  // Lane by lane, then week by week: the order Tab visits them, so focus never jumps between lanes.
  bars.sort((x, y) => lanes.indexOf(x.projectId) - lanes.indexOf(y.projectId) || x.first - y.first)
  const laneCount = Math.max(lanes.length, 1)
  return (
    <Box component="li" sx={{ ...rowGrid(weeks.length), gridTemplateRows: `repeat(${laneCount + 1}, auto)`, borderTop: `1px solid ${c.grid}` }}>
      <Box sx={nameCell(c.grid)}>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>{person.name}</Typography>
        <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>
          {`${formatPerWeek(person.capacityHours)} capacity`}
        </Typography>
      </Box>
      {person.weeks.map((w, i) => (
        // A week's column: a gridline, or the red outline when it is booked past capacity.
        <Box
          key={w.week}
          aria-hidden="true"
          data-mark={w.overAllocated || undefined}
          data-state={w.overAllocated ? 'over' : undefined}
          sx={{
            gridColumn: i + 2, gridRow: '1 / -1', borderLeft: `1px solid ${c.grid}`,
            ...(w.overAllocated && { border: `2px solid ${c.over}` }),
          }}
        />
      ))}
      {bars.map((bar) => (
        <BookingBar
          key={`${bar.projectId}-${bar.first}`}
          person={person}
          bar={bar}
          weeks={weeks}
          colour={colours.get(bar.projectId)}
          lane={lanes.indexOf(bar.projectId)}
        />
      ))}
      {bars.length === 0 && (
        <Typography variant="caption" sx={{ gridColumn: '2 / -1', gridRow: 1, px: 1, py: 0.5, color: 'text.secondary' }}>
          Not booked
        </Typography>
      )}
      {person.weeks.map((w, i) => w.overAllocated && (
        <Typography
          key={w.week}
          data-testid="over-words"
          variant="caption"
          sx={{ gridColumn: i + 2, gridRow: laneCount + 1, px: 0.75, pb: 0.5, color: 'error.main', display: 'flex', alignItems: 'center', gap: 0.5 }}
        >
          <Box component="span" sx={visuallyHidden}>{`Week of ${formatDay(w.week)}: ${w.bookedHours} of ${person.capacityHours} hours booked, `}</Box>
          <WarningAmberRoundedIcon aria-hidden="true" sx={{ fontSize: 16 }} />
          <span>{`+${w.overByHours} h over`}</span>
        </Typography>
      ))}
    </Box>
  )
}

PersonRow.propTypes = {
  person: PropTypes.shape({
    name: PropTypes.string.isRequired,
    capacityHours: PropTypes.number.isRequired,
    weeks: PropTypes.arrayOf(PropTypes.shape({
      week: PropTypes.string.isRequired,
      bookedHours: PropTypes.number.isRequired,
      overAllocated: PropTypes.bool.isRequired,
      overByHours: PropTypes.number.isRequired,
      projects: PropTypes.arrayOf(PropTypes.shape({
        projectId: PropTypes.number.isRequired, name: PropTypes.string.isRequired, hours: PropTypes.number.isRequired,
      })).isRequired,
    })).isRequired,
  }).isRequired,
  weeks: PropTypes.arrayOf(PropTypes.string).isRequired,
  colours: PropTypes.instanceOf(Map).isRequired,
}

/** What to say when no one is left to show, given the switch and the project filter. */
function emptyText(overOnly, filtered) {
  if (overOnly) return filtered ? 'No one on the chosen projects is over capacity in these weeks.' : 'No one is over capacity in these weeks.'
  return filtered ? 'No one is booked on the chosen projects in these weeks.' : 'No employees to show.'
}

/**
 * Questions 3 and 5 as a Float-style schedule: one row per person, weeks across, a bar per
 * booking in its project's colour, and a red outline plus words on any week past capacity.
 * It reads the same GET /dashboard/allocation as the Allocation grid. With projects chosen in
 * the picker it sends their ids (projectIds=1,2): the server keeps only those bookings, counts
 * hours and "over capacity" from them alone, and leaves out anyone with none of them.
 */
export default function SchedulePage() {
  const [weekFrom, setWeekFrom] = useState('')
  const [span, setSpan] = useState(SPANS[0])
  const [overOnly, setOverOnly] = useState(false)
  const [chosen, setChosen] = useState([])
  const [pageNumber, setPageNumber] = useState(1)
  const [known, setKnown] = useState(() => new Map())
  const c = useChartColours()
  const projectIds = chosen.map((p) => p.projectId).join(',')
  const filtered = projectIds !== ''

  const load = useCallback(() => request('GET', '/dashboard/allocation', {
    query: {
      weekFrom, weeks: span, overOnly: overOnly ? 'true' : undefined, projectIds: projectIds || undefined, page: pageNumber, pageSize: PAGE_SIZE,
    },
  }), [weekFrom, span, overOnly, projectIds, pageNumber])
  const { data, error, loading, reload } = useApi(load)
  const weeks = data?.weeks ?? []
  const people = data?.items ?? []
  const start = weekFrom || weeks[0]

  // A project keeps the colour slot it was first given while this screen is open (see keepSlots).
  const projects = people.flatMap((p) => p.weeks.flatMap((w) => w.projects))
  const slots = keepSlots(known, projects.map((p) => p.projectId))
  if (slots !== known) setKnown(slots)
  const colours = slotColours(slots, c)

  /** Any change to the weeks or the filters starts again at page 1: who is worst depends on what is shown. */
  function show(change) {
    change()
    setPageNumber(1)
  }

  const onPage = new Map(projects.map((p) => [p.projectId, p.name]))
  const slotted = [...colours].filter(([id, colour]) => onPage.has(id) && colour !== c.other)
  const otherCount = [...onPage.keys()].filter((id) => colours.get(id) === c.other).length
  // People with a red-outlined week on screen; the legend explains the outline only when one is drawn.
  const overCount = people.filter((p) => p.weeks.some((w) => w.overAllocated)).length
  const legend = [
    ...slotted.map(([id, colour]) => ({ id, label: onPage.get(id), colour, kind: 'swatch' })),
    ...(otherCount ? [{ label: `Other (${otherCount})`, colour: c.other, kind: 'swatch' }] : []),
    ...(overCount ? [{ label: 'Over capacity', colour: c.over, kind: 'problem' }] : []),
  ]
  const by = filtered ? ' by the chosen projects alone' : ''
  const summary = overCount
    ? `${overCount} of ${people.length} people shown are booked past capacity${by} in at least one of these weeks.`
    : `No one shown is booked past capacity${by} in these weeks.`

  return (
    <>
      <PageHeader
        title="Schedule"
        subtitle="Who is booked on which project, week by week. Hover, focus or tap a bar for its dates; click it to open the project."
      />

      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2, mb: 2 }}>
        <ProjectPicker value={chosen} onChange={(next) => show(() => setChosen(next))} />
        {/* Earlier and Later move one week; filled buttons with words (spec 6.2). */}
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
          <Button size="small" variant="contained" startIcon={<PrevIcon />} onClick={() => show(() => setWeekFrom(addDays(start, -7)))} disabled={!start}>Earlier</Button>
          <Typography sx={{ minWidth: 150, textAlign: 'center' }}>
            {weeks.length ? `${formatDay(weeks[0])} – ${formatDay(addDays(weeks.at(-1), 6))}` : '…'}
          </Typography>
          <Button size="small" variant="contained" endIcon={<NextIcon />} onClick={() => show(() => setWeekFrom(addDays(start, 7)))} disabled={!start}>Later</Button>
          <Button size="small" variant="contained" onClick={() => show(() => setWeekFrom(''))} disabled={!weekFrom}>This week</Button>
        </Box>
        {/* A field like the other filters, not a toggle group: spec 6.2 allows no outline-only buttons. */}
        <TextField
          id="schedule-weeks"
          select
          label="Weeks shown"
          size="small"
          value={span}
          onChange={(e) => show(() => setSpan(Number(e.target.value)))}
          sx={{ minWidth: 140 }}
        >
          {SPANS.map((n) => <MenuItem key={n} value={n}>{`${n} weeks`}</MenuItem>)}
        </TextField>
        <FormControlLabel
          control={<Switch checked={overOnly} onChange={(e) => show(() => setOverOnly(e.target.checked))} />}
          label="Over capacity only"
        />
      </Box>

      <PageState
        loading={loading}
        error={error}
        onRetry={reload}
        empty={data && people.length === 0 ? emptyText(overOnly, filtered) : null}
      >
        <ChartFigure
          title="Bookings, week by week"
          summary={summary}
          scroll="Weeks, scrolls sideways"
          scrollPaddingLeft={NAME}
          legendFirst
          legend={<ChartLegend items={legend} />}
          axis={(
            <Box aria-hidden="true" sx={{ ...rowGrid(weeks.length), mt: 1 }}>
              <Box sx={{ ...nameCell(c.grid), gridRow: 1, borderRight: 'none' }} />
              {weeks.map((w) => (
                <Typography key={w} variant="caption" sx={{ px: 0.75, color: 'text.secondary', fontWeight: 600 }}>{formatDay(w)}</Typography>
              ))}
            </Box>
          )}
        >
          {people.map((person) => <PersonRow key={person.userId} person={person} weeks={weeks} colours={colours} />)}
        </ChartFigure>
        <Pager page={pageNumber} totalPages={data?.totalPages} onChange={setPageNumber} />
      </PageState>
    </>
  )
}
