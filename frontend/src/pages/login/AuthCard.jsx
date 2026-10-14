import PropTypes from 'prop-types'
import { Box, Card, CardContent, Typography } from '@mui/material'

/** The centered card the sign-in and change-password screens share. */
export default function AuthCard({ title, subtitle, children }) {
  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', bgcolor: 'background.default', p: 2 }}>
      <Card sx={{ width: '100%', maxWidth: 420 }}>
        <CardContent sx={{ p: 4 }}>
          <Typography variant="overline" color="primary" sx={{ fontWeight: 700 }}>ACME Project Tracker</Typography>
          <Typography variant="h1" sx={{ mb: 1 }}>{title}</Typography>
          {subtitle && <Typography color="text.secondary" sx={{ mb: 2 }}>{subtitle}</Typography>}
          {children}
        </CardContent>
      </Card>
    </Box>
  )
}

AuthCard.propTypes = {
  title: PropTypes.string.isRequired,
  subtitle: PropTypes.node,
  children: PropTypes.node.isRequired,
}
