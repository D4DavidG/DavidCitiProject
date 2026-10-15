import { useCallback, useEffect, useId, useState } from 'react'
import PropTypes from 'prop-types'
import { Link } from 'react-router'
import { Box, Button, Card, Tooltip, Typography } from '@mui/material'
import { alpha } from '@mui/material/styles'
import { visuallyHidden } from '@mui/utils'
import PrevIcon from '@mui/icons-material/ChevronLeft'
import NextIcon from '@mui/icons-material/ChevronRight'
import BlockedIcon from '@mui/icons-material/BlockOutlined'
import DoneIcon from '@mui/icons-material/CheckCircleOutlined'
import NotStartedIcon from '@mui/icons-material/RadioButtonUncheckedOutlined'
import InProgressIcon from '@mui/icons-material/TimelapseOutlined'
import LateIcon from '@mui/icons-material/WarningAmberRounded'
import PageState, { Pager } from './PageState'
import StatusChip from './StatusChip'
import { useAuth } from '../auth/useAuth'
import { formatDate, formatDay, formatPerWeek, todayIso } from '../services/format'
import { request } from '../services/request'
import { useApi } from '../services/useApi'
import { MARK } from '../theme/chartColours'
import { WINDOW_WEEKS, dayCentre, deliverableState, mondayOf, placeSpan, timelineWindow } from './projectTimelines'

const PAGE_SIZE = 10
/** The name column (narrower on phones) and the narrowest a week may get before the weeks scroll. */
const NAME = { xs: '7.5rem', md: '12rem' }
const WEEK = '4rem'
/** Rows: the project bar, the deliverable marks centred on it, and the booking band under it (pixels). */
const BAR_TOP = 14
const MARK_SIZE = 24
const BAND_TOP = 34
const STATUS_WORDS = { PLANNING: 'Planning', ACTIVE: 'Active', ON_HOLD: 'On hold', COMPLETE: 'Complete' }
const ICONS = { DONE: DoneIcon, IN_PROGRESS: InProgressIcon, NOT_STARTED: NotStartedIcon, BLOCKED: BlockedIcon, LATE: LateIcon }
const LEGEND = [['DONE', 'Done'], ['IN_PROGRESS', 'In progress'], ['NOT_STARTED', 'Not started'], ['BLOCKED', 'Blocked'], ['LATE', 'Late']]
/** This week's column: a light wash of the highlight colour (palette.secondary, so dark mode follows). */
const THIS_WEEK = (theme) => alpha(theme.palette.secondary.main, 0.12)
/**
 * Every project's bar is the theme's one green (palette.primary, so dark mode follows; no glow).
 * Each row names its project, so a colour per project would add nothing, and it could clash with
 * the workload chart's project colours on the same Dashboard.
 */
const BAR_COLOUR = 'primary.main'
/** Your booking band, and its legend swatch: a quieter neutral, so it reads as "not the project". */
const BAND_COLOUR = 'text.secondary'
/** The arrow keys move along a row's marks (one Tab stop per row); Home and End jump to its ends. */
const STEP = { ArrowRight: 1, ArrowLeft: -1 }

/** The name, then the weeks; every row and the week header share it, so their columns line up. */
const ROW = {
  display: 'grid',
  gridTemplateColumns: { xs: `${NAME.xs} minmax(calc(${WINDOW_WEEKS} * ${WEEK}), 1fr)`, md: `${NAME.md} minmax(calc(${WINDOW_WEEKS} * ${WEEK}), 1fr)` },
}
/** The name stays on screen while the weeks scroll sideways under it: above every mark (bar 1, deliverable 2). */
const NAME_CELL = {
  position: 'sticky', left: 0, zIndex: 3, bgcolor: 'background.paper', pr: 1, py: 1,
  borderRight: 1, borderColor: 'divider', overflowWrap: 'anywhere',
}

/**
 * Something on the timeline with a tooltip. It takes focus, so the tooltip opens on hover, on
 * keyboard focus and on a tap alike; its aria-label is the same sentence in spoken form.
 */
