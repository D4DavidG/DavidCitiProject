import { useCallback, useState } from 'react'
import { Link } from 'react-router'
import { Alert, Box, Button, MenuItem, Pagination, TextField } from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import DataTable from '../../components/DataTable'
import FormDialog from '../../components/FormDialog'
import PageHeader from '../../components/PageHeader'
import PageState from '../../components/PageState'
import StatusChip from '../../components/StatusChip'
import { useAuth } from '../../auth/useAuth'
import { formatDate } from '../../services/format'
import { usePeopleOptions } from '../../services/people'
import { request } from '../../services/request'
import { useApi } from '../../services/useApi'

const REQUEST_FIELDS = [
  { name: 'name', label: 'Name', required: true },
  { name: 'description', label: 'Description', type: 'textarea' },
  { name: 'justification', label: 'Why is it needed?', type: 'textarea', required: true },
  { name: 'proposedStart', label: 'Proposed start', type: 'date' },
  { name: 'proposedEnd', label: 'Proposed end', type: 'date' },
]
const APPROVE_FIELDS = [
  { name: 'startDate', label: 'Start date', type: 'date', required: true },
  { name: 'predictedEndDate', label: 'End date', type: 'date', required: true },
  { name: 'budgetCents', label: 'Budget ($)', type: 'money' },
  { name: 'decisionNote', label: 'Note to the manager', type: 'textarea' },
]

function dates(r) {
  if (!r.proposedStart && !r.proposedEnd) return 'No dates proposed'
  return `${formatDate(r.proposedStart)} – ${formatDate(r.proposedEnd)}`
}

/**
 * Project intake: a manager asks for a new project with a justification; an admin
 * approves it (which creates the project, managed by whoever asked) or rejects it with
 * a note. Managers see their own requests; admins see all of them.
 */
export default function RequestsPage() {
  const { user } = useAuth()
  const isAdmin = user.role === 'ADMIN'
  const [status, setStatus] = useState('')
  const [pageNumber, setPageNumber] = useState(1)
  const [dialog, setDialog] = useState(null) // { kind: 'new'|'approve'|'reject', request? }
  const [message, setMessage] = useState(null)
  const { options: managers } = usePeopleOptions('MANAGER')
  const names = Object.fromEntries(managers)

  const load = useCallback(() => request('GET', '/project-requests', { query: { status, page: pageNumber, pageSize: 20 } }), [status, pageNumber])
  const { data, error, loading, reload } = useApi(load)

  const columns = [
    { key: 'name', label: 'Project', render: (r) => r.name },
    { key: 'requestedBy', label: 'Requested by', render: (r) => names[r.requestedBy] ?? '—' },
    { key: 'dates', label: 'Proposed dates', render: dates },
    { key: 'justification', label: 'Why' },
    { key: 'status', label: 'Status', render: (r) => <StatusChip status={r.status} /> },
    { key: 'decisionNote', label: 'Decision note' },
    {
      key: 'actions',
      label: '',
      align: 'right',
      render: (r) => (
        <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
          {r.createdProjectId && <Button size="small" component={Link} to={`/projects/${r.createdProjectId}`}>Open project</Button>}
          {isAdmin && r.status === 'PENDING' && (
            <>
              <Button size="small" variant="contained" color="success" aria-label={`Approve ${r.name}`} onClick={() => setDialog({ kind: 'approve', request: r })}>Approve</Button>
              <Button size="small" color="error" aria-label={`Reject ${r.name}`} onClick={() => setDialog({ kind: 'reject', request: r })}>Reject</Button>
            </>
          )}
        </Box>
      ),
    },
  ]

  const r = dialog?.request
  const close = () => setDialog(null)
  return (
    <>
      <PageHeader
        title="Project requests"
        subtitle={isAdmin ? 'Requests from managers for new projects. Approving one creates the project.' : 'Ask an admin for a new project. You will manage it once it is approved.'}
        actions={user.role === 'MANAGER' && <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialog({ kind: 'new' })}>New request</Button>}
      />
      {message && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setMessage(null)}>{message}</Alert>}
      <Box sx={{ mb: 3 }}>
        <TextField id="requests-status" select size="small" label="Status" value={status} onChange={(e) => { setStatus(e.target.value); setPageNumber(1) }} sx={{ minWidth: 180 }}>
          <MenuItem value="">All statuses</MenuItem>
          <MenuItem value="PENDING">Pending</MenuItem>
          <MenuItem value="APPROVED">Approved</MenuItem>
          <MenuItem value="REJECTED">Rejected</MenuItem>
        </TextField>
      </Box>

      <PageState loading={loading && !data} error={error} onRetry={reload}>
        <DataTable columns={columns} rows={data?.items ?? []} rowKey="requestId" label="Project requests" empty="No requests." />
        {data?.totalPages > 1 && (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
            <Pagination count={data.totalPages} page={pageNumber} onChange={(_, value) => setPageNumber(value)} />
          </Box>
        )}
      </PageState>

      {dialog?.kind === 'new' && (
        <FormDialog
          open
          title="Request a new project"
          submitLabel="Send request"
          fields={REQUEST_FIELDS}
          onSubmit={async (body) => { await request('POST', '/project-requests', { body }); setMessage('Request sent. An admin will approve or reject it.'); reload() }}
          onClose={close}
        />
      )}
      {dialog?.kind === 'approve' && (
        <FormDialog
          open
          title={`Approve ${r.name}`}
          submitLabel="Approve and create project"
          fields={APPROVE_FIELDS}
          defaults={{ startDate: r.proposedStart, predictedEndDate: r.proposedEnd }}
          onSubmit={async (body) => {
            const result = await request('POST', `/project-requests/${r.requestId}/approve`, { body })
            setMessage(`Approved: project ${result.request?.name ?? r.name} created.`)
            reload()
          }}
          onClose={close}
        />
      )}
      {dialog?.kind === 'reject' && (
        <FormDialog
          open
          title={`Reject ${r.name}`}
          submitLabel="Reject"
          fields={[{ name: 'decisionNote', label: 'Note to the manager', type: 'textarea' }]}
          onSubmit={async (body) => { await request('POST', `/project-requests/${r.requestId}/reject`, { body }); reload() }}
          onClose={close}
        />
      )}
    </>
  )
}
