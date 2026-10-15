import { useCallback, useState } from 'react'
import PropTypes from 'prop-types'
import { Alert, Box, Button, Menu, MenuItem, Tab, Tabs } from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import FormDialog from '../../components/FormDialog'
import PageHeader from '../../components/PageHeader'
import { useAuth } from '../../auth/useAuth'
import { request } from '../../services/request'
import { useApi } from '../../services/useApi'
import RequestList from './RequestList'
import { KIND_LABELS, SCOPES_BY_ROLE, SEND_KINDS, TAB_LABELS, kindsOn } from './constants'

const NOTE = { name: 'justification', label: 'Why is it needed?', type: 'textarea', required: true }
/** The form for each kind; ARCHIVE_PROJECT's project options are filled in when it opens. */
const FIELDS_BY_KIND = {
  NEW_PROJECT: [
    { name: 'name', label: 'Name', required: true },
    { name: 'description', label: 'Description', type: 'textarea' },
    NOTE,
    { name: 'proposedStart', label: 'Proposed start', type: 'date' },
    { name: 'proposedEnd', label: 'Proposed end', type: 'date', notBefore: 'proposedStart' },
  ],
  ARCHIVE_PROJECT: [{ name: 'projectId', label: 'Project', type: 'select', numeric: true, required: true }, NOTE],
  TASK_LIMIT: [{ name: 'taskLimit', label: 'New limit (1 to 10)', type: 'number', min: 1, max: 10, required: true }, NOTE],
  OVERTIME: [NOTE],
  OTHER: [{ name: 'name', label: 'Subject', required: true }, NOTE],
}
const APPROVE_PROJECT_FIELDS = [
  { name: 'startDate', label: 'Start date', type: 'date', required: true },
  { name: 'predictedEndDate', label: 'End date', type: 'date', required: true, notBefore: 'startDate' },
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
  MANAGER: 'Ask the admins for a project or to archive one. Your team\'s requests are under Approve or deny.',
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

/** A list's starting search, filters and page. */
const FRESH_VIEW = { q: '', status: '', kind: '', page: 1 }

/**
 * Requests: employees ask their line manager, managers ask the admins. Two lists, each
 * with its own search, filters and pages: "My requests" (what you sent; employees and
 * managers) and "Approve or deny" (what waits for your decision; managers and admins).
 * A manager has both as tabs; an employee or an admin has the one list that is theirs.
 * Approve and Reject show only on "Approve or deny"; the server re-checks every decision.
 */
export default function RequestsPage() {
  const { user } = useAuth()
  const sendKinds = SEND_KINDS[user.role]
  const scopes = SCOPES_BY_ROLE[user.role]
  const [tab, setTab] = useState('sent')
  const scope = scopes.includes(tab) ? tab : scopes[0]
  const [views, setViews] = useState({ sent: FRESH_VIEW, decide: FRESH_VIEW }) // each tab keeps its own
  const [version, setVersion] = useState(0)
  const [menuAnchor, setMenuAnchor] = useState(null)
  const [dialog, setDialog] = useState(null) // { action: 'send'|'approve'|'reject', kind?, request? }
  const [message, setMessage] = useState(null)

  const r = dialog?.request
  const close = () => setDialog(null)
  const reload = () => setVersion((n) => n + 1)
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
      {scopes.length > 1 && (
        <Tabs value={scope} onChange={(_, value) => setTab(value)} sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}>
          {scopes.map((s) => <Tab key={s} value={s} label={TAB_LABELS[s]} id={`requests-tab-${s}`} aria-controls="requests-panel" />)}
        </Tabs>
      )}
      <Box role={scopes.length > 1 ? 'tabpanel' : undefined} id="requests-panel" aria-labelledby={scopes.length > 1 ? `requests-tab-${scope}` : undefined}>
        <RequestList
          key={scope}
          scope={scope}
          kinds={kindsOn(user.role, scope)}
          view={views[scope]}
          version={version}
          notice={message && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setMessage(null)}>{message}</Alert>}
          onView={(patch) => setViews((all) => ({ ...all, [scope]: { ...all[scope], ...patch } }))}
          onDecide={(action, found) => setDialog({ action, request: found })}
        />
      </Box>

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
