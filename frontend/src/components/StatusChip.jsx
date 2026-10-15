import PropTypes from 'prop-types'
import { Chip } from '@mui/material'
import ActiveIcon from '@mui/icons-material/PlayCircleOutlined'
import BlockedIcon from '@mui/icons-material/BlockOutlined'
import DoneIcon from '@mui/icons-material/CheckCircleOutlined'
import HoldIcon from '@mui/icons-material/PauseCircleOutlined'
import NotStartedIcon from '@mui/icons-material/RadioButtonUncheckedOutlined'
import PendingIcon from '@mui/icons-material/HourglassEmptyOutlined'
import PlanningIcon from '@mui/icons-material/EditCalendarOutlined'
import ProgressIcon from '@mui/icons-material/TimelapseOutlined'
import RejectedIcon from '@mui/icons-material/CancelOutlined'

/** Every status the API returns: its words, colour and icon (never colour alone). */
const STATUSES = {
  // projects
  PLANNING: ['Planning', 'default', PlanningIcon],
  ACTIVE: ['Active', 'primary', ActiveIcon],
  ON_HOLD: ['On hold', 'warning', HoldIcon],
  COMPLETE: ['Complete', 'success', DoneIcon],
  // deliverables (computed by the server from their tasks)
  NOT_STARTED: ['Not started', 'default', NotStartedIcon],
  IN_PROGRESS: ['In progress', 'primary', ProgressIcon],
  BLOCKED: ['Blocked', 'error', BlockedIcon],
  DONE: ['Done', 'success', DoneIcon],
  // tasks
  TODO: ['To do', 'default', NotStartedIcon],
  // logged time and project requests
  PENDING: ['Pending', 'warning', PendingIcon],
  APPROVED: ['Approved', 'success', DoneIcon],
  REJECTED: ['Rejected', 'error', RejectedIcon],
}

/**
 * A status label: icon, word and colour, outlined (the site's one green fill is for buttons).
 * An unknown status shows as its own word.
 */
export default function StatusChip({ status, size = 'small' }) {
  const [label, color, Icon] = STATUSES[status] ?? [status, 'default', null]
  return <Chip icon={Icon ? <Icon /> : undefined} label={label} color={color} size={size} variant="outlined" />
}

StatusChip.propTypes = {
  /** A status value exactly as the API sends it, e.g. "ON_HOLD". */
  status: PropTypes.string.isRequired,
  size: PropTypes.oneOf(['small', 'medium']),
}
