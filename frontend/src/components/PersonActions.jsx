import { useCallback, useId, useRef, useState } from 'react'
import PropTypes from 'prop-types'
import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, FormHelperText, Menu, MenuItem, Typography,
} from '@mui/material'
import ArrowIcon from '@mui/icons-material/KeyboardArrowDownOutlined'
import ConfirmDialog from './ConfirmDialog'
import FormDialog from './FormDialog'
import HistoryPanel from './HistoryPanel'
import PageState from './PageState'
import { useAuth } from '../auth/useAuth'
import { fullName } from '../services/people'
import { request } from '../services/request'
import { useApi } from '../services/useApi'
import { useIsMobile } from '../theme/responsive'

const ROLE_OPTIONS = [['EMPLOYEE', 'Employee'], ['MANAGER', 'Manager'], ['ADMIN', 'Admin']]
const CAPACITY_FIELDS = [
  { name: 'weeklyCapacityHours', label: 'Weekly capacity (hours)', type: 'number', min: 1, max: 60, helper: 'Logging past this asks the person to confirm and tells their manager, unless overtime is allowed.' },
  { name: 'overtimeAllowed', label: 'Overtime allowed', type: 'boolean' },
  { name: 'taskLimit', label: 'Task limit', type: 'number', min: 1, max: 10, helper: 'The most unfinished tasks they can take from the board themselves, 1 to 10. Managers can still assign past it.' },
]

function accountFields(managers) {
  return [
    { name: 'firstName', label: 'First name', required: true },
    { name: 'lastName', label: 'Last name', required: true },
    { name: 'email', label: 'Email', required: true },
    { name: 'role', label: 'Role', type: 'select', options: ROLE_OPTIONS, required: true },
    { name: 'jobTitle', label: 'Job title' },
    { name: 'managerId', label: 'Line manager', type: 'select', numeric: true, options: managers, helper: 'Approves their logged time.' },
    { name: 'annualSalaryCents', label: 'Annual salary ($)', type: 'money', helper: 'Sets their hourly rate for project costs (salary ÷ 2,080).' },
  ]
}

/** The words on each menu item. */
const LABELS = {
  capacity: 'Capacity, overtime and task limit',
  history: 'History',
  edit: 'Edit details',
  reset: 'Reset password',
  reactivate: 'Reactivate',
  archive: 'Archive',
}

/**
 * What the signed-in `user` may do to `person`, in menu order (Archive last). The server
 * checks every one again; this only hides what it would refuse. Admins: everything, but
 * never reset or archive themselves. A manager: capacity and history of their own reports.
 */
function actionsFor(user, person) {
  const isAdmin = user.role === 'ADMIN'
  const theirManager = user.role === 'MANAGER' && person.managerId === user.userId
  const self = person.userId === user.userId
  const live = !person.isArchived
  return [
    (isAdmin || theirManager) && live && 'capacity',
    (isAdmin || theirManager) && 'history',
    isAdmin && live && 'edit',
    isAdmin && live && !self && 'reset',
    isAdmin && !self && !live && 'reactivate',
    isAdmin && !self && live && 'archive',
  ].filter(Boolean)
}

/** A menu line you can't press (loading, nothing to do), kept fully readable rather than faded. */
const NOTE = { whiteSpace: 'normal', maxWidth: 300, '&.Mui-disabled': { opacity: 1, color: 'text.secondary' } }

/**
 * Shows a generated password once, with a button that copies the username and password
 * together, labelled as on screen, so the admin can paste both to the person. It is never
 * shown again.
 */
export function PasswordShown({ title, person, username, password, onClose }) {
  const [copyState, setCopyState] = useState('idle') // 'idle' | 'copied' | 'failed'
  async function copy() {
    try {
      // Throws when there is no clipboard (plain-HTTP pages) or the browser refuses.
      await navigator.clipboard.writeText(`Username: ${username}\nTemporary password: ${password}`)
      setCopyState('copied')
    } catch {
      setCopyState('failed')
    }
  }
  return (
    <Dialog open onClose={onClose} aria-labelledby="password-shown-title" maxWidth="xs" fullWidth>
      <DialogTitle id="password-shown-title">{title}</DialogTitle>
      <DialogContent sx={{ display: 'grid', gap: 1 }}>
        <Typography>{person}</Typography>
        <Typography variant="body2" color="text.secondary">Username</Typography>
        <Typography sx={{ fontFamily: 'monospace', fontSize: '1.25rem' }}>{username}</Typography>
        <Typography variant="body2" color="text.secondary">Temporary password</Typography>
        <Typography sx={{ fontFamily: 'monospace', fontSize: '1.25rem' }}>{password}</Typography>
        <Alert severity="warning">This password is shown only once. Give it to them; they must change it when they first sign in.</Alert>
        {copyState === 'failed' && <Alert severity="error">Couldn&apos;t copy. Select the username and password and copy them by hand.</Alert>}
      </DialogContent>
      <DialogActions>
        <Button variant="contained" onClick={copy}>{copyState === 'copied' ? 'Copied' : 'Copy username and password'}</Button>
        <Button variant="contained" onClick={onClose}>Done</Button>
      </DialogActions>
    </Dialog>
  )
}

