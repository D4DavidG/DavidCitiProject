import PropTypes from 'prop-types'
import { Chip } from '@mui/material'
import MoreTimeOutlined from '@mui/icons-material/MoreTimeOutlined'

/**
 * The task's logged time now passes its estimate: more than expected (the server works it
 * out, as `overEstimate`). A note for the approver, not a refusal. An icon plus words, never
 * colour alone; it sits beside OverCapacityMark and looks like it.
 */
export default function OverEstimateMark({ size = 'small' }) {
  return <Chip icon={<MoreTimeOutlined />} label="Over estimate" color="warning" variant="outlined" size={size} />
}

OverEstimateMark.propTypes = {
  size: PropTypes.oneOf(['small', 'medium']),
}
