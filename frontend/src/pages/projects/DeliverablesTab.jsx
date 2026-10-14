import { useCallback, useState } from 'react'
import PropTypes from 'prop-types'
import { Alert, Box, Button, Card, CardActions, CardContent, Chip, LinearProgress, Typography } from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import ConfirmDialog from '../../components/ConfirmDialog'
import FormDialog from '../../components/FormDialog'
import PageState from '../../components/PageState'
import StatusChip from '../../components/StatusChip'
import { formatDate } from '../../services/format'
import { request } from '../../services/request'
import { useApi } from '../../services/useApi'
import TaskList from './TaskList'

const FIELDS = [
  { name: 'name', label: 'Name', required: true },
  { name: 'description', label: 'Description', type: 'textarea' },
  { name: 'startDate', label: 'Start date', type: 'date', required: true },
  { name: 'dueDate', label: 'Due date', type: 'date', required: true },
]

/**
 * Why a deliverable can't be signed off yet, in words, or null when it can. Mirrors the
 * server's rule in milestones.sign_off (no open tasks; nothing it depends on unsigned,
 * which the server reports as status BLOCKED) so the button isn't a dead end. The server
 * still has the final say.
 */
function signOffBlocker(d) {
  const left = d.taskCount - d.doneTaskCount
  const reasons = []
  if (left > 0) reasons.push(`${left} ${left === 1 ? 'task' : 'tasks'} left to finish`)
  if (d.status === 'BLOCKED') reasons.push('waiting for what it depends on')
  return reasons.length ? reasons.join(' and ') : null
}

function Deliverable({ deliverable, canManage, people, onAction, onEdit, onArchive, onChanged }) {
  const [open, setOpen] = useState(false)
  const titleId = `deliverable-${deliverable.milestoneId}`
  const notReady = signOffBlocker(deliverable)
  return (
    <Card component="section" aria-labelledby={titleId}>
      <CardContent sx={{ display: 'grid', gap: 1 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}>
          <Typography id={titleId} variant="h3" component="h2">{deliverable.name}</Typography>
          <Box sx={{ display: 'flex', gap: 1 }}>
            {deliverable.completedAt && <Chip size="small" color="success" variant="outlined" label="Signed off" />}
            <StatusChip status={deliverable.status} />
          </Box>
        </Box>
        {deliverable.description && <Typography variant="body2" color="text.secondary">{deliverable.description}</Typography>}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}>
          <Typography variant="body2">
            {deliverable.progressPercent}% of estimated hours · {deliverable.doneTaskCount} of {deliverable.taskCount} {deliverable.taskCount === 1 ? 'task' : 'tasks'} done
          </Typography>
          <Typography variant="body2" color="text.secondary">Due {formatDate(deliverable.dueDate)}</Typography>
        </Box>
        <LinearProgress variant="determinate" value={deliverable.progressPercent} color="success" aria-label="Progress" sx={{ height: 6, borderRadius: 3 }} />
        {open && <TaskList milestoneId={deliverable.milestoneId} canManage={canManage} people={people} onChanged={onChanged} />}
      </CardContent>
      <CardActions sx={{ flexWrap: 'wrap' }}>
        <Button size="small" onClick={() => setOpen(!open)}>{open ? 'Hide tasks' : 'Show tasks'}</Button>
        {canManage && (deliverable.completedAt
          ? <Button size="small" onClick={() => onAction(deliverable, 'reopen')}>Reopen</Button>
          : <Button size="small" disabled={Boolean(notReady)} onClick={() => onAction(deliverable, 'sign-off')}>Sign off</Button>)}
        {canManage && <Button size="small" onClick={() => onEdit(deliverable)}>Edit</Button>}
        {canManage && <Button size="small" color="inherit" onClick={() => onArchive(deliverable)}>Archive</Button>}
        {canManage && !deliverable.completedAt && notReady && (
          <Typography variant="caption" color="text.secondary">Sign-off opens when it&apos;s done: {notReady}.</Typography>
        )}
      </CardActions>
    </Card>
  )
}