function Mark({ label, tooltip, style, sx, state, tabIndex, onFocus, children }) {
  return (
    <Tooltip title={tooltip} arrow enterTouchDelay={0} leaveTouchDelay={4000}>
      <Box
        role="img"
        aria-label={label}
        tabIndex={tabIndex}
        onFocus={onFocus}
        data-mark
        data-stop
        data-state={state}
        style={style}
        sx={{
          position: 'absolute', zIndex: 1,
          '&:focus-visible': { outline: '2px solid', outlineColor: 'text.primary', outlineOffset: 1 },
          ...sx,
        }}
      >
        {children}
      </Box>
    </Tooltip>
  )
}

Mark.propTypes = {
  /** The spoken sentence. */
  label: PropTypes.string.isRequired,
  /** The tooltip's text. */
  tooltip: PropTypes.string.isRequired,
  /** Position (left, width, colour) as inline style. */
  style: PropTypes.object,
  sx: PropTypes.object,
  /** "late" on a late deliverable, for print and high-contrast stripes. */
  state: PropTypes.string,
  /** 0 for the row's one Tab stop, -1 for the others (the arrow keys reach them). */
  tabIndex: PropTypes.number.isRequired,
  /** Called when the mark takes focus, so Tab comes back to it. */
  onFocus: PropTypes.func.isRequired,
  children: PropTypes.node,
}

/** The week columns behind a row (or the header): gridlines, with this week washed in the highlight colour. */
function WeekColumns({ axis, thisWeek }) {
  return (
    <Box aria-hidden="true" sx={{ position: 'absolute', inset: 0, display: 'grid', gridTemplateColumns: `repeat(${WINDOW_WEEKS}, 1fr)` }}>
      {axis.weeks.map((week) => (
        <Box
          key={week}
          data-this-week={week === thisWeek ? week : undefined}
          sx={{ borderLeft: 1, borderColor: 'divider', ...(week === thisWeek && { bgcolor: THIS_WEEK }) }}
        />
      ))}
    </Box>
  )
}

WeekColumns.propTypes = {
  axis: PropTypes.shape({ weeks: PropTypes.arrayOf(PropTypes.string).isRequired }).isRequired,
  thisWeek: PropTypes.string.isRequired,
}

/** The Today line in the highlight colour (palette.secondary), over every row at the middle of today; nothing when today is off screen. */
function TodayLine({ axis, today }) {
  const centre = dayCentre(axis, today)
  if (centre === null) return null
  return (
    <Box
      aria-hidden="true"
      data-testid="today"
      data-mark
      style={{ left: `${centre}%`, width: MARK.line, marginLeft: -MARK.line / 2 }}
      sx={{ position: 'absolute', top: 0, bottom: 0, zIndex: 1, bgcolor: 'secondary.main', pointerEvents: 'none' }}
    />
  )
}

TodayLine.propTypes = {
  axis: PropTypes.object.isRequired,
  today: PropTypes.string.isRequired,
}

/**
 * Arrow keys, Home and End inside a row: move focus to the next, previous, first or last mark.
 * The marks are found in the row itself, so this needs no refs.
 */
function moveAlongRow(event) {
  const marks = [...event.currentTarget.querySelectorAll('[data-stop]')]
  const at = marks.indexOf(event.target)
  if (at < 0) return
  let next
  if (event.key === 'Home') next = 0
  else if (event.key === 'End') next = marks.length - 1
  else if (STEP[event.key]) next = Math.min(Math.max(at + STEP[event.key], 0), marks.length - 1)
  else return
  event.preventDefault()
  marks[next].focus()
}

