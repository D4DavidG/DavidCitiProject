import PropTypes from 'prop-types'
import { Chip } from '@mui/material'

/** Every status the API returns, with its words and colour. */
const STATUSES = {
  // projects
  PLANNING: ['Planning', 'default'],
  ACTIVE: ['Active', 'primary'],
  ON_HOLD: ['On hold', 'warning'],
  COMPLETE: ['Complete', 'success'],
  // deliverables (computed by the server from their tasks)
  NOT_STARTED: ['Not started', 'default'],
  IN_PROGRESS: ['In progress', 'primary'],
  BLOCKED: ['Blocked', 'error'],
  DONE: ['Done', 'success'],
  // tasks
  TODO: ['To do', 'default'],
  // logged time and project requests
  PENDING: ['Pending', 'warning'],
  APPROVED: ['Approved', 'success'],
  REJECTED: ['Rejected', 'error'],
}

/** A small coloured label for a status value from the API. */
export default function StatusChip({ status, size = 'small' }) {
  const [label, color] = STATUSES[status] ?? [status, 'default']
  return <Chip label={label} color={color} size={size} variant={color === 'default' ? 'outlined' : 'filled'} />
}

StatusChip.propTypes = {
  /** A status value exactly as the API sends it, e.g. "ON_HOLD". */
  status: PropTypes.string.isRequired,
  size: PropTypes.oneOf(['small', 'medium']),
}