PasswordShown.propTypes = {
  title: PropTypes.string.isRequired,
  person: PropTypes.string.isRequired,
  username: PropTypes.string.isRequired,
  password: PropTypes.string.isRequired,
  onClose: PropTypes.func.isRequired,
}

/**
 * The account form, for a new person or an edit. It loads the line-manager list first, so
 * the Line manager box never opens empty or showing a number.
 */
export function AccountDialog({ title, submitLabel = 'Save', initial = null, defaults = null, onSubmit, onClose }) {
  const load = useCallback(() => request('GET', '/users', { query: { role: 'MANAGER', pageSize: 100 } }), [])
  const { data, loading } = useApi(load)
  if (loading) {
    return (
      <Dialog open onClose={onClose} aria-label={title} maxWidth="sm" fullWidth>
        <DialogContent><PageState loading /></DialogContent>
      </Dialog>
    )
  }
  // If the list fails, the form still works; only the Line manager box has no choices.
  const managers = (data?.items ?? []).map((u) => [u.userId, fullName(u)])
  return (
    <FormDialog
      open
      title={title}
      submitLabel={submitLabel}
      fields={accountFields(managers)}
      initial={initial}
      defaults={defaults}
      onSubmit={onSubmit}
      onClose={onClose}
    />
  )
}

AccountDialog.propTypes = {
  title: PropTypes.string.isRequired,
  submitLabel: PropTypes.string,
  /** The person being edited; omit for a new account. */
  initial: PropTypes.object,
  /** Pre-filled values for a new account. */
  defaults: PropTypes.object,
  /** Receives the body to send; reject with an ApiError to show it. */
  onSubmit: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
}

/**
 * One "Actions" button for a person, opening a menu of what you may do to them: capacity,
 * overtime and task limit, history, edit, reset password, and archive (last, in red) or
 * reactivate. It owns the dialogs those open, so People and Allocation share them.
 *
 * Give it `person` (the full record from GET /users), or just `userId` and `name` when the
 * row doesn't have it: the record is then fetched (GET /users/{id}) each time the menu opens.
 * With `person`, it shows nothing at all when you may do nothing to them.
 */
