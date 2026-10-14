import { useCallback, useState } from 'react'
import PropTypes from 'prop-types'
import { Link, useNavigate } from 'react-router'
import { Box, Button, Chip, FormControlLabel, MenuItem, Pagination, Switch, TextField } from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import DataTable from '../../components/DataTable'
import FormDialog from '../../components/FormDialog'
import PageHeader from '../../components/PageHeader'
import PageState from '../../components/PageState'
import StatusChip from '../../components/StatusChip'
import { useAuth } from '../../auth/useAuth'
import { formatCents, formatDate } from '../../services/format'
import { usePeopleOptions } from '../../services/people'
import { request } from '../../services/request'
import { useApi } from '../../services/useApi'
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
        { name: 'predictedEndDate', label: 'End date', type: 'date', required: true },
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
 * they're booked on), searchable and filterable on the server.
 */
export default function ProjectsPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const isAdmin = user.role === 'ADMIN'
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [includeArchived, setIncludeArchived] = useState(false)
  const [pageNumber, setPageNumber] = useState(1)
  const [creating, setCreating] = useState(false)

  const load = useCallback(() => request('GET', '/projects', {
    query: { search, status, includeArchived: includeArchived ? 'true' : undefined, page: pageNumber, pageSize: PAGE_SIZE },
  }), [search, status, includeArchived, pageNumber])
  const { data, error, loading, reload } = useApi(load)

  const columns = [
    { key: 'name', label: 'Project', render: (p) => <Link to={`/projects/${p.projectId}`}>{p.name}</Link> },
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
  ]

  return (
    <>
      <PageHeader
        title="Projects"
        subtitle="Open a project for its deliverables, resources and budget."
        actions={isAdmin && <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreating(true)}>New project</Button>}
      />

      <Box component="form" onSubmit={(e) => { e.preventDefault(); setSearch(searchInput.trim()); setPageNumber(1) }} sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 3, alignItems: 'center' }}>
        <TextField id="projects-search" label="Search projects" size="small" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} sx={{ flex: '1 1 220px' }} />
        <Button type="submit" variant="outlined">Search</Button>
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
        <DataTable columns={columns} rows={data?.items ?? []} rowKey="projectId" label="Projects" empty="No projects match." />
        {data?.totalPages > 1 && (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
            <Pagination count={data.totalPages} page={pageNumber} onChange={(_, value) => setPageNumber(value)} />
          </Box>
        )}
      </PageState>

      {creating && (
        <NewProjectDialog
          onClose={() => setCreating(false)}
          onCreated={(project) => navigate(`/projects/${project.projectId}`)}
        />
      )}
    </>
  )
}
