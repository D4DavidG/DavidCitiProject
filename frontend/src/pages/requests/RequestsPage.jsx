import { useCallback, useState } from 'react'
import PropTypes from 'prop-types'
import { Link } from 'react-router'
import { Alert, Box, Button, Menu, MenuItem, Pagination, Tab, Tabs, TextField } from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import DataTable from '../../components/DataTable'
import FormDialog from '../../components/FormDialog'
import PageHeader from '../../components/PageHeader'
import PageState from '../../components/PageState'
import StatusChip from '../../components/StatusChip'
import { useAuth } from '../../auth/useAuth'
import { request } from '../../services/request'
import { useApi } from '../../services/useApi'

const KIND_LABELS = {
  NEW_PROJECT: 'New project',
  ARCHIVE_PROJECT: 'Archive a project',
  TASK_LIMIT: 'Raise my task limit',
  OVERTIME: 'Allow overtime',
  OTHER: 'Something else',
}
/** The kinds each role may send (the server's SENDERS). Admins have nobody to ask. */
const SEND_KINDS = {
  MANAGER: ['NEW_PROJECT', 'ARCHIVE_PROJECT', 'OTHER'],
  EMPLOYEE: ['TASK_LIMIT', 'OVERTIME', 'OTHER'],
  ADMIN: [],
}
const NOTE = { name: 'justification', label: 'Why is it needed?', type: 'textarea', required: true }
/** The form for each kind; ARCHIVE_PROJECT's project options are filled in when it opens. */
const FIELDS_BY_KIND = {
  NEW_PROJECT: [
    { name: 'name', label: 'Name', required: true },
    { name: 'description', label: 'Description', type: 'textarea' },
    NOTE,
    { name: 'proposedStart', label: 'Proposed start', type: 'date' },
    { name: 'proposedEnd', label: 'Proposed end', type: 'date' },
  ],
  ARCHIVE_PROJECT: [{ name: 'projectId', label: 'Project', type: 'select', numeric: true, required: true }, NOTE],
  TASK_LIMIT: [{ name: 'taskLimit', label: 'New limit (1 to 10)', type: 'number', required: true }, NOTE],
  OVERTIME: [NOTE],
  OTHER: [{ name: 'name', label: 'Subject', required: true }, NOTE],
}
const APPROVE_PROJECT_FIELDS = [
  { name: 'startDate', label: 'Start date', type: 'date', required: true },
  { name: 'predictedEndDate', label: 'End date', type: 'date', required: true },
  { name: 'budgetCents', label: 'Budget ($)', type: 'money' },
  { name: 'decisionNote', label: 'Note to the manager', type: 'textarea' },
]
/** What approving does, shown in the approve dialog. */
const EFFECTS = {
  ARCHIVE_PROJECT: () => 'This archives the project with its bookings, deliverables and tasks.',
  TASK_LIMIT: (r) => `This sets ${r.requesterName}'s task limit to ${r.taskLimit}.`,
  OVERTIME: (r) => `This turns overtime on for ${r.requesterName}.`,
  OTHER: () => 'Nothing else changes: your decision and note are the answer.',
}
const SUBTITLES = {
  EMPLOYEE: 'Ask your line manager for a higher task limit, overtime or anything else.',
  MANAGER: 'Ask the admins for a project or to archive one. Your team\'s requests are under To decide.',
  ADMIN: 'Requests from managers and employees. Approving applies the change.',
}

/** The form for sending one kind of request. */
function SendDialog({ kind, onSend, onClose }) {
  const loadProjects = useCallback(
    () => (kind === 'ARCHIVE_PROJECT' ? request('GET', '/projects', { query: { pageSize: 100 } }) : Promise.resolve(null)),
    [kind],
  )
  const { data: projects } = useApi(loadProjects)
  const options = (projects?.items ?? []).map((p) => [p.projectId, p.name])
  const fields = FIELDS_BY_KIND[kind].map((f) => (f.name === 'projectId' ? { ...f, options } : f))
  return (
    <FormDialog open title={KIND_LABELS[kind]} submitLabel="Send request" fields={fields}
      onSubmit={(body) => onSend({ ...body, kind })} onClose={onClose} />
  )
}

SendDialog.propTypes = {
  kind: PropTypes.oneOf(Object.keys(KIND_LABELS)).isRequired,
  onSend: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
}

/**
 * Requests: employees ask their line manager, managers ask the admins. Employees see
 * their own (Mine), admins what they decide (To decide), managers both, as tabs.
 * Approve and Reject show only on To decide; the server re-checks every decision.
 */