export default function PersonActions({ person = null, userId, name, label = 'Actions', onChanged }) {
  const { user } = useAuth()
  const isMobile = useIsMobile()
  const [anchor, setAnchor] = useState(null)
  const [fetched, setFetched] = useState({ status: 'idle' }) // 'idle' | 'loading' | 'done' | 'failed'
  const [dialog, setDialog] = useState(null) // { kind, person }
  const [shown, setShown] = useState(null)
  const [reactivating, setReactivating] = useState(false)
  const [refusal, setRefusal] = useState(null)
  const busy = useRef(false) // set at once, so a double press sends one Reactivate
  const asked = useRef(0) // the newest fetch; an older, slower answer is ignored
  const triggerId = useId()
  const menuId = useId()

  const record = person ?? (fetched.status === 'done' ? fetched.person : null)
  const shownName = person ? fullName(person) : name
  if (person && actionsFor(user, person).length === 0) return null

  async function fetchRecord() {
    asked.current += 1
    const mine = asked.current
    setFetched({ status: 'loading' })
    try {
      const answer = await request('GET', `/users/${userId}`)
      if (mine === asked.current) setFetched({ status: 'done', person: answer })
    } catch {
      if (mine === asked.current) setFetched({ status: 'failed' })
    }
  }

  function openMenu(event) {
    setAnchor(event.currentTarget)
    if (!person) fetchRecord()
  }

  async function reactivate(target) {
    if (busy.current) return
    busy.current = true
    setRefusal(null)
    setReactivating(true)
    try {
      await request('POST', `/users/${target.userId}/reactivate`)
      onChanged?.()
    } catch (failure) {
      setRefusal(failure.message)
    } finally {
      busy.current = false
      setReactivating(false)
    }
  }

  function choose(kind) {
    setAnchor(null)
    if (kind === 'reactivate') reactivate(record)
    else setDialog({ kind, person: record })
  }

  /** After a dialog saved: tell the page, so its list or grid shows the change. */
  async function saved(promise) {
    await promise
    onChanged?.()
  }

  function menuContent() {
    if (!record && fetched.status === 'failed') {
      return <MenuItem onClick={fetchRecord} sx={NOTE}>Couldn&apos;t load their details. Try again</MenuItem>
    }
    if (!record) return <MenuItem disabled sx={NOTE}>Loading…</MenuItem>
    const actions = actionsFor(user, record)
    if (actions.length === 0) {
      return <MenuItem disabled sx={NOTE}>No actions here: only their line manager or an admin can change this person.</MenuItem>
    }
    return actions.map((kind) => (
      <MenuItem key={kind} onClick={() => choose(kind)} sx={kind === 'archive' ? { color: 'error.main' } : undefined}>
        {LABELS[kind]}
      </MenuItem>
    ))
  }

  const target = dialog?.person
  const close = () => setDialog(null)
  const targetName = fullName(target)

  return (
    // Inline, so it sits where the cell aligns it: the end of a People row, the start of an Allocation row.
    <Box sx={{ display: 'inline-grid', gap: 0.5, justifyItems: 'start' }}>
      <Button
        id={triggerId}
        variant="contained"
        size="small"
        aria-label={`Actions for ${shownName}`}
        aria-haspopup="true"
        aria-controls={anchor ? menuId : undefined}
        aria-expanded={anchor ? 'true' : undefined}
        endIcon={<ArrowIcon />}
        onClick={openMenu}
        disabled={reactivating}
        sx={{ textAlign: 'left' }}
      >
        {reactivating ? 'Reactivating…' : label}
      </Button>
      {refusal && <FormHelperText error role="alert">{refusal}</FormHelperText>}

      <Menu
        id={menuId}
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={() => setAnchor(null)}
        slotProps={{ list: { 'aria-labelledby': triggerId } }}
      >
        {menuContent()}
      </Menu>

      {dialog?.kind === 'capacity' && (
        <FormDialog
          open
          title={`Capacity for ${targetName}`}
          fields={CAPACITY_FIELDS}
          initial={target}
          onSubmit={(body) => saved(request('PATCH', `/users/${target.userId}/capacity`, { body }))}
          onClose={close}
        />
      )}
      {dialog?.kind === 'edit' && (
        <AccountDialog
          title={`Edit ${targetName}`}
          initial={target}
          onSubmit={(body) => saved(request('PATCH', `/users/${target.userId}`, { body }))}
          onClose={close}
        />
      )}
      {dialog?.kind === 'history' && (
        <Dialog open onClose={close} aria-labelledby={`${menuId}-history`} maxWidth="lg" fullWidth fullScreen={isMobile}>
          <DialogTitle id={`${menuId}-history`}>{`History: ${targetName}`}</DialogTitle>
          <DialogContent><HistoryPanel userId={target.userId} /></DialogContent>
          <DialogActions><Button variant="contained" onClick={close}>Close</Button></DialogActions>
        </Dialog>
      )}
      {dialog?.kind === 'reset' && (
        <ConfirmDialog
          open
          title={`Reset ${targetName}'s password?`}
          message="They get a new one-time password and must choose their own when they next sign in. Their current password stops working."
          confirmLabel="Reset password"
          onConfirm={async () => {
            const result = await request('POST', `/users/${target.userId}/reset-password`)
            setShown({ title: 'Password reset', person: targetName, username: target.username, password: result.temporaryPassword })
          }}
          onClose={close}
        />
      )}
      {dialog?.kind === 'archive' && (
        <ConfirmDialog
          open
          title={`Archive ${targetName}?`}
          message="They can no longer sign in and their bookings end. Their history (logged time, audit trail) is kept, and an admin can reactivate them."
          confirmLabel="Archive account"
          onConfirm={() => saved(request('POST', `/users/${target.userId}/archive`))}
          onClose={close}
        />
      )}
      {shown && <PasswordShown {...shown} onClose={() => setShown(null)} />}
    </Box>
  )
}

PersonActions.propTypes = {
  /** The person's full record (GET /users); when missing, it is fetched by `userId` on open. */
  person: PropTypes.shape({
    userId: PropTypes.number.isRequired,
    username: PropTypes.string,
    firstName: PropTypes.string,
    lastName: PropTypes.string,
    managerId: PropTypes.number,
    isArchived: PropTypes.bool,
  }),
  /** The person's id, when `person` is missing. */
  userId: PropTypes.number,
  /** The person's name, when `person` is missing: it names the button for screen readers. */
  name: PropTypes.string,
  /** The words on the button: "Actions", or the person's name where the name itself opens the menu. */
  label: PropTypes.string,
  /** Called after any change succeeds, so the page can reload. */
  onChanged: PropTypes.func,
}
