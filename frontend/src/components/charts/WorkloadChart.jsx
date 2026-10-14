import PropTypes from 'prop-types'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded'
import {
  GRID, INK, MARK, OTHER_COLOUR, OVER, SURFACE, projectColours,
} from '../../theme/chartColours'
import { ChartFigure, ChartLegend, ChartRow } from './ChartParts'

/** Ticks on the hour axis every 20 h; the axis ends on the next tick past the largest booking or capacity. */
const STEP = 20
/** Width of the right-hand words on desktop; on phones they drop under the bar. */
const WORDS = '10rem'
const COLUMNS = { xs: '1fr', md: `1fr ${WORDS}` }
/** An aria-hidden layer over the plot column of every row: the gridlines, under the bars. */
const LAYER = { position: 'absolute', top: 0, bottom: 0, left: 0, right: { xs: 0, md: WORDS }, pointerEvents: 'none' }
/** Text a gridline may cross: painted above it, on the card's white, only as wide as the words. */
const OVER_LINE = { position: 'relative', zIndex: 1, bgcolor: SURFACE, width: 'fit-content' }
// Text colours go in sx: MUI 9's Typography `color` prop ignores dotted paths such as 'error.main'.

/** The one week the chart draws: the first (and, with weeks=1, only) week the server sent. */
const thisWeek = (person) => person.weeks[0]

/**
 * A person's projects in slot order (lowest projectId first, as projectColours assigns them),
 * with every project past the 5th slot folded into one Other piece at the end.
 */
function pieces(projects, colours) {
  const sorted = [...projects].sort((a, b) => a.projectId - b.projectId)
  const named = sorted.filter((p) => colours.get(p.projectId) !== OTHER_COLOUR)
    .map((p) => ({ key: p.projectId, colour: colours.get(p.projectId), hours: p.hours }))
  const otherHours = sorted.filter((p) => colours.get(p.projectId) === OTHER_COLOUR).reduce((sum, p) => sum + p.hours, 0)
  return otherHours > 0 ? [...named, { key: 'other', colour: OTHER_COLOUR, hours: otherHours }] : named
}

/**
 * The sentence a row's tooltip and aria-label carry: value first (with "+N h over" when shown),
 * then every project's full hours, then the name. role="img" hides the row's own text from
 * screen readers, so every word the row shows must be in here.
 */
function rowTooltip(person) {
  const week = thisWeek(person)
  const list = [...week.projects].sort((a, b) => a.projectId - b.projectId).map((p) => `${p.name} ${p.hours} h`).join(', ')
  const over = week.overAllocated ? `, +${week.overByHours} h over` : ''
  return `${week.bookedHours} h booked, capacity ${person.capacityHours} h${over} · ${list || 'Not booked'} · ${person.name}`
}

/** The figure's one-line summary: who is over capacity this week, and by how much. */
function overSummary(people) {
  const over = people.filter((p) => thisWeek(p).overAllocated)
  if (over.length === 0) return 'No one is over capacity this week.'
  const names = over.map((p) => `${p.name}, +${thisWeek(p).overByHours} h`).join('; ')
  return `${over.length} ${over.length === 1 ? 'person is' : 'people are'} over capacity this week: ${names}.`
}

/**
 * One person's bar: project segments in slot order filling up to capacity, then one red segment for
 * the hours past it, then the 2 px capacity line. `at` turns hours into a percent of the axis.
 */
function WorkloadBar({ person, colours, at }) {
  const week = thisWeek(person)
  const capacity = person.capacityHours
  const marks = []
  let used = 0
  pieces(week.projects, colours).forEach(({ key, colour, hours }) => {
    const fill = Math.min(hours, Math.max(capacity - used, 0))
    if (fill > 0) marks.push({ key, testId: 'segment', colour, left: at(used), width: at(fill) })
    used += fill
  })
  if (week.overAllocated && week.overByHours > 0) {
    marks.push({ key: 'over', testId: 'over', colour: OVER, left: at(capacity), width: at(week.overByHours), state: 'over' })
  }
  return (
    <Box sx={{ position: 'relative', height: MARK.bar }}>
      {marks.map((m, i) => (
        <Box
          key={m.key}
          data-testid={m.testId}
          data-mark
          data-state={m.state}
          sx={{ position: 'absolute', top: 0, bottom: 0, boxSizing: 'border-box', backgroundClip: 'padding-box' }}
          style={{
            left: `${m.left}%`,
            width: `${m.width}%`,
            backgroundColor: m.colour,
            borderLeft: i > 0 ? `${MARK.gap}px solid ${SURFACE}` : undefined,
            borderRadius: i === marks.length - 1 ? `0 ${MARK.radius}px ${MARK.radius}px 0` : undefined,
          }}
        />
      ))}
      <Box
        data-testid="capacity"
        data-mark
        sx={{ position: 'absolute', transform: 'translateX(-50%)' }}
        style={{ left: `${at(capacity)}%`, top: -4, width: `${MARK.line}px`, height: 20, background: INK }}
      />
    </Box>
  )
}

WorkloadBar.propTypes = {
  person: PropTypes.object.isRequired,
  colours: PropTypes.instanceOf(Map).isRequired,
  at: PropTypes.func.isRequired,
}

