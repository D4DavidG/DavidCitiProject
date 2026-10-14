import PropTypes from 'prop-types'
import { Navigate, useLocation } from 'react-router'
import { Alert, Box } from '@mui/material'
import { useAuth } from './useAuth'
import PageState from '../components/PageState'

/**
 * Guards a page: signed-out visitors go to the login page, anyone who must change
 * their password goes there first, and a role not in `roles` gets a plain message.
 * The server checks the role too; this only keeps people out of screens they
 * can't use.
 */
export default function RequireRole({ roles, children }) {
  const { status, user } = useAuth()
  const location = useLocation()

  if (status === 'loading') return <PageState loading />
  if (status !== 'signedIn') return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (user.mustChangePassword && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />
  }
  if (roles && !roles.includes(user.role)) {
    return (
      <Box sx={{ py: 4 }}>
        <Alert severity="info">This page is not available for your role.</Alert>
      </Box>
    )
  }
  return children
}

RequireRole.propTypes = {
  /** Roles allowed to see the page; omit for any signed-in user. */
  roles: PropTypes.arrayOf(PropTypes.oneOf(['ADMIN', 'MANAGER', 'EMPLOYEE'])),
  children: PropTypes.node.isRequired,
}
