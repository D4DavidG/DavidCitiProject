import PropTypes from 'prop-types'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded'
import { formatCents, spentPercent } from '../../services/format'
import { BUDGET_COLOURS, INK, MARK, SURFACE } from '../../theme/chartColours'
import { ChartFigure, ChartLegend, ChartRow } from './ChartParts'

/** Every row runs 0 to 125% of its own budget, so rows line up and "over" has room to show. */
const SCALE = 125
/** Where the Budget (100%) line sits on that scale: 100 of 125. */
const BUDGET_AT = 100 * 100 / SCALE
const WORDS = '10rem'
const COLUMNS = { xs: '1fr', md: `1fr ${WORDS}` }
/** An aria-hidden layer over the plot column of every row: gridlines under the bars, the Budget line over them. */
const LAYER = { position: 'absolute', top: 0, bottom: 0, left: 0, right: { xs: 0, md: WORDS }, pointerEvents: 'none' }
/** Text that the Budget line may cross: painted above it, on the card's white, only as wide as the words. */
const OVER_LINE = { position: 'relative', zIndex: 1, bgcolor: SURFACE, width: 'fit-content' }
// Text colours go in sx: MUI 9's Typography `color` prop ignores dotted paths such as 'error.main'.

const AXIS = [['0%', 0], ['50%', 50], ['100% Budget', 100], ['125%', 125]]

const LEGEND = [
  { label: 'Spent', colour: BUDGET_COLOURS.spent, kind: 'swatch' },
  { label: 'Waiting for approval', colour: BUDGET_COLOURS.waiting, kind: 'swatch' },
  { label: 'Planned', colour: INK, kind: 'line' },
  { label: 'Over budget', colour: BUDGET_COLOURS.over, kind: 'problem' },
]

/** A server percentage as a position on the 0 to 125% row, in percent of the row. Percentages only, never cents. */
function place(percent) {
  return Math.min(percent, SCALE) * 100 / SCALE
}

/** A percentage that must show at least a 1% sliver when real money sits behind it. */
function drawn(percent, cents) {
  return cents > 0 && !percent ? 1 : (percent ?? 0)
}

/** The arrow that says a mark was cut off at the edge of the scale; `outside` puts it just past the edge, for the Planned tick. */
function Arrow({ outside }) {
  return (
    <Box component="span" aria-hidden="true" sx={{ position: 'absolute', right: outside ? -10 : 0, top: '50%', transform: 'translateY(-50%)', lineHeight: 1, fontSize: 12, color: INK, zIndex: 1 }}>
      ▸
    </Box>
  )
}

Arrow.propTypes = { outside: PropTypes.bool }

/**
 * The sentence a row's tooltip and aria-label carry, ending in the name. role="img" hides the
 * row's own text from screen readers, so both red warnings the row shows are in here too.
 */
function rowTooltip(p, over) {
  if (!(p.budgetCents > 0)) return `No budget set · ${formatCents(p.consumedCents)} spent · ${p.name}`
  const planned = p.plannedCents > 0
    ? `${formatCents(p.plannedCents)} planned (${spentPercent(p.plannedPercent, p.plannedCents)})`
    : 'nothing planned'
  const overWord = over ? ' · over budget' : ''
  const plannedOverWord = p.plannedOverBudget ? ' · planned cost is over budget' : ''
  return `${formatCents(p.consumedCents)} spent (${spentPercent(p.consumedPercent, p.consumedCents)}) · ${formatCents(p.pendingCents)} waiting (${spentPercent(p.pendingPercent, p.pendingCents)}) · ${planned} · budget ${formatCents(p.budgetCents)}${overWord}${plannedOverWord} · ${p.name}`
}

/**
 * One project's bar: the track, spent from zero, waiting after a 2 px gap, the Planned tick.
 * Arrows mark a bar or tick that runs past 125%.
 */
function BudgetBars({ project: p, over }) {
  const spent = drawn(p.consumedPercent, p.consumedCents)
  const spentEnd = Math.min(spent, SCALE)
  const waiting = Math.min(drawn(p.pendingPercent, p.pendingCents), Math.max(SCALE - spentEnd, 0))
  const waitingCut = spentEnd + drawn(p.pendingPercent, p.pendingCents) > SCALE
  const barColour = over ? BUDGET_COLOURS.over : BUDGET_COLOURS.spent
  return (
    <Box sx={{ position: 'relative', height: MARK.bar }}>
      <Box aria-hidden="true" sx={{ position: 'absolute', inset: 0 }} style={{ background: BUDGET_COLOURS.track }} />
      <Box
        data-testid="spent"
        data-mark
        data-state={over ? 'over' : undefined}
        sx={{ position: 'absolute', top: 0, bottom: 0, left: 0 }}
        style={{ width: `${place(spent)}%`, background: barColour, borderRadius: `0 ${MARK.radius}px ${MARK.radius}px 0` }}
      />
      {waiting > 0 && (
        <Box
          data-testid="waiting"
          data-mark
          sx={{ position: 'absolute', top: 0, bottom: 0, boxSizing: 'content-box', backgroundClip: 'padding-box' }}
          style={{
            left: `${place(spentEnd)}%`,
            width: `${place(waiting)}%`,
            background: BUDGET_COLOURS.waiting,
            borderLeft: spentEnd > 0 ? `${MARK.gap}px solid ${SURFACE}` : undefined,
            borderRadius: `0 ${MARK.radius}px ${MARK.radius}px 0`,
          }}
        />
      )}
      {p.plannedCents > 0 && (
        <Box
          data-testid="planned"
          data-mark
          sx={{ position: 'absolute', transform: 'translateX(-50%)' }}
          style={{ left: `${place(p.plannedPercent ?? 0)}%`, top: -4, width: `${MARK.line}px`, height: 20, background: INK }}
        />
      )}
      {(spent > SCALE || waitingCut) && <Arrow />}
      {p.plannedCents > 0 && (p.plannedPercent ?? 0) > SCALE && <Arrow outside />}
    </Box>
  )
}