/** One project: its name and status, then its span, deliverables and (yours only) bookings across the weeks. */
function ProjectRow({ project, axis, today, thisWeek, userId }) {
  // The row's one Tab stop: the mark last focused, so Tab comes back to where you were.
  const [active, setActive] = useState(0)
  const status = STATUS_WORDS[project.status] ?? project.status
  const place = placeSpan(axis, project.startDate, project.endDate)
  const risk = project.atRisk ? ', at risk' : ''
  let offScreen = null
  if (!place) offScreen = project.endDate < axis.from ? `Ended ${formatDate(project.endDate)}` : `Starts ${formatDate(project.startDate)}`

  // Every mark on screen, in the order the arrow keys visit them: the bar, the deliverables by due date, your bookings.
  const marks = []
  if (place) {
    marks.push({
      key: 'span',
      label: `${project.name} project, ${status}${risk}, ${formatDate(project.startDate)} to ${formatDate(project.endDate)}`,
      tooltip: `${project.name} · ${status}${project.atRisk ? ' · At risk' : ''} · ${formatDate(project.startDate)} – ${formatDate(project.endDate)}`,
      style: { left: `${place.left}%`, width: `${place.width}%` },
      sx: { top: BAR_TOP, height: MARK.bar, minWidth: MARK.minDay, bgcolor: BAR_COLOUR },
    })
  }
  const byDueDate = [...project.deliverables].sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  byDueDate.forEach((d) => {
    const centre = dayCentre(axis, d.dueDate)
    if (centre === null) return
    const state = deliverableState(d, today)
    const Icon = ICONS[state.key] ?? NotStartedIcon
    const late = state.key === 'LATE'
    marks.push({
      key: `d${d.milestoneId}`,
      label: `${project.name} deliverable ${d.name}, due ${formatDate(d.dueDate)}, ${state.word}`,
      tooltip: `${d.name} · due ${formatDate(d.dueDate)} · ${state.word}`,
      state: late ? 'late' : undefined,
      style: { left: `${centre}%`, marginLeft: -MARK_SIZE / 2 },
      sx: {
        top: BAR_TOP + MARK.bar / 2 - MARK_SIZE / 2, width: MARK_SIZE, height: MARK_SIZE, display: 'grid', placeItems: 'center',
        borderRadius: '50%', bgcolor: 'background.paper', color: late ? 'error.main' : 'text.primary', zIndex: 2,
      },
      children: <Icon aria-hidden="true" sx={{ fontSize: 20 }} />,
    })
  })
  const bands = project.bookings
    .filter((b) => b.userId === userId)
    .map((b) => ({ b, at: placeSpan(axis, b.startDate, b.endDate) }))
    .filter(({ at }) => at)
  bands.forEach(({ b, at }) => {
    marks.push({
      key: `b${b.startDate}-${b.endDate}`,
      label: `Your booking on ${project.name}, ${formatPerWeek(b.hoursPerWeek, { spoken: true })}, ${formatDate(b.startDate)} to ${formatDate(b.endDate)}`,
      tooltip: `Your booking · ${formatPerWeek(b.hoursPerWeek)} · ${formatDate(b.startDate)} – ${formatDate(b.endDate)}`,
      style: { left: `${at.left}%`, width: `${at.width}%` },
      sx: { top: BAND_TOP, minWidth: MARK.minDay },
      children: (
        <>
          <Typography variant="caption" noWrap component="span" sx={{ display: 'block', px: 0.5, color: 'text.primary' }}>
            {formatPerWeek(b.hoursPerWeek)}
          </Typography>
          <Box data-testid="band" data-mark sx={{ height: 4, bgcolor: BAND_COLOUR }} />
        </>
      ),
    })
  })
  // After Earlier or Later a row may have fewer marks: the stop falls back to the last one.
  const stop = Math.min(active, marks.length - 1)

  return (
    <Box component="li" sx={{ ...ROW, borderTop: 1, borderColor: 'divider' }}>
      <Box sx={NAME_CELL}>
        {/* A project's name in a list is a button that opens it, filled like every button (spec 6.2), left aligned. */}
        <Button
          component={Link}
          to={`/projects/${project.projectId}`}
          variant="contained"
          size="small"
          sx={{ justifyContent: 'flex-start', textAlign: 'left', maxWidth: '100%' }}
        >
          {project.name}
        </Button>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 0.75, mt: 0.5 }}>
          <StatusChip status={project.status} />
          {project.atRisk && (
            <Typography variant="caption" sx={{ color: 'error.main', display: 'flex', alignItems: 'center', gap: 0.25, fontWeight: 600 }}>
              <LateIcon aria-hidden="true" sx={{ fontSize: 16 }} />
              At risk
            </Typography>
          )}
        </Box>
      </Box>
      <Box onKeyDown={moveAlongRow} sx={{ position: 'relative', minHeight: bands.length ? 64 : 44 }}>
        <WeekColumns axis={axis} thisWeek={thisWeek} />
        {offScreen && (
          <Typography variant="caption" sx={{ position: 'relative', display: 'block', px: 1, pt: 1.5, color: 'text.secondary' }}>{offScreen}</Typography>
        )}
        {marks.map(({ key, ...mark }, i) => (
          <Mark key={key} {...mark} tabIndex={i === stop ? 0 : -1} onFocus={() => setActive(i)} />
        ))}
        <TodayLine axis={axis} today={today} />
      </Box>
    </Box>
  )
}