Deliverable.propTypes = {
  deliverable: PropTypes.shape({
    milestoneId: PropTypes.number.isRequired,
    name: PropTypes.string.isRequired,
    description: PropTypes.string,
    status: PropTypes.string.isRequired,
    progressPercent: PropTypes.number.isRequired,
    taskCount: PropTypes.number.isRequired,
    doneTaskCount: PropTypes.number.isRequired,
    dueDate: PropTypes.string.isRequired,
    completedAt: PropTypes.string,
  }).isRequired,
  canManage: PropTypes.bool.isRequired,
  people: PropTypes.arrayOf(PropTypes.array).isRequired,
  onAction: PropTypes.func.isRequired,
  onEdit: PropTypes.func.isRequired,
  onArchive: PropTypes.func.isRequired,
  onChanged: PropTypes.func.isRequired,
}

/**
 * Question 4: the project's deliverables, each with a status and progress the
 * server computes from its tasks. The manager signs a deliverable off; the server
 * refuses while any task, or anything it depends on, is unfinished.
 */
export default function DeliverablesTab({ projectId, canManage, people }) {
  const load = useCallback(() => request('GET', `/projects/${projectId}/milestones`), [projectId])
  const { data, error, loading, reload } = useApi(load)
  const [actionError, setActionError] = useState(null)
  const [dialog, setDialog] = useState(null) // null | { deliverable?: object }
  const [archiving, setArchiving] = useState(null)

  async function act(deliverable, action) {
    setActionError(null)
    try {
      await request('POST', `/milestones/${deliverable.milestoneId}/${action}`)
      reload()
    } catch (failure) {
      setActionError(failure.message)
    }
  }

  async function save(body) {
    const existing = dialog.deliverable
    await request(existing ? 'PATCH' : 'POST', existing ? `/milestones/${existing.milestoneId}` : `/projects/${projectId}/milestones`, { body })
    reload()
  }

  const items = data?.items ?? []
  return (
    <Box sx={{ display: 'grid', gap: 2 }}>
      {actionError && <Alert severity="error" onClose={() => setActionError(null)}>{actionError}</Alert>}
      {canManage && (
        <Box><Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialog({})}>New deliverable</Button></Box>
      )}
      <PageState loading={loading} error={error} onRetry={reload} empty={data && items.length === 0 ? 'No deliverables yet.' : null}>
        {items.map((d) => (
          <Deliverable
            key={d.milestoneId}
            deliverable={d}
            canManage={canManage}
            people={people}
            onAction={act}
            onEdit={(deliverable) => setDialog({ deliverable })}
            onArchive={setArchiving}
            onChanged={reload}
          />
        ))}
      </PageState>

      {dialog && (
        <FormDialog
          open
          title={dialog.deliverable ? `Edit ${dialog.deliverable.name}` : 'New deliverable'}
          submitLabel={dialog.deliverable ? 'Save' : 'Create'}
          fields={FIELDS}
          initial={dialog.deliverable ?? null}
          onSubmit={save}
          onClose={() => setDialog(null)}
        />
      )}
      {archiving && (
        <ConfirmDialog
          open
          title={`Archive ${archiving.name}?`}
          message="The deliverable and its tasks are hidden from the project but kept, with their history, and can be reactivated."
          confirmLabel="Archive deliverable"
          onConfirm={async () => { await request('POST', `/milestones/${archiving.milestoneId}/archive`); reload() }}
          onClose={() => setArchiving(null)}
        />
      )}
    </Box>
  )
}

DeliverablesTab.propTypes = {
  projectId: PropTypes.number.isRequired,
  canManage: PropTypes.bool.isRequired,
  /** [userId, name] for everyone booked on the project (task assignees). */
  people: PropTypes.arrayOf(PropTypes.array).isRequired,
}
