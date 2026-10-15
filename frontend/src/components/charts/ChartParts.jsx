import { useId } from 'react'
import PropTypes from 'prop-types'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded'
import { MARK, useChartColours } from '../../theme/chartColours'

/**
 * A chart's frame: a figure named by its heading, a one-line summary, then axis, rows, legend and note.
 * The card is the theme's card colour (white, or near-black in dark mode).
 * Marks carry data-mark; problem marks carry data-state="late" or "over" and get stripes only in
 * print and high-contrast mode, so colour is never the only signal.
 * `scroll` (the box's name) puts the axis and rows in a box that scrolls sideways (the Schedule's
 * 26 weeks), so the page itself never does. The box is always one Tab stop, so the keyboard can
 * scroll it even when nothing inside takes focus; `scrollPaddingLeft` keeps a sticky first column
 * from covering whatever focus scrolls into view. `legendFirst` puts the legend above the rows.
 * @param {object} props title, summary, optional axis, legend, note, scroll, scrollPaddingLeft, legendFirst; children are the rows (li)
 */
export function ChartFigure({
  title, summary, axis, legend, note, scroll, scrollPaddingLeft, legendFirst = false, children,
}) {
  const headingId = useId()
  const { stripe } = useChartColours()
  const stripes = `repeating-linear-gradient(45deg, ${stripe} 0 2px, transparent 2px 6px)`
  return (
    <Card
      component="figure"
      aria-labelledby={headingId}
      sx={{
        m: 0,
        p: 2,
        bgcolor: 'background.paper',
        '& [data-mark]': { forcedColorAdjust: 'none' },
        '@media print, (forced-colors: active)': {
          '& [data-state="late"], & [data-state="over"]': { backgroundImage: `${stripes} !important` },
        },
      }}
    >
      <Typography id={headingId} variant="h3" component="h2">{title}</Typography>
      <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1 }}>{summary}</Typography>
      {legendFirst && legend}
      <Box
        {...(scroll && { role: 'region', 'aria-label': scroll, tabIndex: 0 })}
        sx={scroll ? { overflowX: 'auto', scrollPaddingLeft } : undefined}
      >
        {axis}
        {/* Relative, so a reference line (Today, Budget) can be one absolute li spanning every row. */}
        <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, position: 'relative' }}>{children}</Box>
      </Box>
      {!legendFirst && legend}
      {note}
    </Card>
  )
}

ChartFigure.propTypes = {
  title: PropTypes.string.isRequired,
  summary: PropTypes.string.isRequired,
  axis: PropTypes.node,
  legend: PropTypes.node,
  note: PropTypes.node,
  /** When set, rows wider than the card scroll sideways inside it, with the axis; it names that box. */
  scroll: PropTypes.string,
  /** Width of a sticky first column (a CSS length, or a breakpoint object) for the scroll box to keep clear. */
  scrollPaddingLeft: PropTypes.oneOfType([PropTypes.string, PropTypes.object]),
  /** Show the legend above the rows rather than below. */
  legendFirst: PropTypes.bool,
  children: PropTypes.node,
}

/**
 * One chart row: an li holding one focusable target (at least 24 px tall) that carries the tooltip
 * sentence for hover, tap and keyboard focus alike.
 * @param {object} props tooltip sentence; children are the name, bar and words
 */
export function ChartRow({ tooltip, children }) {
  return (
    <li>
      <Tooltip title={tooltip} enterTouchDelay={0} placement="top-start">
        <Box role="img" aria-label={tooltip} tabIndex={0} sx={{ minHeight: 24, py: 0.5 }}>
          {children}
        </Box>
      </Tooltip>
    </li>
  )
}

ChartRow.propTypes = {
  tooltip: PropTypes.string.isRequired,
  children: PropTypes.node,
}

/**
 * The legend: a list of keys. A problem key adds the warning icon, a line key draws a 2 px line.
 * @param {object} props items: label, colour and kind ('swatch' | 'line' | 'problem'), and an id when labels can repeat
 */
export function ChartLegend({ items }) {
  const { ink } = useChartColours()
  return (
    <Box component="ul" aria-label="Legend" sx={{ listStyle: 'none', m: 0, mt: 1.5, p: 0, display: 'flex', flexWrap: 'wrap', gap: 2 }}>
      {items.map(({ id, label, colour, kind }) => (
        <Box component="li" key={id ?? label} sx={{ display: 'flex', alignItems: 'center', gap: 0.75, typography: 'body2' }}>
          <Box
            aria-hidden="true"
            data-mark
            style={kind === 'line'
              ? { width: 20, height: MARK.line, background: ink }
              : { width: 12, height: 12, borderRadius: MARK.radius, background: colour }}
          />
          {kind === 'problem' && <WarningAmberRoundedIcon aria-hidden="true" sx={{ fontSize: 16, color: colour }} />}
          {label}
        </Box>
      ))}
    </Box>
  )
}

ChartLegend.propTypes = {
  items: PropTypes.arrayOf(PropTypes.shape({
    /** A unique key when two labels can be the same (two projects with one name). */
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    label: PropTypes.string.isRequired,
    colour: PropTypes.string.isRequired,
    kind: PropTypes.oneOf(['swatch', 'line', 'problem']).isRequired,
  })).isRequired,
}
