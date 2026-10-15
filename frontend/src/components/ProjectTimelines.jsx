import { useCallback, useId, useState } from 'react'
import PropTypes from 'prop-types'
import { Link } from 'react-router'
import { Box, Button, Card, Link as MuiLink, Tooltip, Typography } from '@mui/material'
import { alpha } from '@mui/material/styles'
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
import { keepColours } from '../pages/schedule/schedule'
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

/** The name, then the weeks; every row and the week header share it, so their columns line up. */
const ROW = {
  display: 'grid',
  gridTemplateColumns: { xs: `${NAME.xs} minmax(calc(${WINDOW_WEEKS} * ${WEEK}), 1fr)`, md: `${NAME.md} minmax(calc(${WINDOW_WEEKS} * ${WEEK}), 1fr)` },
}
/** The name stays on screen while the weeks scroll sideways under it. */
const NAME_CELL = {
  position: 'sticky', left: 0, zIndex: 2, bgcolor: 'background.paper', pr: 1, py: 1,
  borderRight: 1, borderColor: 'divider', overflowWrap: 'anywhere',
}

/**
 * Something on the timeline with a tooltip. It takes focus, so the tooltip opens on hover, on
 * keyboard focus and on a tap alike; its aria-label is the same sentence in spoken form.
 */
