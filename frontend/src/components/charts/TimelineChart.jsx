import PropTypes from 'prop-types'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded'
import { formatDate, formatDay, spentPercent, todayIso } from '../../services/format'
import { useIsMobile } from '../../theme/responsive'
import { GRID, INK, MARK, STATE_COLOURS, SURFACE } from '../../theme/chartColours'
import { ChartFigure, ChartLegend, ChartRow } from './ChartParts'
import { isLate, monthTicks, offset, span, timelineAxis } from './timeline'

/** Width of the right-hand words on desktop; on phones they drop under the bar. */
const WORDS = '10rem'
const COLUMNS = { xs: '1fr', md: `1fr ${WORDS}` }
/** An aria-hidden layer over the plot column of every row: gridlines under the bars, the Today line over them. */
const LAYER = { position: 'absolute', top: 0, bottom: 0, left: 0, right: { xs: 0, md: WORDS }, pointerEvents: 'none' }

/**
 * Text that the Today line may cross: painted above it (the line's layer comes after the rows),
 * on the card's white, and only as wide as the words, so the line breaks around them.
 */
const OVER_LINE = { position: 'relative', zIndex: 1, bgcolor: SURFACE, width: 'fit-content' }
// Text colours go in sx: MUI 9's Typography `color` prop ignores dotted paths such as 'error.main'.

const STATE_WORDS = { DONE: 'Done', IN_PROGRESS: 'In progress', NOT_STARTED: 'Not started', BLOCKED: 'Blocked' }

const LEGEND = [
  { label: 'Done', colour: STATE_COLOURS.DONE.fill, kind: 'swatch' },
  { label: 'In progress', colour: STATE_COLOURS.IN_PROGRESS.fill, kind: 'swatch' },
  { label: 'Not started or blocked', colour: STATE_COLOURS.NOT_STARTED.fill, kind: 'swatch' },
  { label: 'Late', colour: STATE_COLOURS.LATE.fill, kind: 'problem' },
]

/** A label on the axis at `left` percent, shifted by the same share of its own width so it never leaves the chart. */
function AxisLabel({ left, bottom, children }) {
  return (
    <Typography
      variant="caption"
      sx={{ color: 'text.secondary', position: 'absolute', whiteSpace: 'nowrap', fontWeight: bottom ? 600 : 400 }}
      style={{ left: `${left}%`, transform: `translateX(-${left}%)`, [bottom ? 'bottom' : 'top']: 0 }}
    >
      {children}
    </Typography>
  )
}

AxisLabel.propTypes = {
  left: PropTypes.number.isRequired,
  bottom: PropTypes.bool,
  children: PropTypes.node.isRequired,
}

/**
 * Question 4 as a picture: one bar per deliverable on a date axis, from its start to its due day,
 * filled to its progress and coloured by its state. Late (past due, not signed off) wins, and
 * carries a word and the warning icon. Positions are day counts, never money.
 * @param {object} props deliverables and edges from GET /projects/{id}/dependency-graph, the project's dates, today
 */
