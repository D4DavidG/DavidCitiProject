import { useCallback, useState } from 'react'
import PropTypes from 'prop-types'
import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, MenuItem, Pagination,
  Switch, TextField, Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/PersonAddAlt'
import ConfirmDialog from '../../components/ConfirmDialog'
import DataTable from '../../components/DataTable'
import FormDialog from '../../components/FormDialog'
import PageHeader from '../../components/PageHeader'
import PageState from '../../components/PageState'
import { useAuth } from '../../auth/useAuth'
import { ROLE_LABELS } from '../../components/navigation'
import { formatCents } from '../../services/format'
import { fullName, usePeopleOptions } from '../../services/people'
import { request } from '../../services/request'
import { useApi } from '../../services/useApi'

const ROLE_OPTIONS = [['EMPLOYEE', 'Employee'], ['MANAGER', 'Manager'], ['ADMIN', 'Admin']]
const CAPACITY_FIELDS = [
  { name: 'weeklyCapacityHours', label: 'Weekly capacity (hours)', type: 'number', helper: 'Logging past this in a week is refused unless overtime is allowed.' },
  { name: 'overtimeAllowed', label: 'Overtime allowed', type: 'boolean' },
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

/** Shows a generated password once, with a copy button. It is never shown again. */
function PasswordShown({ title, person, username, password, onClose }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(password)
      setCopied(true)
    } catch {
      setCopied(false)
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
      </DialogContent>
      <DialogActions>
        <Button onClick={copy}>{copied ? 'Copied' : 'Copy password'}</Button>
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
 */
export default function PeoplePage() {
  const { user } = useAuth()
  const isAdmin = user.role === 'ADMIN'
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [role, setRole] = useState('')
  const [includeArchived, setIncludeArchived] = useState(false)
  const [pageNumber, setPageNumber] = useState(1)
  const [dialog, setDialog] = useState(null) // { kind: 'create'|'edit'|'capacity'|'reset'|'archive', person? }
  const [shown, setShown] = useState(null)
  const [message, setMessage] = useState(null)
  const { options: managers } = usePeopleOptions('MANAGER')

  const load = useCallback(() => request('GET', '/users', {
    query: { search, role, includeArchived: includeArchived ? 'true' : undefined, page: pageNumber, pageSize: 20 },
  }), [search, role, includeArchived, pageNumber])
  const { data, error, loading, reload } = useApi(load)
  const rows = data?.items ?? []
  const showSalary = rows.some((p) => p.annualSalaryCents !== undefined)

  const canSetCapacity = (p) => isAdmin || (user.role === 'MANAGER' && p.managerId === user.userId)
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
    ...(showSalary ? [{ key: 'salary', label: 'Salary', align: 'right', render: (p) => formatCents(p.annualSalaryCents) }] : []),
    {
      key: 'actions',
      label: '',
      align: 'right',
      render: (p) => {
        const name = fullName(p)
        return (
          <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            {canSetCapacity(p) && !p.isArchived && <Button size="small" aria-label={`Capacity for ${name}`} onClick={() => setDialog({ kind: 'capacity', person: p })}>Capacity</Button>}
            {isAdmin && !p.isArchived && <Button size="small" aria-label={`Edit ${name}`} onClick={() => setDialog({ kind: 'edit', person: p })}>Edit</Button>}
            {isAdmin && !p.isArchived && p.userId !== user.userId && <Button size="small" aria-label={`Reset password for ${name}`} onClick={() => setDialog({ kind: 'reset', person: p })}>Reset password</Button>}
            {isAdmin && p.userId !== user.userId && (p.isArchived
              ? <Button size="small" aria-label={`Reactivate ${name}`} onClick={async () => { await request('POST', `/users/${p.userId}/reactivate`).catch((f) => setMessage(f.message)); reload() }}>Reactivate</Button>
              : <Button size="small" color="inherit" aria-label={`Archive ${name}`} onClick={() => setDialog({ kind: 'archive', person: p })}>Archive</Button>)}
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
      {message && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setMessage(null)}>{message}</Alert>}

      <Box component="form" onSubmit={(e) => { e.preventDefault(); setSearch(searchInput.trim()); setPageNumber(1) }} sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 3, alignItems: 'center' }}>
        <TextField id="people-search" label="Search people" size="small" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} sx={{ flex: '1 1 220px' }} helperText="Name, username or email" />
        <Button type="submit" variant="outlined">Search</Button>
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

      <PageState loading={loading && !data} error={error} onRetry={reload}>
        <DataTable columns={columns} rows={rows} rowKey="userId" label="People" empty="Nobody matches." />
        {data?.totalPages > 1 && (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
            <Pagination count={data.totalPages} page={pageNumber} onChange={(_, value) => setPageNumber(value)} />
          </Box>
        )}
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