/**
 * Questions 3 and 5 as a picture: one stacked bar per person for this week, a segment per project
 * (coloured by projectId, so a project looks the same in every bar), filled up to that person's
 * capacity line, with the hours past it as one red segment that also carries a word and the icon.
 * Arithmetic is on hours only.
 * @param {object} props people: GET /dashboard/allocation items (worst first); total: how many people the server has
 */
export default function WorkloadChart({ people, total }) {
  const colours = projectColours(people.flatMap((p) => thisWeek(p).projects.map((pr) => pr.projectId)))
  const names = new Map(people.flatMap((p) => thisWeek(p).projects.map((pr) => [pr.projectId, pr.name])))
  const largest = Math.max(0, ...people.flatMap((p) => [thisWeek(p).bookedHours, p.capacityHours]))
  const axisEnd = Math.max(STEP, Math.ceil(largest / STEP) * STEP)
  const at = (hours) => hours * 100 / axisEnd
  const ticks = Array.from({ length: axisEnd / STEP + 1 }, (_, i) => i * STEP)

  const slotted = [...colours].filter(([, colour]) => colour !== OTHER_COLOUR)
  const otherCount = colours.size - slotted.length
  const legend = [
    ...slotted.map(([id, colour]) => ({ id, label: names.get(id), colour, kind: 'swatch' })),
    ...(otherCount ? [{ label: `Other (${otherCount})`, colour: OTHER_COLOUR, kind: 'swatch' }] : []),
    { label: 'Over capacity', colour: OVER, kind: 'problem' },
    { label: 'Capacity', colour: INK, kind: 'line' },
  ]

  return (
    <ChartFigure
      title="Workload this week · all projects"
      summary={overSummary(people)}
      axis={(
        <Box aria-hidden="true" data-testid="hour-axis" sx={{ display: 'grid', gridTemplateColumns: COLUMNS }}>
          <Box sx={{ position: 'relative', height: '1.5rem' }}>
            {ticks.map((h) => (
              <Typography
                key={h}
                variant="caption"
                sx={{ color: 'text.secondary', position: 'absolute', top: 0, whiteSpace: 'nowrap' }}
                style={{ left: `${at(h)}%`, transform: `translateX(-${at(h)}%)` }}
              >
                {`${h} h`}
              </Typography>
            ))}
          </Box>
        </Box>
      )}
      legend={<ChartLegend items={legend} />}
      note={total > people.length && (
        <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1 }}>
          {`Showing ${people.length} of ${total} people, most over first.`}
        </Typography>
      )}
    >
      <Box component="li" aria-hidden="true" sx={LAYER}>
        {ticks.map((h) => (
          <Box key={h} sx={{ position: 'absolute', top: 0, bottom: 0 }} style={{ left: `${at(h)}%`, width: '1px', background: GRID }} />
        ))}
      </Box>
      {people.map((person) => {
        const week = thisWeek(person)
        return (
          <ChartRow key={person.userId} tooltip={rowTooltip(person)}>
            <Box sx={{ position: 'relative', display: 'grid', gridTemplateColumns: COLUMNS, alignItems: 'center' }}>
              <Box sx={{ gridColumn: '1 / -1', overflowWrap: 'anywhere', display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 1 }}>
                <Typography variant="body2" sx={OVER_LINE}>{person.name}</Typography>
                {week.overAllocated && (
                  <Typography variant="body2" sx={{ ...OVER_LINE, color: 'error.main', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <WarningAmberRoundedIcon aria-hidden="true" sx={{ fontSize: 16 }} />
                    <span>{`+${week.overByHours} h over`}</span>
                  </Typography>
                )}
                {week.bookedHours === 0 && (
                  <Typography variant="body2" sx={{ ...OVER_LINE, color: 'text.secondary' }}>Not booked</Typography>
                )}
              </Box>
              <WorkloadBar person={person} colours={colours} at={at} />
              <Typography variant="body2" sx={{ ...OVER_LINE, color: 'text.secondary', pl: { md: 1.5 } }}>
                {`${week.bookedHours} / ${person.capacityHours} h`}
              </Typography>
            </Box>
          </ChartRow>
        )
      })}
    </ChartFigure>
  )
}

const projectShape = PropTypes.shape({
  projectId: PropTypes.number.isRequired,
  name: PropTypes.string.isRequired,
  hours: PropTypes.number.isRequired,
})

WorkloadChart.propTypes = {
  /** GET /dashboard/allocation items, in the server's order (most over first); weeks[0] is this week. */
  people: PropTypes.arrayOf(PropTypes.shape({
    userId: PropTypes.number.isRequired,
    name: PropTypes.string.isRequired,
    capacityHours: PropTypes.number.isRequired,
    weeks: PropTypes.arrayOf(PropTypes.shape({
      bookedHours: PropTypes.number.isRequired,
      overByHours: PropTypes.number.isRequired,
      overAllocated: PropTypes.bool.isRequired,
      projects: PropTypes.arrayOf(projectShape).isRequired,
    })).isRequired,
  })).isRequired,
  /** How many people the server has in all, so the chart can say when it shows only some. */
  total: PropTypes.number.isRequired,
}
