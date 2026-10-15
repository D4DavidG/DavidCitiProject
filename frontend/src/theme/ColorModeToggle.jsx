import PropTypes from 'prop-types'
import { IconButton, Tooltip } from '@mui/material'
import DarkIcon from '@mui/icons-material/DarkModeOutlined'
import LightIcon from '@mui/icons-material/LightModeOutlined'
import { useColorMode } from './colorMode'

/** The sun/moon button: shows the mode you would switch to, and says so. */
export default function ColorModeToggle({ color = 'default' }) {
  const { mode, toggleMode } = useColorMode()
  const dark = mode === 'dark'
  const label = dark ? 'Switch to light mode' : 'Switch to dark mode'
  return (
    <Tooltip title={label}>
      <IconButton aria-label={label} onClick={toggleMode} color={color}>
        {dark ? <LightIcon /> : <DarkIcon />}
      </IconButton>
    </Tooltip>
  )
}

ColorModeToggle.propTypes = {
  /** 'inherit' in the top bar, so the icon takes the bar's text colour. */
  color: PropTypes.oneOf(['default', 'inherit']),
}