export default function TimelineChart({ deliverables, edges, projectStart, projectEnd, today = todayIso() }) {
  const isMobile = useIsMobile()
  const axis = timelineAxis(deliverables, projectStart, projectEnd)
  const ticks = monthTicks(axis.from, axis.to, isMobile ? 3 : 6)
  const names = new Map(deliverables.map((d) => [d.milestoneId, d.name]))
  const todayShown = today >= axis.from && today <= axis.to

  const done = deliverables.filter((d) => d.status === 'DONE').length
  const late = deliverables.filter((d) => isLate(d, today)).length
  const count = deliverables.length
  const summary = `${count} ${count === 1 ? 'deliverable' : 'deliverables'}: ${done} done, ${late} late.`
  let note = null
  if (today < axis.from) note = 'Today is before the start'
  if (today > axis.to) note = 'Today is after the end'

  return (
    <ChartFigure
      title="Deliverables timeline"
      summary={summary}
      axis={(
        <Box aria-hidden="true" sx={{ display: 'grid', gridTemplateColumns: COLUMNS }}>
          <Box sx={{ position: 'relative', height: '2.5rem' }}>
            {ticks.map((t) => <AxisLabel key={t} left={offset(axis, t)}>{formatDay(t)}</AxisLabel>)}
            {todayShown && <AxisLabel left={offset(axis, today)} bottom>Today</AxisLabel>}
          </Box>
        </Box>
      )}
      legend={<ChartLegend items={LEGEND} />}
      note={note && <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1 }}>{note}</Typography>}
    >
      <Box component="li" aria-hidden="true" sx={LAYER}>
        {ticks.map((t) => (
          <Box key={t} sx={{ position: 'absolute', top: 0, bottom: 0 }} style={{ left: `${offset(axis, t)}%`, width: '1px', background: GRID }} />
        ))}
      </Box>
      {deliverables.map((d) => {
        const after = edges.filter((e) => e.from === d.milestoneId && names.has(e.to)).map((e) => names.get(e.to))
        const afterText = after.length ? ` · after ${after.join(', ')}` : ''
        const lateNow = isLate(d, today)
        const colours = lateNow ? STATE_COLOURS.LATE : STATE_COLOURS[d.status]
        const percent = spentPercent(d.progressPercent, d.doneEstimateMinutes)
        const stateWord = lateNow ? 'Late' : STATE_WORDS[d.status]
        let words = stateWord
        if (lateNow) words = `Late, ${percent}`
        else if (d.status === 'IN_PROGRESS') words = `In progress ${percent}`
        const outside = d.startDate < projectStart || d.dueDate > projectEnd
        const { left, width } = span(axis, d.startDate, d.dueDate)
        const problem = lateNow ? 'late' : undefined
        const tooltip = `${percent} done · ${d.name} · ${formatDay(d.startDate)} – ${formatDate(d.dueDate)} · ${stateWord}${afterText}`
        return (
          <ChartRow key={d.milestoneId} tooltip={tooltip}>
            <Box sx={{ position: 'relative', display: 'grid', gridTemplateColumns: COLUMNS, alignItems: 'center' }}>
              <Box sx={{ gridColumn: '1 / -1', overflowWrap: 'anywhere' }}>
                <Typography variant="body2" sx={OVER_LINE}>{d.name}{afterText}</Typography>
                {outside && <Typography variant="caption" component="p" sx={{ ...OVER_LINE, color: 'text.secondary' }}>Outside project dates</Typography>}
              </Box>
              <Box sx={{ position: 'relative', height: MARK.bar }}>
                <Box
                  data-testid="bar"
                  data-mark
                  data-state={problem}
                  sx={{ position: 'absolute', top: 0, bottom: 0, overflow: 'hidden' }}
                  style={{ left: `${left}%`, width: `${width}%`, minWidth: `${MARK.minDay}px`, borderRadius: `${MARK.radius}px`, background: colours.track }}
                >
                  <Box data-testid="fill" data-mark data-state={problem} style={{ height: '100%', width: `${d.progressPercent}%`, background: colours.fill }} />
                </Box>
              </Box>
              <Typography
                variant="body2"
                sx={{ ...OVER_LINE, color: lateNow ? 'error.main' : 'text.secondary', display: 'flex', alignItems: 'center', gap: 0.5, pl: { md: 1.5 } }}
              >
                {lateNow && <WarningAmberRoundedIcon aria-hidden="true" sx={{ fontSize: 16 }} />}
                <span>{words}</span>
              </Typography>
            </Box>
          </ChartRow>
        )
      })}
      {todayShown && (
        <Box component="li" aria-hidden="true" sx={LAYER}>
          <Box
            data-testid="today"
            data-mark
            sx={{ position: 'absolute', top: 0, bottom: 0 }}
            style={{ left: `${offset(axis, today)}%`, width: `${MARK.line}px`, background: INK }}
          />
        </Box>
      )}
    </ChartFigure>
  )
}

const deliverableShape = PropTypes.shape({
  milestoneId: PropTypes.number.isRequired,
  name: PropTypes.string.isRequired,
  startDate: PropTypes.string.isRequired,
  dueDate: PropTypes.string.isRequired,
  status: PropTypes.oneOf(['DONE', 'IN_PROGRESS', 'NOT_STARTED', 'BLOCKED']).isRequired,
  progressPercent: PropTypes.number.isRequired,
  doneEstimateMinutes: PropTypes.number,
})

TimelineChart.propTypes = {
  /** The dependency graph's nodes: the same deliverable rows as the cards below. */
  deliverables: PropTypes.arrayOf(deliverableShape).isRequired,
  /** The dependency graph's edges: `from` waits on `to`. */
  edges: PropTypes.arrayOf(PropTypes.shape({ from: PropTypes.number.isRequired, to: PropTypes.number.isRequired })).isRequired,
  /** The project's start date (ISO). */
  projectStart: PropTypes.string.isRequired,
  /** The project's predicted end date (ISO). */
  projectEnd: PropTypes.string.isRequired,
  /** Today (ISO, Eastern); defaults to todayIso(). */
  today: PropTypes.string,
}
