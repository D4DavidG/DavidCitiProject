import { useState } from 'react'
import PropTypes from 'prop-types'
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle } from '@mui/material'

/**
 * "Are you sure?" for archive and similar actions. Nothing in this app is deleted:
 * archived records are hidden, kept, and can be reactivated, and the wording says so.
 * While the action runs, both buttons are disabled, the confirm button says "Please wait…",
 * and Escape can't close it; they come back on success or error.
 */
export default function ConfirmDialog({ open, title, message, confirmLabel, onConfirm, onClose }) {
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

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
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <DialogContentText>{message}</DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="contained" onClick={confirm} disabled={busy}>{busy ? 'Please wait…' : confirmLabel}</Button>
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
