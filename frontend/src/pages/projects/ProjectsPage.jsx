import { useCallback, useState } from 'react'
import PropTypes from 'prop-types'
import { Link, useNavigate } from 'react-router'
import { Box, Button, Chip, FormControlLabel, MenuItem, Switch, TextField, Typography } from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import ConfirmDialog from '../../components/ConfirmDialog'
import DataTable from '../../components/DataTable'
import FormDialog from '../../components/FormDialog'
import PageHeader from '../../components/PageHeader'
import PageState, { Pager } from '../../components/PageState'
import SearchField from '../../components/SearchField'
import StatusChip from '../../components/StatusChip'
import { useAuth } from '../../auth/useAuth'
import { formatCents, formatDate } from '../../services/format'
import { usePeopleOptions } from '../../services/people'
import { request } from '../../services/request'
import { useApi } from '../../services/useApi'
import { useLastPage } from '../../services/useLastPage'
import RequestArchiveDialog from './RequestArchiveDialog'
import { archiveAction } from './archiveAction'
import { PROJECT_STATUSES } from './constants'

const PAGE_SIZE = 20

/** Admin only: create a project and give it a manager. */
function NewProjectDialog({ onClose, onCreated }) {
  const { options } = usePeopleOptions('MANAGER')
  return (
    <FormDialog
      open
      title="New project"
      submitLabel="Create"
      fields={[
        { name: 'name', label: 'Name', required: true },
        { name: 'description', label: 'Description', type: 'textarea' },
        { name: 'managerId', label: 'Manager', type: 'select', numeric: true, options, required: true },
        { name: 'startDate', label: 'Start date', type: 'date', required: true },
        { name: 'predictedEndDate', label: 'End date', type: 'date', required: true, notBefore: 'startDate' },
        { name: 'budgetCents', label: 'Budget ($)', type: 'money', helper: 'In dollars, e.g. 150,000' },
      ]}
      onSubmit={async (body) => onCreated(await request('POST', '/projects', { body }))}
      onClose={onClose}
    />
  )
}

NewProjectDialog.propTypes = { onClose: PropTypes.func.isRequired, onCreated: PropTypes.func.isRequired }

/**
 * Every project you can see (admins: all, managers: theirs, employees: the ones
 * they're booked on), searchable and filterable on the server. Each name is a secondary
 * button that opens the project. Admins can archive from here; a manager can ask the admins
 * to archive a project they manage.
 */
export default function ProjectsPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const isAdmin = user.role === 'ADMIN'
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [includeArchived, setIncludeArchived] = useState(false)
  const [pageNumber, setPageNumber] = useState(1)
  const [creating, setCreating] = useState(false)
  const [dialog, setDialog] = useState(null) // { kind: 'archive'|'request', project }
  const [sentFor, setSentFor] = useState(null) // the project a request was just sent for

  const load = useCallback(() => request('GET', '/projects', {
    query: { q, status, includeArchived: includeArchived ? 'true' : undefined, page: pageNumber, pageSize: PAGE_SIZE },
  }), [q, status, includeArchived, pageNumber])
  const { data, error, loading, reload } = useApi(load)
  const rows = data?.items ?? []
  useLastPage(data, pageNumber, setPageNumber)

  const columns = [
    {
      key: 'name',
      label: 'Project',
      // A secondary button that is a real link (spec 5c): obviously clickable, left aligned, reachable by keyboard.
      render: (p) => (
        <Button component={Link} to={`/projects/${p.projectId}`} variant="outlined" size="small" sx={{ fontWeight: 600, justifyContent: 'flex-start', textAlign: 'left' }}>
          {p.name}
        </Button>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (p) => (
        <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'inherit' }}>
          <StatusChip status={p.status} />
          {p.isArchived && <Chip size="small" label="Archived" />}
        </Box>
      ),
    },
    { key: 'progressPercent', label: 'Progress', align: 'right', render: (p) => `${p.progressPercent}%` },
    { key: 'startDate', label: 'Start', render: (p) => formatDate(p.startDate) },
    { key: 'predictedEndDate', label: 'End', render: (p) => formatDate(p.predictedEndDate) },
    ...(user.role === 'EMPLOYEE' ? [] : [{ key: 'budgetCents', label: 'Budget', align: 'right', render: (p) => formatCents(p.budgetCents) }]),
    // Only when some project on the page has an action, so a column of dashes never shows.
    ...(rows.some((p) => archiveAction(user, p)) ? [{
      key: 'actions',
      label: '',
      align: 'right',
      render: (p) => {
        const action = archiveAction(user, p)
        return (
          <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'wrap' }}>
            {sentFor === p.projectId && <Typography variant="body2" role="status">Request sent. An admin will answer it.</Typography>}
            {action === 'archive' && <Button size="small" variant="outlined" color="error" aria-label={`Archive ${p.name}`} onClick={() => setDialog({ kind: 'archive', project: p })}>Archive</Button>}
            {action === 'request' && <Button size="small" variant="outlined" aria-label={`Request archive for ${p.name}`} onClick={() => setDialog({ kind: 'request', project: p })}>Request archive</Button>}
          </Box>
        )
      },
    }] : []),
  ]

  return (
    <>
      <PageHeader
        title="Projects"
        subtitle={user.role === 'EMPLOYEE'
          ? 'The projects you are booked on. Open one for its deliverables and who is working on it.'
          : 'Open a project for its deliverables, resources and budget.'}
        actions={isAdmin && <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreating(true)}>New project</Button>}
      />

      <Box sx={{ mb: 2 }}>
        <SearchField id="projects-search" label="Search projects" placeholder="Project name" onSearch={(text) => { setQ(text); setPageNumber(1) }} />
      </Box>
      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 3, alignItems: 'center' }}>
        <TextField id="projects-status" select label="Status" size="small" value={status} onChange={(e) => { setStatus(e.target.value); setPageNumber(1) }} sx={{ minWidth: 160 }}>
          <MenuItem value="">All statuses</MenuItem>
          {PROJECT_STATUSES.map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}
        </TextField>
        {isAdmin && (
          <FormControlLabel
            control={<Switch checked={includeArchived} onChange={(e) => { setIncludeArchived(e.target.checked); setPageNumber(1) }} />}
            label="Show archived"
          />
        )}
      </Box>

      <PageState loading={loading} error={error} onRetry={reload}>
        <DataTable columns={columns} rows={rows} rowKey="projectId" label="Projects" empty="No projects match." />
        <Pager page={pageNumber} totalPages={data?.totalPages} onChange={setPageNumber} />
      </PageState>

      {dialog?.kind === 'archive' && (
        <ConfirmDialog
          open
          title={`Archive ${dialog.project.name}?`}
          message="The project, its bookings, deliverables and tasks are hidden from lists but kept, with all their history and costs, and can be reactivated by an admin."
          confirmLabel="Archive project"
          onConfirm={async () => { await request('POST', `/projects/${dialog.project.projectId}/archive`); reload() }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'request' && (
        <RequestArchiveDialog
          project={dialog.project}
          onSent={() => setSentFor(dialog.project.projectId)}
          onClose={() => setDialog(null)}
        />
      )}
      {creating && (
        <NewProjectDialog
          onClose={() => setCreating(false)}
          onCreated={(project) => navigate(`/projects/${project.projectId}`)}
        />
      )}
    </>
  )
}
