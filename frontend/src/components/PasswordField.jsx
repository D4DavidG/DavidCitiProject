import { useState } from 'react'
import PropTypes from 'prop-types'
import {
  IconButton, InputAdornment, TextField, Tooltip,
} from '@mui/material'
import ShowIcon from '@mui/icons-material/VisibilityOutlined'
import HideIcon from '@mui/icons-material/VisibilityOffOutlined'

/**
 * A password box with an eye at its end: press it to see what you typed, press again to hide it.
 * Every other prop goes to the TextField as it would for a plain password box. The eye is named by
 * what it will do ("Show password" or "Hide password"), and pressing it with a mouse keeps the cursor
 * in the box.
 */
export default function PasswordField({ disabled = false, slotProps, ...props }) {
  const [shown, setShown] = useState(false)
  const label = shown ? 'Hide password' : 'Show password'
  const eye = (
    <InputAdornment position="end">
      <Tooltip title={label}>
        {/* the span lets the tooltip work while the button is disabled */}
        <span>
          <IconButton
            edge="end"
            aria-label={label}
            disabled={disabled}
            onClick={() => setShown(!shown)}
            onMouseDown={(event) => event.preventDefault()}
          >
            {shown ? <HideIcon fontSize="small" /> : <ShowIcon fontSize="small" />}
          </IconButton>
        </span>
      </Tooltip>
    </InputAdornment>
  )
  return (
    <TextField
      {...props}
      type={shown ? 'text' : 'password'}
      disabled={disabled}
      slotProps={{ ...slotProps, input: { ...slotProps?.input, endAdornment: eye } }}
    />
  )
}

PasswordField.propTypes = {
  /** Locks the box and its eye, as a form does while it saves. */
  disabled: PropTypes.bool,
  /** Passed to the TextField; the eye is added to slotProps.input. */
  slotProps: PropTypes.object,
}
