import { useCallback, useState } from 'react'
import PropTypes from 'prop-types'
import { Link, useParams } from 'react-router'
import { Alert, Box, Button, Chip, Tab, Tabs, Typography } from '@mui/material'
import ConfirmDialog from '../../components/ConfirmDialog'
import FormDialog from '../../components/FormDialog'
import PageHeader from '../../components/PageHeader'
import PageState from '../../components/PageState'
import StatusChip from '../../components/StatusChip'
import { useAuth } from '../../auth/useAuth'
import { formatDate } from '../../services/format'
import { fullName, usePeopleOptions } from '../../services/people'
import { request } from '../../services/request'
import { useApi } from '../../services/useApi'
import BoardTab from './BoardTab'
import BudgetTab from './BudgetTab'
import DeliverablesTab from './DeliverablesTab'
import RequestArchiveDialog from './RequestArchiveDialog'
import ResourcesTab from './ResourcesTab'
import { archiveAction } from './archiveAction'
import { PROJECT_STATUSES } from './constants'

const MANAGER_FIELDS = [
  { name: 'description', label: 'Description', type: 'textarea' },
  { name: 'startDate', label: 'Start date', type: 'date' },
  { name: 'predictedEndDate', label: 'End date', type: 'date', notBefore: 'startDate' },
  { name: 'budgetCents', label: 'Budget ($)', type: 'money' },
  { name: 'status', label: 'Status', type: 'select', options: PROJECT_STATUSES },
]

/** Admins may also rename a project and change its manager. */
function EditProjectDialog({ project, isAdmin, onClose, onSaved }) {
  const { options } = usePeopleOptions('MANAGER')
  const fields = isAdmin
    ? [{ name: 'name', label: 'Name', required: true }, { name: 'managerId', label: 'Manager', type: 'select', numeric: true, options }, ...MANAGER_FIELDS]
    : MANAGER_FIELDS
  return (
    <FormDialog
      open
      title={`Edit ${project.name}`}
      fields={fields}
      initial={project}
      onSubmit={async (body) => onSaved(await request('PATCH', `/projects/${project.projectId}`, { body }))}
      onClose={onClose}
    />
  )
}

EditProjectDialog.propTypes = {
  project: PropTypes.shape({ projectId: PropTypes.number.isRequired, name: PropTypes.string.isRequired }).isRequired,
  isAdmin: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onSaved: PropTypes.func.isRequired,
}

/**
 * One project: its header (status, dates, manager, progress), then tabs for
 * deliverables (question 4), resources (who is booked) and budget (question 7),
 * and a link to the dependency view (question 6). The header offers Archive project to
 * admins and Request archive to the project's own manager. Employees see the
 * "Resources" tab as "People".
 */
