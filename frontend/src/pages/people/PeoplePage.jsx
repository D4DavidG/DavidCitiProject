import { useCallback, useState } from 'react'
import {
  Box, Button, Chip, FormControlLabel, MenuItem, Switch, TextField,
} from '@mui/material'
import AddIcon from '@mui/icons-material/PersonAddAlt'
import DataTable from '../../components/DataTable'
import PageHeader from '../../components/PageHeader'
import PageState, { Pager } from '../../components/PageState'
import PersonActions, { AccountDialog, PasswordShown } from '../../components/PersonActions'
import SearchField from '../../components/SearchField'
import { useAuth } from '../../auth/useAuth'
import { ROLE_LABELS } from '../../components/navigation'
import { formatCents } from '../../services/format'
import { fullName } from '../../services/people'
import { request } from '../../services/request'
import { useApi } from '../../services/useApi'
import { useLastPage } from '../../services/useLastPage'

/**
 * The people in the organisation. Admins create accounts (the server generates the
 * username and a one-time password). Each row has one Actions menu (PersonActions) with
 * what you may do to that person: admins everything, managers capacity and history for
 * their own reports.
 */
export default function PeoplePage() {
  const { user } = useAuth()
  const isAdmin = user.role === 'ADMIN'
  const [q, setQ] = useState('')
  const [role, setRole] = useState('')
  const [includeArchived, setIncludeArchived] = useState(false)
  const [pageNumber, setPageNumber] = useState(1)
  const [creating, setCreating] = useState(false)
  const [shown, setShown] = useState(null)

  const load = useCallback(() => request('GET', '/users', {
    query: { q, role, includeArchived: includeArchived ? 'true' : undefined, page: pageNumber, pageSize: 20 },
  }), [q, role, includeArchived, pageNumber])
  const { data, error, loading, reload } = useApi(load)
  useLastPage(data, pageNumber, setPageNumber)
  const rows = data?.items ?? []
  const showSalary = rows.some((p) => p.annualSalaryCents !== undefined)

  const columns = [
    { key: 'name', label: 'Name', render: (p) => <Box component="span" sx={{ fontWeight: 600 }}>{fullName(p)}</Box> },
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
    { key: 'actions', label: '', align: 'right', render: (p) => <PersonActions person={p} onChanged={reload} /> },
  ]

  return (
    <>
      <PageHeader
        title="People"
        subtitle="Everyone in the organisation, their role, capacity and line manager."
        actions={isAdmin && <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreating(true)}>New person</Button>}
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

      <PageState loading={loading && !data} error={error} onRetry={reload}>
        <DataTable columns={columns} rows={rows} rowKey="userId" label="People" empty="Nobody matches." />
        <Pager page={pageNumber} totalPages={data?.totalPages} onChange={setPageNumber} />
      </PageState>

      {creating && (
        <AccountDialog
          title="New person"
          submitLabel="Create"
          defaults={{ role: 'EMPLOYEE' }}
          onSubmit={async (body) => {
            const result = await request('POST', '/users', { body })
            setShown({ title: 'Account created', person: fullName(result.user), username: result.user.username, password: result.temporaryPassword })
            reload()
          }}
          onClose={() => setCreating(false)}
        />
      )}
      {shown && <PasswordShown {...shown} onClose={() => setShown(null)} />}
    </>
  )
}