function Mark({ label, tooltip, style, sx, state, children }) {
  return (
    <Tooltip title={tooltip} arrow enterTouchDelay={0} leaveTouchDelay={4000}>
      <Box
        role="img"
        aria-label={label}
        tabIndex={0}
        data-mark
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

/** One project: its name and status, then its span, deliverables and (yours only) bookings across the weeks. */
function ProjectRow({ project, axis, today, thisWeek, colour, userId }) {
  const status = STATUS_WORDS[project.status] ?? project.status
  const place = placeSpan(axis, project.startDate, project.endDate)
  const risk = project.atRisk ? ', at risk' : ''
  const bookings = project.bookings
    .filter((b) => b.userId === userId)
    .map((b) => ({ booking: b, place: placeSpan(axis, b.startDate, b.endDate) }))
    .filter((b) => b.place)
  let offScreen = null
  if (!place) offScreen = project.endDate < axis.from ? `Ended ${formatDate(project.endDate)}` : `Starts ${formatDate(project.startDate)}`
  return (
    <Box component="li" sx={{ ...ROW, borderTop: 1, borderColor: 'divider' }}>
      <Box sx={NAME_CELL}>
        <MuiLink component={Link} to={`/projects/${project.projectId}`} sx={{ fontWeight: 600 }}>{project.name}</MuiLink>
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
      <Box sx={{ position: 'relative', minHeight: bookings.length ? 64 : 44 }}>
        <WeekColumns axis={axis} thisWeek={thisWeek} />
        {place && (
          <Mark
            label={`${project.name} project, ${status}${risk}, ${formatDate(project.startDate)} to ${formatDate(project.endDate)}`}
            tooltip={`${project.name} · ${status}${project.atRisk ? ' · At risk' : ''} · ${formatDate(project.startDate)} – ${formatDate(project.endDate)}`}
            style={{ left: `${place.left}%`, width: `${place.width}%`, backgroundColor: colour }}
            sx={{ top: BAR_TOP, height: MARK.bar, minWidth: MARK.minDay }}
          />
        )}
        {offScreen && (
          <Typography variant="caption" sx={{ position: 'relative', display: 'block', px: 1, pt: 1.5, color: 'text.secondary' }}>{offScreen}</Typography>
        )}
        {project.deliverables.map((d) => {
          const centre = dayCentre(axis, d.dueDate)
          if (centre === null) return null
          const state = deliverableState(d, today)
          const Icon = ICONS[state.key] ?? NotStartedIcon
          const late = state.key === 'LATE'
          return (
            <Mark
              key={d.milestoneId}
              label={`${project.name} deliverable ${d.name}, due ${formatDate(d.dueDate)}, ${state.word}`}
              tooltip={`${d.name} · due ${formatDate(d.dueDate)} · ${state.word}`}
              state={late ? 'late' : undefined}
              style={{ left: `${centre}%`, marginLeft: -MARK_SIZE / 2 }}
              sx={{
                top: BAR_TOP + MARK.bar / 2 - MARK_SIZE / 2, width: MARK_SIZE, height: MARK_SIZE, display: 'grid', placeItems: 'center',
                borderRadius: '50%', bgcolor: 'background.paper', color: late ? 'error.main' : 'text.primary', zIndex: 2,
              }}
            >
              <Icon aria-hidden="true" sx={{ fontSize: 20 }} />
            </Mark>
          )
        })}
        {bookings.map(({ booking, place: at }) => (
          <Mark
            key={`${booking.startDate}-${booking.endDate}`}
            label={`Your booking on ${project.name}, ${formatPerWeek(booking.hoursPerWeek, { spoken: true })}, ${formatDate(booking.startDate)} to ${formatDate(booking.endDate)}`}
            tooltip={`Your booking · ${formatPerWeek(booking.hoursPerWeek)} · ${formatDate(booking.startDate)} – ${formatDate(booking.endDate)}`}
            style={{ left: `${at.left}%`, width: `${at.width}%` }}
            sx={{ top: BAND_TOP, minWidth: MARK.minDay }}
          >
            <Typography variant="caption" noWrap component="span" sx={{ display: 'block', px: 0.5, color: 'text.primary' }}>
              {formatPerWeek(booking.hoursPerWeek)}
            </Typography>
            <Box data-testid="band" data-mark style={{ height: 4, backgroundColor: colour }} />
          </Mark>
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
  colour: PropTypes.string.isRequired,
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
          <Box aria-hidden="true" data-mark sx={{ width: 20, height: 4, bgcolor: 'text.secondary' }} />
          Your booking, hours a week
        </Box>
      )}
    </Box>
  )
}

Legend.propTypes = { withBand: PropTypes.bool.isRequired }

/**
 * The home pages' timeline (Float-like): one row per project across 12 weeks, from the Monday two
 * weeks before this week. A bar for the project's span in its project colour, a mark per
 * deliverable on its due date (state by icon and words), the Today line, this week washed,
 * and your own bookings as thin bands. Earlier and Later move 4 weeks without asking the server
 * again (it sends every date); pages of 10 projects come from GET /dashboard/timeline.
 */
export default function ProjectTimelines({ title, today = todayIso() }) {
  const { user } = useAuth()
  const headingId = useId()
  const [pageNumber, setPageNumber] = useState(1)
  const [moves, setMoves] = useState(0)
  const [known, setKnown] = useState(() => new Map())

  const load = useCallback(() => request('GET', '/dashboard/timeline', { query: { page: pageNumber, pageSize: PAGE_SIZE } }), [pageNumber])
  const { data, error, loading, reload } = useApi(load)
  const projects = data?.items ?? []

  // A project keeps the colour it was first given while the page is open, as on the Schedule.
  const colours = keepColours(known, projects.map((p) => p.projectId))
  if (colours !== known) setKnown(colours)

  const axis = timelineWindow(today, moves)
  const thisWeek = mondayOf(today)
  const todayCentre = dayCentre(axis, today)
  const withBand = projects.some((p) => p.bookings.some((b) => b.userId === user?.userId && placeSpan(axis, b.startDate, b.endDate)))

  return (
    <Card component="section" aria-labelledby={headingId} sx={{ p: 2, mb: 3, minWidth: 0 }}>
      <Typography id={headingId} variant="h3" component="h2">{title}</Typography>
      <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1 }}>
        One row per project, from its start to its end date, with its deliverables on their due dates. Hover, focus or tap a mark for details.
      </Typography>
      <PageState loading={loading} error={error} onRetry={reload} empty={data && projects.length === 0 ? 'No projects yet.' : null}>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, mb: 1 }}>
          <Button size="small" startIcon={<PrevIcon />} onClick={() => setMoves((m) => m - 1)}>Earlier</Button>
          <Typography sx={{ minWidth: 150, textAlign: 'center' }}>{`${formatDay(axis.from)} – ${formatDate(axis.to)}`}</Typography>
          <Button size="small" endIcon={<NextIcon />} onClick={() => setMoves((m) => m + 1)}>Later</Button>
          <Button size="small" onClick={() => setMoves(0)} disabled={moves === 0}>This week</Button>
        </Box>
        <Box role="region" aria-label="Weeks, scrolls sideways" tabIndex={0} sx={{ overflowX: 'auto', scrollPaddingLeft: NAME }}>
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
                colour={colours.get(project.projectId)}
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
}
