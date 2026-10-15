import { useId, useState } from 'react'
import PropTypes from 'prop-types'
import {
  Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Typography,
} from '@mui/material'

/** Actions that remove or refuse: their confirm button is the danger kind (outlined red), never filled. */
const DANGER = /^(Archive|Reject|Revoke)\b/

/**
 * "Are you sure?" for archive and similar actions. Nothing in this app is deleted:
 * archived records are hidden, kept, and can be reactivated, and the wording says so.
 * While the action runs, both buttons are disabled, the confirm button says "Please wait…",
 * and Escape can't close it; they come back on success or error. An error is one line just
 * above the buttons. Archive, Reject and Revoke confirm with the danger kind of button.
 */
export default function ConfirmDialog({ open, title, message, confirmLabel, onConfirm, onClose }) {
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const errorId = useId()
  const danger = DANGER.test(confirmLabel)

  async function confirm() {
    setBusy(true)
    setError(null)
    try {
      await onConfirm()
      onClose()
    } catch (failure) {
      setError(failure.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onClose={() => { if (!busy) onClose() }} maxWidth="xs" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <DialogContentText>{message}</DialogContentText>
        {error && <Typography id={errorId} role="alert" variant="body2" sx={{ color: 'error.main', mt: 2 }}>{error}</Typography>}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button
          variant={danger ? 'outlined' : 'contained'}
          color={danger ? 'error' : 'primary'}
          onClick={confirm}
          disabled={busy}
          aria-describedby={error ? errorId : undefined}
        >
          {busy ? 'Please wait…' : confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

ConfirmDialog.propTypes = {
  open: PropTypes.bool.isRequired,
  title: PropTypes.string.isRequired,
  message: PropTypes.node.isRequired,
  confirmLabel: PropTypes.string.isRequired,
  /** Returns a Promise; reject with an ApiError to show its message. */
  onConfirm: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
}
