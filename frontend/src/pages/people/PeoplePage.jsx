import { useCallback, useState } from 'react'
import PropTypes from 'prop-types'
import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, MenuItem,
  Switch, TextField, Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/PersonAddAlt'
import ConfirmDialog from '../../components/ConfirmDialog'
import DataTable from '../../components/DataTable'
import FormDialog from '../../components/FormDialog'
import HistoryPanel from '../../components/HistoryPanel'
import PageHeader from '../../components/PageHeader'
import PageState, { Pager } from '../../components/PageState'
import SearchField from '../../components/SearchField'
import { useAuth } from '../../auth/useAuth'
import { ROLE_LABELS } from '../../components/navigation'
import { formatCents } from '../../services/format'
import { fullName, usePeopleOptions } from '../../services/people'
import { request } from '../../services/request'
import { useApi } from '../../services/useApi'
import { useLastPage } from '../../services/useLastPage'
import { useIsMobile } from '../../theme/responsive'

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

/**
 * Shows a generated password once, with a button that copies the username and password
 * together, labelled as on screen, so the admin can paste both to the person. It is never
 * shown again.
 */
function PasswordShown({ title, person, username, password, onClose }) {
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
        <Button variant="outlined" onClick={copy}>{copyState === 'copied' ? 'Copied' : 'Copy username and password'}</Button>
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
 * The people in the organisation. Admins create accounts (the server generates the
 * username and a one-time password), edit them, reset passwords and archive them.
 * Managers see everyone and set capacity and overtime for their own direct reports.
 * History (what someone did and what was done to their account) is open to admins for
 * everyone and to managers for their own reports.
 */
export default function PeoplePage() {
  const { user } = useAuth()
  const isMobile = useIsMobile()
  const isAdmin = user.role === 'ADMIN'
  const [q, setQ] = useState('')
  const [role, setRole] = useState('')
  const [includeArchived, setIncludeArchived] = useState(false)
  const [pageNumber, setPageNumber] = useState(1)
  const [dialog, setDialog] = useState(null) // { kind: 'create'|'edit'|'capacity'|'history'|'reset'|'archive', person? }
  const [shown, setShown] = useState(null)
  const [message, setMessage] = useState(null)
  const [reactivatingId, setReactivatingId] = useState(null)
  const { options: managers } = usePeopleOptions('MANAGER')

  const load = useCallback(() => request('GET', '/users', {
    query: { q, role, includeArchived: includeArchived ? 'true' : undefined, page: pageNumber, pageSize: 20 },
  }), [q, role, includeArchived, pageNumber])
  const { data, error, loading, reload } = useApi(load)
  useLastPage(data, pageNumber, setPageNumber)
  const rows = data?.items ?? []
  const showSalary = rows.some((p) => p.annualSalaryCents !== undefined)

  /** Reactivate an archived person; their button is disabled until the answer, so one press sends one request. */
  async function reactivate(p) {
    setMessage(null)
    setReactivatingId(p.userId)
    try {
      await request('POST', `/users/${p.userId}/reactivate`)
      reload()
    } catch (failure) {
      setMessage(failure.message)
    } finally {
      setReactivatingId(null)
    }
  }

  const canSetCapacity = (p) => isAdmin || (user.role === 'MANAGER' && p.managerId === user.userId)
  const canSeeHistory = canSetCapacity // the same people: admins see everyone, managers their reports
  const columns = [
    { key: 'name', label: 'Name', render: (p) => fullName(p) },
    { key: 'username', label: 'Username' },
    {
      key: 'role',
      label: 'Role',
      render: (p) => (
        <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'inherit' }}>
          <Chip size="small" variant="outlined" label={ROLE_LABELS[p.role]} />
          {p.isArchived && <Chip size="small" label="Archived" />}
        </Box>
      ),
    },
    { key: 'jobTitle', label: 'Job title' },
    { key: 'capacity', label: 'Capacity', render: (p) => `${p.weeklyCapacityHours} h/week${p.overtimeAllowed ? ' · overtime' : ''}` },
    ...(showSalary ? [{ key: 'salary', label: 'Salary', align: 'right', render: (p) => (p.annualSalaryCents === undefined ? 'Hidden' : formatCents(p.annualSalaryCents)) }] : []),
    {
      key: 'actions',
      label: '',
      align: 'right',
      render: (p) => {
        const name = fullName(p)
        return (
          <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            {canSetCapacity(p) && !p.isArchived && <Button size="small" variant="outlined" aria-label={`Capacity for ${name}`} onClick={() => setDialog({ kind: 'capacity', person: p })}>Capacity</Button>}
            {canSeeHistory(p) && <Button size="small" variant="outlined" aria-label={`History for ${name}`} onClick={() => setDialog({ kind: 'history', person: p })}>History</Button>}
            {isAdmin && !p.isArchived && <Button size="small" variant="outlined" aria-label={`Edit ${name}`} onClick={() => setDialog({ kind: 'edit', person: p })}>Edit</Button>}
            {isAdmin && !p.isArchived && p.userId !== user.userId && <Button size="small" variant="outlined" aria-label={`Reset password for ${name}`} onClick={() => setDialog({ kind: 'reset', person: p })}>Reset password</Button>}
            {isAdmin && p.userId !== user.userId && (p.isArchived
              ? (
                <Button size="small" variant="outlined" aria-label={`Reactivate ${name}`} onClick={() => reactivate(p)} disabled={reactivatingId === p.userId}>
                  {reactivatingId === p.userId ? 'Reactivating…' : 'Reactivate'}
                </Button>
              )
              : <Button size="small" variant="outlined" color="error" aria-label={`Archive ${name}`} onClick={() => setDialog({ kind: 'archive', person: p })}>Archive</Button>)}
          </Box>
        )
      },
    },
  ]

  const close = () => setDialog(null)
  const person = dialog?.person

  return (
    <>
      <PageHeader
        title="People"
        subtitle="Everyone in the organisation, their role, capacity and line manager."
        actions={isAdmin && <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialog({ kind: 'create' })}>New person</Button>}
      />
      <Box sx={{ mb: 2 }}>
        <SearchField id="people-search" label="Search people" placeholder="Name, username or email" onSearch={(text) => { setQ(text); setPageNumber(1) }} />
      </Box>
      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 3, alignItems: 'center' }}>
        <TextField id="people-role" select label="Role" size="small" value={role} onChange={(e) => { setRole(e.target.value); setPageNumber(1) }} sx={{ minWidth: 160 }}>
          <MenuItem value="">All roles</MenuItem>
          <MenuItem value="ADMIN">Admins</MenuItem>
          <MenuItem value="MANAGER">Managers</MenuItem>
          <MenuItem value="EMPLOYEE">Employees</MenuItem>
        </TextField>
        {isAdmin && (
          <FormControlLabel control={<Switch checked={includeArchived} onChange={(e) => { setIncludeArchived(e.target.checked); setPageNumber(1) }} />} label="Show archived" />
        )}
      </Box>

      {message && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setMessage(null)}>{message}</Alert>}
      <PageState loading={loading && !data} error={error} onRetry={reload}>
        <DataTable columns={columns} rows={rows} rowKey="userId" label="People" empty="Nobody matches." />
        <Pager page={pageNumber} totalPages={data?.totalPages} onChange={setPageNumber} />
      </PageState>

      {dialog?.kind === 'create' && (
        <FormDialog
          open
          title="New person"
          submitLabel="Create"
          fields={accountFields(managers)}
          defaults={{ role: 'EMPLOYEE' }}
          onSubmit={async (body) => {
            const result = await request('POST', '/users', { body })
            setShown({ title: 'Account created', person: fullName(result.user), username: result.user.username, password: result.temporaryPassword })
            reload()
          }}
          onClose={close}
        />
      )}
      {dialog?.kind === 'edit' && (
        <FormDialog
          open
          title={`Edit ${fullName(person)}`}
          fields={accountFields(managers)}
          initial={person}
          onSubmit={async (body) => { await request('PATCH', `/users/${person.userId}`, { body }); reload() }}
          onClose={close}
        />
      )}
      {dialog?.kind === 'capacity' && (
        <FormDialog
          open
          title={`Capacity for ${fullName(person)}`}
          fields={CAPACITY_FIELDS}
          initial={person}
          onSubmit={async (body) => { await request('PATCH', `/users/${person.userId}/capacity`, { body }); reload() }}
          onClose={close}
        />
      )}
      {dialog?.kind === 'history' && (
        <Dialog open onClose={close} aria-labelledby="history-title" maxWidth="lg" fullWidth fullScreen={isMobile}>
          <DialogTitle id="history-title">{`History: ${fullName(person)}`}</DialogTitle>
          <DialogContent><HistoryPanel userId={person.userId} /></DialogContent>
          <DialogActions><Button variant="outlined" onClick={close}>Close</Button></DialogActions>
        </Dialog>
      )}
      {dialog?.kind === 'reset' && (
        <ConfirmDialog
          open
          title={`Reset ${fullName(person)}'s password?`}
          message="They get a new one-time password and must choose their own when they next sign in. Their current password stops working."
          confirmLabel="Reset password"
          onConfirm={async () => {
            const result = await request('POST', `/users/${person.userId}/reset-password`)
            setShown({ title: 'Password reset', person: fullName(person), username: person.username, password: result.temporaryPassword })
          }}
          onClose={close}
        />
      )}
      {dialog?.kind === 'archive' && (
        <ConfirmDialog
          open
          title={`Archive ${fullName(person)}?`}
          message="They can no longer sign in and their bookings end. Their history (logged time, audit trail) is kept, and an admin can reactivate them."
          confirmLabel="Archive account"
          onConfirm={async () => { await request('POST', `/users/${person.userId}/archive`); reload() }}
          onClose={close}
        />
      )}
      {shown && <PasswordShown {...shown} onClose={() => setShown(null)} />}
    </>
  )
}
