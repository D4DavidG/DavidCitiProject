import PropTypes from 'prop-types'
import { Chip } from '@mui/material'
import { alpha } from '@mui/material/styles'
import ActiveIcon from '@mui/icons-material/PlayCircleOutlined'
import BlockedIcon from '@mui/icons-material/BlockOutlined'
import DoneIcon from '@mui/icons-material/CheckCircleOutlined'
import HoldIcon from '@mui/icons-material/PauseCircleOutlined'
import NotStartedIcon from '@mui/icons-material/RadioButtonUncheckedOutlined'
import PendingIcon from '@mui/icons-material/HourglassEmptyOutlined'
import PlanningIcon from '@mui/icons-material/EditCalendarOutlined'
import ProgressIcon from '@mui/icons-material/TimelapseOutlined'
import RejectedIcon from '@mui/icons-material/CancelOutlined'

/**
 * Every status the API returns: its words, colour and icon (never colour alone). Colour only where a
 * status asks for a look (red refused or blocked, amber waiting, blue done); the everyday ones are
 * neutral, because green is the brand and its buttons.
 */
const STATUSES = {
  // projects
  PLANNING: ['Planning', 'default', PlanningIcon],
  ACTIVE: ['Active', 'default', ActiveIcon],
  ON_HOLD: ['On hold', 'warning', HoldIcon],
  COMPLETE: ['Complete', 'success', DoneIcon],
  // deliverables (computed by the server from their tasks)
  NOT_STARTED: ['Not started', 'default', NotStartedIcon],
  IN_PROGRESS: ['In progress', 'default', ProgressIcon],
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
 * A status label: icon, word and colour. It has no border, since a bordered square reads as a
 * button (spec 5c): the word in the body text colour on a faint wash of the status colour, the icon
 * in the colour itself. An unknown status shows as its own word.
 */
export default function StatusChip({ status, size = 'small' }) {
  const [label, color, Icon] = STATUSES[status] ?? [status, 'default', null]
  return (
    <Chip
      icon={Icon ? <Icon /> : undefined}
      label={label}
      color={color}
      size={size}
      variant="outlined"
      sx={(t) => {
        const tone = color === 'default' ? t.palette.text.secondary : t.palette[color].main
        return {
          borderColor: 'transparent',
          bgcolor: alpha(tone, t.palette.mode === 'dark' ? 0.18 : 0.1),
          color: 'text.primary',
          '& .MuiChip-icon': { color: tone },
        }
      }}
    />
  )
}

StatusChip.propTypes = {
  /** A status value exactly as the API sends it, e.g. "ON_HOLD". */
  status: PropTypes.string.isRequired,
  size: PropTypes.oneOf(['small', 'medium']),
}
