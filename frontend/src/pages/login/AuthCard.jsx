import PropTypes from 'prop-types'
import { Box, Card, CardContent, Typography } from '@mui/material'
import AcmeLogo from '../../components/AcmeLogo'
import ColorModeToggle from '../../theme/ColorModeToggle'
import { useIsMobile } from '../../theme/responsive'

const TAGLINE = 'Project tracker: status, people, deliverables and budget in one place'

/**
 * The frame the sign-in and change-password screens share. Desktop: the logo large on the
 * left with one line under it, the card on the right. Phone: a smaller logo on top, the
 * card below. The sun/moon switch sits in the top right corner.
 */
export default function AuthCard({ title, subtitle, children }) {
  const isMobile = useIsMobile()
  return (
    <Box sx={{ minHeight: '100vh', position: 'relative', display: 'grid', placeContent: 'center', px: 2, py: isMobile ? 9 : 4 }}>
      <Box sx={{ position: 'absolute', top: 12, right: 12 }}><ColorModeToggle /></Box>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: isMobile ? 'minmax(0, 420px)' : 'minmax(0, 440px) minmax(0, 420px)',
          alignItems: 'center',
          columnGap: 10,
          rowGap: 3,
        }}
      >
        <Box sx={{ display: 'grid', gap: 2, justifyItems: isMobile ? 'center' : 'start', textAlign: isMobile ? 'center' : 'left' }}>
          <AcmeLogo size={isMobile ? 48 : 104} />
          <Typography sx={{ color: 'text.secondary', fontSize: isMobile ? '1rem' : '1.25rem', maxWidth: 380 }}>{TAGLINE}</Typography>
        </Box>
        <Card>
          <CardContent sx={{ p: 4 }}>
            <Typography variant="h1" sx={{ mb: 1 }}>{title}</Typography>
            {subtitle && <Typography sx={{ color: 'text.secondary', mb: 2 }}>{subtitle}</Typography>}
            {children}
          </CardContent>
        </Card>
      </Box>
    </Box>
  )
}

AuthCard.propTypes = {
  title: PropTypes.string.isRequired,
  subtitle: PropTypes.node,
  children: PropTypes.node.isRequired,
}
