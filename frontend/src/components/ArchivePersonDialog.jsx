import { useCallback, useId, useRef, useState } from 'react'
import PropTypes from 'prop-types'
import {
  Alert, AlertTitle, Box, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Typography,
} from '@mui/material'
import FlagIcon from '@mui/icons-material/FlagOutlined'
import { formatInvolvement, formatLiveProjects } from '../services/format'
import { fullName } from '../services/people'
import { request } from '../services/request'
import { useApi } from '../services/useApi'

/** What archiving does to anyone; shown every time. */
const WHAT_HAPPENS = 'They can no longer sign in and their bookings end. Their history (logged time, audit trail) is kept, and an admin can reactivate them.'
const ON_PROJECTS_NOTE = 'Archiving ends their bookings on these projects. Their open tasks stay assigned to them until someone reassigns them.'

/**
 * "Archive <name>?" for a person. It first asks the server which live projects they are still
 * on (GET /users/{id}/projects), with the confirm button locked until it knows. On any, a red
 * flagged warning lists them, and the button reads "Archive anyway" and sends
 * { confirmOnProjects: true }; on none, it is "Archive account" and sends no body. The server
 * has the last word: if it still answers 409 ON_PROJECTS (the list failed to load, or they were
 * booked meanwhile), the list reloads and the warning appears. While the archive runs, both
 * buttons are locked and Escape can't close it, so one press sends one request.
 */
export default function ArchivePersonDialog({ person, onArchived, onClose }) {
  const name = fullName(person)
  const load = useCallback(
    () => request('GET', `/users/${person.userId}/projects`, { query: { pageSize: 100 } }),
    [person.userId],
  )
  const { data, error: listError, loading, reload } = useApi(load)
  const [refusal, setRefusal] = useState(null) // the server's ON_PROJECTS words, kept in case the list can't show why
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const saving = useRef(false) // set at once, so a double press sends one request
  const titleId = useId()
  const errorId = useId()

  const projects = data?.items ?? []
  const count = data?.total ?? projects.length
  const warned = projects.length > 0 || refusal !== null

  async function confirm() {
    if (saving.current) return
    saving.current = true
    setBusy(true)
    setError(null)
    try {
      await request('POST', `/users/${person.userId}/archive`, warned ? { body: { confirmOnProjects: true } } : undefined)
      await onArchived?.()
      onClose()
    } catch (failure) {
      if (failure.code === 'ON_PROJECTS') {
        setRefusal(failure.message)
        reload()
      } else setError(failure.message)
    } finally {
      saving.current = false
      setBusy(false)
    }
  }

  let label = 'Archive account'
  if (busy) label = 'Please wait…'
  else if (warned) label = 'Archive anyway'

  return (
    <Dialog open onClose={() => { if (!busy) onClose() }} aria-labelledby={titleId} maxWidth="sm" fullWidth>
      <DialogTitle id={titleId}>{`Archive ${name}?`}</DialogTitle>
      <DialogContent sx={{ display: 'grid', gap: 2 }}>
        {projects.length > 0 && (
          <Alert severity="error" icon={<FlagIcon />}>
            <AlertTitle>{`${name} is still on ${formatLiveProjects(count)}`}</AlertTitle>
            <Box component="ul" sx={{ m: 0, mb: 1, pl: 2.5 }}>
              {projects.map((project) => (
                <Typography component="li" variant="body2" key={project.projectId}>{formatInvolvement(project)}</Typography>
              ))}
            </Box>
            <Typography variant="body2">{ON_PROJECTS_NOTE}</Typography>
          </Alert>
        )}
        {projects.length === 0 && refusal && <Alert severity="error" icon={<FlagIcon />}>{refusal}</Alert>}
        <DialogContentText>{WHAT_HAPPENS}</DialogContentText>
        {loading && <Typography variant="body2" color="text.secondary" role="status">Checking which projects they are on…</Typography>}
        {!loading && listError && !warned && (
          <Typography variant="body2" color="text.secondary">
            Couldn&apos;t check which projects they are on. If they are still on any, you will be asked again before anything changes.
          </Typography>
        )}
        {error && <Typography id={errorId} role="alert" variant="body2" sx={{ color: 'error.main' }}>{error}</Typography>}
      </DialogContent>
      <DialogActions>
        <Button variant="contained" onClick={onClose} disabled={busy}>Cancel</Button>
        <Button
          variant="contained"
          color="error"
          onClick={confirm}
          disabled={busy || loading}
          aria-describedby={error ? errorId : undefined}
        >
          {label}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

ArchivePersonDialog.propTypes = {
  /** The person to archive: their id and name. */
  person: PropTypes.shape({
    userId: PropTypes.number.isRequired,
    firstName: PropTypes.string,
    lastName: PropTypes.string,
  }).isRequired,
  /** Called after the archive succeeds, before the dialog closes, so the page can reload. */
  onArchived: PropTypes.func,
  onClose: PropTypes.func.isRequired,
}
