import { useId } from 'react'
import PropTypes from 'prop-types'
import Box from '@mui/material/Box'
import { useTheme } from '@mui/material/styles'

// The word ACME in sharp, straight strokes on a 154 x 58 grid. The A stands taller than
// the other letters, and its tip is cut off and shines gold: "acme" means the high point.
const VIEW = { width: 154, height: 58 }
const A_BODY = 'M0 56 L12.16 18 L27.84 18 L40 56 L31 56 L27.16 44 L12.84 44 L9 56 Z M15.4 36 L24.6 36 L20 21.6 Z'
const A_TIP = 'M16 6 L24 6 L27.2 16 L12.8 16 Z'
const SPARK = 'M33 1 L34.3 5.7 L39 7 L34.3 8.3 L33 13 L31.7 8.3 L27 7 L31.7 5.7 Z'
const CME = [
  'M76 20 L54 20 L46 28 L46 48 L54 56 L76 56 L76 48 L57 48 L54 45 L54 31 L57 28 L76 28 Z', // C
  'M82 56 L82 20 L90 20 L101 36 L112 20 L120 20 L120 56 L112 56 L112 33 L101 49 L90 33 L90 56 Z', // M
  'M152 20 L126 20 L126 56 L152 56 L152 48 L134 48 L134 42 L148 42 L148 34 L134 34 L134 28 L152 28 Z', // E
].join(' ')

/** The brand tone: the green ink on light, the light grey text on dark. */
const brand = (t) => (t.palette.mode === 'dark' ? t.palette.text.primary : t.palette.primary.main)

/**
 * The ACME logo, one image named "ACME". Brand tone: forest green on light, light grey on
 * dark. In the top bar, tone "inherit" takes the bar's text colour. The shine is bright gold
 * edged in the deep gold, so it reads on white, on the green bar and on dark.
 */
export default function AcmeLogo({ size = 32, tone = 'brand' }) {
  const titleId = useId()
  const { light: shine, main: edge } = useTheme().palette.secondary
  return (
    <Box
      component="svg"
      role="img"
      aria-labelledby={titleId}
      viewBox={`0 0 ${VIEW.width} ${VIEW.height}`}
      height={size}
      width={Math.round((size * VIEW.width) / VIEW.height)}
      sx={{ color: tone === 'inherit' ? 'inherit' : brand, display: 'block', flexShrink: 0 }}
    >
      <title id={titleId}>ACME</title>
      <path data-part="a" d={A_BODY} fill="currentColor" fillRule="evenodd" />
      <path data-part="tip" d={A_TIP} fill={shine} stroke={edge} strokeWidth={1} />
      <path data-part="spark" d={SPARK} fill={shine} stroke={edge} strokeWidth={0.75} />
      <path data-part="cme" d={CME} fill="currentColor" />
    </Box>
  )
}

AcmeLogo.propTypes = {
  /** Height in pixels; the width follows. */
  size: PropTypes.number,
  /** 'brand' (green ink, or light grey in dark mode) or 'inherit' (the surrounding text colour). */
  tone: PropTypes.oneOf(['brand', 'inherit']),
}