export default function ProjectDetailPage() {
  const projectId = Number(useParams().id)
  const { user } = useAuth()
  const [tab, setTab] = useState('deliverables')
  const [editing, setEditing] = useState(false)
  const [archiving, setArchiving] = useState(false)
  const [reactivating, setReactivating] = useState(false)
  const [requesting, setRequesting] = useState(false)
  const [requestSent, setRequestSent] = useState(false)
  const [actionError, setActionError] = useState(null)

  const loadProject = useCallback(() => request('GET', `/projects/${projectId}`), [projectId])
  const project = useApi(loadProject)
  const loadBookings = useCallback(() => request('GET', `/projects/${projectId}/assignments`), [projectId])
  const bookings = useApi(loadBookings)
  const managerId = project.data?.managerId
  const loadManager = useCallback(
    () => (managerId ? request('GET', `/users/${managerId}`).catch(() => null) : Promise.resolve(null)),
    [managerId],
  )
  const manager = useApi(loadManager)

  /** Reactivate an archived project; the button is disabled until the answer, so one press sends one request. */
  async function reactivate() {
    setActionError(null)
    setReactivating(true)
    try {
      await request('POST', `/projects/${projectId}/reactivate`)
      project.reload()
    } catch (failure) {
      setActionError(failure.message)
    } finally {
      setReactivating(false)
    }
  }

  const p = project.data
  const isAdmin = user.role === 'ADMIN'
  const canManage = Boolean(p) && !p.isArchived && (isAdmin || (user.role === 'MANAGER' && p.managerId === user.userId))
  const showBudget = user.role !== 'EMPLOYEE'
  const archive = p ? archiveAction(user, p) : null
  const people = [...new Map((bookings.data?.items ?? []).map((b) => [b.userId, b.personName])).entries()]

  return (
    <PageState loading={project.loading && !p} error={project.error} onRetry={project.reload}>
      {p && (
        <>
          <PageHeader
            title={p.name}
            subtitle={p.description}
            actions={(
              <>
                <Button component={Link} to={`/projects/${projectId}/dependencies`} variant="outlined">Dependency view</Button>
                {canManage && <Button variant="outlined" onClick={() => setEditing(true)}>Edit project</Button>}
                {archive === 'archive' && <Button variant="outlined" color="error" onClick={() => setArchiving(true)}>Archive project</Button>}
                {archive === 'request' && <Button variant="outlined" onClick={() => setRequesting(true)}>Request archive</Button>}
                {isAdmin && p.isArchived && (
                  <Button variant="contained" onClick={reactivate} disabled={reactivating}>{reactivating ? 'Reactivating…' : 'Reactivate'}</Button>
                )}
              </>
            )}
          />
          {actionError && <Alert severity="error" sx={{ mb: 2 }}>{actionError}</Alert>}
          {requestSent && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setRequestSent(false)}>Request sent. An admin will answer it.</Alert>}
          {p.isArchived && <Alert severity="warning" sx={{ mb: 2 }}>This project is archived: hidden from lists and read-only, but kept with its history.</Alert>}

          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center', mb: 2 }}>
            <StatusChip status={p.status} size="medium" />
            <Typography variant="body2">{p.progressPercent}% of estimated hours done</Typography>
            <Typography variant="body2" color="text.secondary">{formatDate(p.startDate)} – {formatDate(p.predictedEndDate)}</Typography>
            {manager.data && <Chip variant="outlined" label={`Managed by ${fullName(manager.data)}`} />}
          </Box>

          <Tabs value={tab} onChange={(_, value) => setTab(value)} sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }} variant="scrollable" allowScrollButtonsMobile>
            <Tab value="deliverables" label="Deliverables" />
            <Tab value="resources" label={user.role === 'EMPLOYEE' ? 'People' : 'Resources'} />
            {showBudget && <Tab value="budget" label="Budget" />}
            <Tab value="board" label="Board" />
          </Tabs>

          {tab === 'deliverables' && <DeliverablesTab projectId={projectId} canManage={canManage} people={people} startDate={p.startDate} predictedEndDate={p.predictedEndDate} />}
          {tab === 'resources' && (
            <PageState loading={bookings.loading && !bookings.data} error={bookings.error} onRetry={bookings.reload}>
              <ResourcesTab projectId={projectId} bookings={bookings.data?.items ?? []} canManage={canManage} onChanged={bookings.reload} />
            </PageState>
          )}
          {tab === 'budget' && showBudget && <BudgetTab projectId={projectId} />}
          {tab === 'board' && <BoardTab projectId={projectId} canManage={canManage} />}

          {editing && <EditProjectDialog project={p} isAdmin={isAdmin} onClose={() => setEditing(false)} onSaved={() => project.reload()} />}
          {requesting && <RequestArchiveDialog project={p} onSent={() => setRequestSent(true)} onClose={() => setRequesting(false)} />}
          {archiving && (
            <ConfirmDialog
              open
              title={`Archive ${p.name}?`}
              message="The project, its bookings, deliverables and tasks are hidden from lists but kept, with all their history and costs, and can be reactivated by an admin."
              confirmLabel="Archive project"
              onConfirm={async () => { await request('POST', `/projects/${projectId}/archive`); project.reload() }}
              onClose={() => setArchiving(false)}
            />
          )}
        </>
      )}
    </PageState>
  )
}