BudgetBars.propTypes = { project: PropTypes.object.isRequired, over: PropTypes.bool.isRequired }

/**
 * Question 7 as a picture: each project against its own budget on a 0 to 125% row. Solid bar is
 * spent (approved time), lighter is waiting for approval, the dark tick is planned cost. Over budget
 * is the server's remainingCents < 0, so $5 over still says so; it carries a word and an icon.
 * Every position is a server percentage; the browser does no money arithmetic.
 * @param {object} props projects: the dashboard cards, in the order the server sent them
 */
export default function BudgetChart({ projects }) {
  const isOver = (p) => p.budgetCents > 0 && p.remainingCents < 0
  const overCount = projects.filter(isOver).length
  return (
    <ChartFigure
      title="Budget by project"
      summary={`${overCount} of ${projects.length} projects are over budget.`}
      axis={(
        <Box aria-hidden="true" sx={{ display: 'grid', gridTemplateColumns: COLUMNS }}>
          <Box sx={{ position: 'relative', height: '1.5rem' }}>
            {AXIS.map(([label, at]) => {
              const left = place(at)
              return (
                <Typography
                  key={label}
                  variant="caption"
                  sx={{ color: 'text.secondary', position: 'absolute', top: 0, whiteSpace: 'nowrap', fontWeight: at === 100 ? 600 : 400 }}
                  style={{ left: `${left}%`, transform: `translateX(-${left}%)` }}
                >
                  {label}
                </Typography>
              )
            })}
          </Box>
        </Box>
      )}
      legend={<ChartLegend items={LEGEND} />}
    >
      {projects.map((p) => {
        const over = isOver(p)
        const hasBudget = p.budgetCents > 0
        const planned = p.plannedPercent ?? 0
        let words = `No budget set · ${formatCents(p.consumedCents)} spent`
        if (hasBudget) words = `${formatCents(p.consumedCents)} of ${formatCents(p.budgetCents)}${planned > SCALE ? ` · Planned ${planned}%` : ''}`
        return (
          <ChartRow key={p.projectId} tooltip={rowTooltip(p, over)}>
            <Box sx={{ position: 'relative', display: 'grid', gridTemplateColumns: COLUMNS, alignItems: 'center' }}>
              <Box sx={{ gridColumn: '1 / -1', overflowWrap: 'anywhere', display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 1 }}>
                <Typography variant="body2" sx={OVER_LINE}>{p.name}</Typography>
                {over && (
                  <Typography variant="body2" sx={{ ...OVER_LINE, color: 'error.main', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <WarningAmberRoundedIcon aria-hidden="true" sx={{ fontSize: 16 }} />
                    <span>Over budget</span>
                  </Typography>
                )}
              </Box>
              {hasBudget && <BudgetBars project={p} over={over} />}
              <Typography variant="body2" sx={{ ...OVER_LINE, color: 'text.secondary', pl: { md: hasBudget ? 1.5 : 0 }, gridColumn: hasBudget ? undefined : '1 / -1' }}>
                {words}
              </Typography>
              {p.plannedOverBudget && hasBudget && (
                <Typography variant="body2" sx={{ ...OVER_LINE, color: 'error.main', gridColumn: '1 / -1' }}>
                  Planned cost is over budget
                </Typography>
              )}
            </Box>
          </ChartRow>
        )
      })}
      <Box component="li" aria-hidden="true" sx={LAYER}>
        <Box
          data-testid="budget-line"
          data-mark
          sx={{ position: 'absolute', top: 0, bottom: 0 }}
          style={{ left: `${BUDGET_AT}%`, width: `${MARK.line}px`, background: INK }}
        />
      </Box>
    </ChartFigure>
  )
}

BudgetChart.propTypes = {
  projects: PropTypes.arrayOf(PropTypes.shape({
    projectId: PropTypes.number.isRequired,
    name: PropTypes.string.isRequired,
    budgetCents: PropTypes.number.isRequired,
    consumedCents: PropTypes.number.isRequired,
    pendingCents: PropTypes.number,
    plannedCents: PropTypes.number.isRequired,
    consumedPercent: PropTypes.number,
    pendingPercent: PropTypes.number,
    plannedPercent: PropTypes.number,
    remainingCents: PropTypes.number,
    plannedOverBudget: PropTypes.bool,
  })).isRequired,
}
