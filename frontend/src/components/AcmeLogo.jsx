import { useId } from 'react'
import PropTypes from 'prop-types'
import Box from '@mui/material/Box'
import { useTheme } from '@mui/material/styles'

// The word ACME on a 152 x 62 grid (spec 6.3). The A is drawn: taller than the other letters, its
// tip one sharp gold point with a soft gold glow, and three sparkles around it ("acme" means the
// high point). CME is Poppins bold, a softer face that still reads as a logo; textLength keeps its
// width fixed whichever font draws it.
const VIEW = { width: 152, height: 62 }
const A_BODY = 'M0 58 L15.83 20 L24.17 20 L40 58 L31 58 L26.8 48 L13.2 48 L9 58 Z M16.1 41 L23.9 41 L20 31.6 Z'
const A_TIP = 'M20 10 L24.17 20 L15.83 20 Z'

/** A four-pointed sparkle centred on (x, y), r from its centre to each point. */
function sparkle(x, y, r) {
  const w = r * 0.28
  return `M${x} ${y - r} L${x + w} ${y - w} L${x + r} ${y} L${x + w} ${y + w} L${x} ${y + r} L${x - w} ${y + w} L${x - r} ${y} L${x - w} ${y - w} Z`
}
const SPARKS = [sparkle(20, 4.5, 4.5), sparkle(8, 13, 3.5), sparkle(32, 13, 3.5)] // above the tip, left, right

/** The brand tone: the forest green on light, the warm off-white text on dark. */
const brand = (t) => (t.palette.mode === 'dark' ? t.palette.text.primary : t.palette.primary.main)

/**
 * The ACME logo, one image named "ACME". In the top bar, tone "inherit" takes the bar's white
 * words. On a light page the bright gold is edged in deep gold, which it needs to be seen there.
 */
export default function AcmeLogo({ size = 32, tone = 'brand' }) {
  const titleId = useId()
  const glowId = useId()
  const theme = useTheme()
  const { light: shine, main: deep } = theme.palette.secondary
  const needsEdge = tone === 'brand' && theme.palette.mode === 'light'
  const edge = needsEdge ? { stroke: deep, strokeWidth: 0.75 } : {}
  return (
    <Box
      component="svg"
      role="img"
      aria-labelledby={titleId}
      viewBox={`0 0 ${VIEW.width} ${VIEW.height}`}
      height={size}
      width={Math.round((size * VIEW.width) / VIEW.height)}
      sx={{ color: tone === 'inherit' ? 'inherit' : brand, display: 'block', flexShrink: 0, overflow: 'visible' }}
    >
      <title id={titleId}>ACME</title>
      <defs>
        <filter id={glowId} x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="2.5" />
        </filter>
      </defs>
      <path data-part="glow" d={A_TIP} fill={shine} opacity={0.85} filter={`url(#${glowId})`} />
      <path data-part="a" d={A_BODY} fill="currentColor" fillRule="evenodd" />
      <path data-part="tip" d={A_TIP} fill={shine} {...edge} />
      {SPARKS.map((d) => <path key={d} data-part="spark" d={d} fill={shine} {...edge} />)}
      <text
        data-part="cme"
        x="45"
        y="58"
        fontFamily="Poppins, Inter, system-ui, sans-serif"
        fontWeight="700"
        fontSize="46"
        textLength="105"
        lengthAdjust="spacingAndGlyphs"
        fill="currentColor"
      >
        CME
      </text>
    </Box>
  )
}

AcmeLogo.propTypes = {
  /** Height in pixels; the width follows. */
  size: PropTypes.number,
  /** 'brand' (forest green, or off-white in dark mode) or 'inherit' (the surrounding text colour). */
  tone: PropTypes.oneOf(['brand', 'inherit']),
}
