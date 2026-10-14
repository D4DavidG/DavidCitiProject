import PropTypes from 'prop-types'
import { Chip } from '@mui/material'
import WarningAmberOutlined from '@mui/icons-material/WarningAmberOutlined'

/**
 * Time logged past the person's weekly capacity without overtime allowed (they
 * confirmed "Log anyway"). An icon plus words, never colour alone.
 */
export default function OverCapacityMark({ size = 'small' }) {
  return <Chip icon={<WarningAmberOutlined />} label="Over capacity" color="warning" variant="outlined" size={size} />
}

OverCapacityMark.propTypes = {
  size: PropTypes.oneOf(['small', 'medium']),
}