ProjectRow.propTypes = {
  project: PropTypes.shape({
    projectId: PropTypes.number.isRequired,
    name: PropTypes.string.isRequired,
    status: PropTypes.string.isRequired,
    startDate: PropTypes.string.isRequired,
    endDate: PropTypes.string.isRequired,
    atRisk: PropTypes.bool.isRequired,
    deliverables: PropTypes.arrayOf(PropTypes.shape({
      milestoneId: PropTypes.number.isRequired,
      name: PropTypes.string.isRequired,
      dueDate: PropTypes.string.isRequired,
      status: PropTypes.string.isRequired,
    })).isRequired,
    bookings: PropTypes.arrayOf(PropTypes.shape({
      userId: PropTypes.number.isRequired,
      startDate: PropTypes.string.isRequired,
      endDate: PropTypes.string.isRequired,
      hoursPerWeek: PropTypes.number.isRequired,
    })).isRequired,
  }).isRequired,
  axis: PropTypes.object.isRequired,
  today: PropTypes.string.isRequired,
  thisWeek: PropTypes.string.isRequired,
  /** The signed-in user: only their own bookings are drawn. */
  userId: PropTypes.number,
}

/** What the icons, the Today line, the wash and (when drawn) the band mean. */
function Legend({ withBand }) {
  const item = { display: 'flex', alignItems: 'center', gap: 0.75, typography: 'body2' }
  return (
    <Box component="ul" aria-label="Legend" sx={{ listStyle: 'none', m: 0, mt: 1.5, p: 0, display: 'flex', flexWrap: 'wrap', gap: 2 }}>
      {LEGEND.map(([key, word]) => {
        const Icon = ICONS[key]
        return (
          <Box component="li" key={key} sx={item}>
            <Icon aria-hidden="true" sx={{ fontSize: 18, color: key === 'LATE' ? 'error.main' : 'text.primary' }} />
            {word}
          </Box>
        )
      })}
      <Box component="li" sx={item}>
        <Box aria-hidden="true" data-mark sx={{ width: MARK.line, height: 16, bgcolor: 'secondary.main' }} />
        Today
      </Box>
      <Box component="li" sx={item}>
        <Box aria-hidden="true" data-mark sx={{ width: 16, height: 16, bgcolor: THIS_WEEK, border: 1, borderColor: 'divider' }} />
        This week
      </Box>
      {withBand && (
        <Box component="li" sx={item}>
          <Box aria-hidden="true" data-mark sx={{ width: 20, height: 4, bgcolor: BAND_COLOUR }} />
          Your booking, hours a week
        </Box>
      )}
    </Box>
  )
}

Legend.propTypes = { withBand: PropTypes.bool.isRequired }

/**
 * The home pages' timeline (Float-like): one row per project across 12 weeks, from the Monday two
 * weeks before this week. A bar for the project's span, a mark per deliverable on its due date
 * (state by icon and words), the Today line, this week washed, and your own bookings as thin
 * bands. Earlier and Later move 4 weeks without asking the server again (it sends every date);
 * pages of 10 projects come from GET /dashboard/timeline. Each row is one Tab stop; the arrow
 * keys move along its marks.
 */