export default function RequestsPage() {
  const { user } = useAuth()
  const sendKinds = SEND_KINDS[user.role]
  const [tab, setTab] = useState('MINE')
  const scope = { EMPLOYEE: 'MINE', ADMIN: 'TO_DECIDE' }[user.role] ?? tab
  const [status, setStatus] = useState('')
  const [kind, setKind] = useState('')
  const [pageNumber, setPageNumber] = useState(1)
  const [menuAnchor, setMenuAnchor] = useState(null)
  const [dialog, setDialog] = useState(null) // { action: 'send'|'approve'|'reject', kind?, request? }
  const [message, setMessage] = useState(null)

  const load = useCallback(() => request('GET', '/project-requests', {
    query: { scope, status, kind, page: pageNumber, pageSize: 20 },
  }), [scope, status, kind, pageNumber])
  const { data, error, loading, reload } = useApi(load)

  const columns = [
    { key: 'name', label: 'Request' },
    { key: 'kind', label: 'Kind', render: (r) => KIND_LABELS[r.kind] },
    { key: 'requesterName', label: 'Asked by' },
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
          {scope === 'TO_DECIDE' && r.status === 'PENDING' && (
            <>
              <Button size="small" variant="contained" color="success" aria-label={`Approve ${r.name}`} onClick={() => setDialog({ action: 'approve', request: r })}>Approve</Button>
              <Button size="small" color="error" aria-label={`Reject ${r.name}`} onClick={() => setDialog({ action: 'reject', request: r })}>Reject</Button>
            </>
          )}
        </Box>
      ),
    },
  ]

  const r = dialog?.request
  const close = () => setDialog(null)
  const pick = (setter) => (e) => { setter(e.target.value); setPageNumber(1) }
  const decide = async (action, body) => {
    await request('POST', `/project-requests/${r.requestId}/${action}`, { body })
    setMessage(action === 'approve' && r.kind === 'NEW_PROJECT' ? `Approved: project ${r.name} created.` : `${action === 'approve' ? 'Approved' : 'Rejected'}: ${r.name}.`)
    reload()
  }
  return (
    <>
      <PageHeader
        title="Requests"
        subtitle={SUBTITLES[user.role]}
        actions={sendKinds.length > 0 && (
          <Button variant="contained" startIcon={<AddIcon />} aria-haspopup="menu" onClick={(e) => setMenuAnchor(e.currentTarget)}>New request</Button>
        )}
      />
      <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={() => setMenuAnchor(null)}>
        {sendKinds.map((k) => (
          <MenuItem key={k} onClick={() => { setMenuAnchor(null); setDialog({ action: 'send', kind: k }) }}>{KIND_LABELS[k]}</MenuItem>
        ))}
      </Menu>
      {message && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setMessage(null)}>{message}</Alert>}
      {user.role === 'MANAGER' && (
        <Tabs value={tab} onChange={(_, value) => { setTab(value); setPageNumber(1) }} sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}>
          <Tab value="MINE" label="Mine" />
          <Tab value="TO_DECIDE" label="To decide" />
        </Tabs>
      )}
      <Box sx={{ mb: 3, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        <TextField id="requests-status" select size="small" label="Status" value={status} onChange={pick(setStatus)} sx={{ minWidth: 180 }}>
          <MenuItem value="">All statuses</MenuItem>
          <MenuItem value="PENDING">Pending</MenuItem>
          <MenuItem value="APPROVED">Approved</MenuItem>
          <MenuItem value="REJECTED">Rejected</MenuItem>
        </TextField>
        <TextField id="requests-kind" select size="small" label="Kind" value={kind} onChange={pick(setKind)} sx={{ minWidth: 200 }}>
          <MenuItem value="">All kinds</MenuItem>
          {(user.role === 'EMPLOYEE' ? sendKinds : Object.keys(KIND_LABELS)).map((k) => <MenuItem key={k} value={k}>{KIND_LABELS[k]}</MenuItem>)}
        </TextField>
      </Box>

      <PageState loading={loading && !data} error={error} onRetry={reload}>
        <DataTable columns={columns} rows={data?.items ?? []} rowKey="requestId" label="Requests" empty="No requests." />
        {data?.totalPages > 1 && (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
            <Pagination count={data.totalPages} page={pageNumber} onChange={(_, value) => setPageNumber(value)} />
          </Box>
        )}
      </PageState>

      {dialog?.action === 'send' && (
        <SendDialog
          kind={dialog.kind}
          onSend={async (body) => {
            await request('POST', '/project-requests', { body })
            setMessage(`Request sent. ${user.role === 'EMPLOYEE' ? 'Your line manager' : 'An admin'} will answer it.`)
            reload()
          }}
          onClose={close}
        />
      )}
      {dialog?.action === 'approve' && r.kind === 'NEW_PROJECT' && (
        <FormDialog open title={`Approve ${r.name}`} submitLabel="Approve and create project" fields={APPROVE_PROJECT_FIELDS}
          defaults={{ startDate: r.proposedStart, predictedEndDate: r.proposedEnd }}
          onSubmit={(body) => decide('approve', body)} onClose={close} />
      )}
      {dialog?.action === 'approve' && r.kind !== 'NEW_PROJECT' && (
        <FormDialog open title={`Approve ${r.name}`} submitLabel="Approve"
          fields={[{ name: 'decisionNote', label: `Note to ${r.requesterName}`, type: 'textarea', helper: EFFECTS[r.kind](r) }]}
          onSubmit={(body) => decide('approve', body)} onClose={close} />
      )}
      {dialog?.action === 'reject' && (
        <FormDialog open title={`Reject ${r.name}`} submitLabel="Reject"
          fields={[{ name: 'decisionNote', label: `Note to ${r.requesterName}`, type: 'textarea' }]}
          onSubmit={(body) => decide('reject', body)} onClose={close} />
      )}
    </>
  )
}