export default function ProjectTimelines({ title, today = todayIso(), headingVariant = 'h3', version = 0 }) {
  const { user } = useAuth()
  const headingId = useId()
  const hintId = useId()
  const [pageNumber, setPageNumber] = useState(1)
  const [moves, setMoves] = useState(0)

  const load = useCallback(() => request('GET', '/dashboard/timeline', { query: { page: pageNumber, pageSize: PAGE_SIZE } }), [pageNumber])
  const { data, error, loading, reload } = useApi(load)
  const projects = data?.items ?? []
  // A new version from the page loads this page of projects again (the first render doesn't).
  useEffect(() => { if (version) reload() }, [version, reload])

  const axis = timelineWindow(today, moves)
  const thisWeek = mondayOf(today)
  const todayCentre = dayCentre(axis, today)
  const withBand = projects.some((p) => p.bookings.some((b) => b.userId === user?.userId && placeSpan(axis, b.startDate, b.endDate)))

  return (
    <Card component="section" aria-labelledby={headingId} sx={{ p: 2, mb: 3, minWidth: 0 }}>
      <Typography id={headingId} variant={headingVariant} component="h2">{title}</Typography>
      {/* One short line (spec 6.4); the keyboard hint is read out with the weeks below instead. */}
      <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1 }}>Hover or tap a mark for details.</Typography>
      {/* Only the first load shows the spinner: a new page keeps the old rows (and your focus) until it arrives. */}
      <PageState loading={loading && !data} error={error} onRetry={reload} empty={data && projects.length === 0 ? 'No projects yet.' : null}>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, mb: 1 }}>
          <Button variant="contained" size="small" startIcon={<PrevIcon />} onClick={() => setMoves((m) => m - 1)}>Earlier</Button>
          <Typography aria-live="polite" sx={{ minWidth: 150, textAlign: 'center' }}>{`${formatDay(axis.from)} – ${formatDate(axis.to)}`}</Typography>
          <Button variant="contained" size="small" endIcon={<NextIcon />} onClick={() => setMoves((m) => m + 1)}>Later</Button>
          {/* Never disabled: a disabled button drops the keyboard focus it holds. At this week it does nothing. */}
          <Button variant="contained" size="small" onClick={() => setMoves(0)}>This week</Button>
        </Box>
        <Box component="span" id={hintId} sx={visuallyHidden}>With a keyboard, Tab to a row and move along it with the arrow keys.</Box>
        <Box role="region" aria-label="Weeks, scrolls sideways" aria-describedby={hintId} tabIndex={0} sx={{ overflowX: 'auto', scrollPaddingLeft: NAME }}>
          <Box aria-hidden="true" sx={ROW}>
            <Box sx={{ ...NAME_CELL, py: 0.5, borderRight: 'none' }} />
            <Box sx={{ position: 'relative', pb: todayCentre === null ? 0 : 2.5 }}>
              <WeekColumns axis={axis} thisWeek={thisWeek} />
              <Box sx={{ position: 'relative', display: 'grid', gridTemplateColumns: `repeat(${WINDOW_WEEKS}, 1fr)` }}>
                {axis.weeks.map((week) => (
                  <Typography
                    key={week}
                    data-testid="week-label"
                    variant="caption"
                    sx={{ px: 0.75, py: 0.5, color: 'text.secondary', fontWeight: week === thisWeek ? 700 : 600 }}
                  >
                    {formatDay(week)}
                  </Typography>
                ))}
              </Box>
              {todayCentre !== null && (
                <Typography
                  variant="caption"
                  style={{ left: `${todayCentre}%` }}
                  sx={{ position: 'absolute', bottom: 0, transform: 'translateX(-50%)', fontWeight: 600, color: 'text.primary', whiteSpace: 'nowrap' }}
                >
                  Today
                </Typography>
              )}
            </Box>
          </Box>
          <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
            {projects.map((project) => (
              <ProjectRow
                key={project.projectId}
                project={project}
                axis={axis}
                today={today}
                thisWeek={thisWeek}
                userId={user?.userId}
              />
            ))}
          </Box>
        </Box>
        <Legend withBand={withBand} />
        <Pager page={pageNumber} totalPages={data?.totalPages} onChange={setPageNumber} />
      </PageState>
    </Card>
  )
}

ProjectTimelines.propTypes = {
  /** The section's heading, e.g. "My projects this week". */
  title: PropTypes.string.isRequired,
  /** Today (ISO, Eastern); defaults to todayIso(). Tests pass a fixed day. */
  today: PropTypes.string,
  /** The heading's size (it is always an h2): h3 beside the Dashboard's h3-sized cards, h2 among h2 sections. */
  headingVariant: PropTypes.oneOf(['h2', 'h3']),
  /** Change it to load the projects again, e.g. after a task moves; the rows stay until they arrive. */
  version: PropTypes.number,
}
