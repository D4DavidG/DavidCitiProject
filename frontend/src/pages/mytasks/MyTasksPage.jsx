import { useCallback, useState } from 'react'
import PropTypes from 'prop-types'
import { Alert, Box, Button, Card, CardActions, CardContent, MenuItem, TextField, Typography } from '@mui/material'
import ConfirmDialog from '../../components/ConfirmDialog'
import DataTable from '../../components/DataTable'
import FormDialog from '../../components/FormDialog'
import OverCapacityMark from '../../components/OverCapacityMark'
import PageHeader from '../../components/PageHeader'
import PageState, { Pager } from '../../components/PageState'
import StatusChip from '../../components/StatusChip'
import { formatDate, formatHours, todayIso } from '../../services/format'
import { request } from '../../services/request'
import { useApi } from '../../services/useApi'

const TASK_STATUSES = [['TODO', 'To do'], ['IN_PROGRESS', 'In progress'], ['DONE', 'Done']]
const TIME_FIELDS = [
  { name: 'workDate', label: 'Date', type: 'date', required: true, helper: 'Not in the future. You must have been booked on the project that day.' },
  { name: 'minutes', label: 'Time', type: 'duration', max: 1440, required: true, helper: 'Hours and minutes, e.g. 2 h 30 min.' },
  { name: 'note', label: 'Note', type: 'textarea' },
]

function TaskCard({ task, onMove, onLog }) {
  const titleId = `task-${task.taskId}`
  return (
    <Card component="article" aria-labelledby={titleId}>
      <CardContent sx={{ display: 'grid', gap: 1 }}>
        <Typography id={titleId} variant="h3" component="h2">{task.title}</Typography>
        <Typography variant="body2" color="text.secondary">{task.projectName} · {task.milestoneName}</Typography>
        {task.description && <Typography variant="body2">{task.description}</Typography>}
        <Typography variant="body2">Estimate {formatHours(task.estimateMinutes)}</Typography>
      </CardContent>
      <CardActions sx={{ gap: 1, flexWrap: 'wrap', px: 2, pb: 2 }}>
        <TextField
          id={`status-${task.taskId}`}
          select
          size="small"
          label="Status"
          value={task.status}
          onChange={(e) => onMove(task, e.target.value)}
          sx={{ minWidth: 160 }}
        >
          {TASK_STATUSES.map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}
        </TextField>
        <Button variant="contained" onClick={() => onLog(task)}>Log time</Button>
      </CardActions>
    </Card>
  )
}

TaskCard.propTypes = {
  task: PropTypes.shape({
    taskId: PropTypes.number.isRequired,
    title: PropTypes.string.isRequired,
    description: PropTypes.string,
    projectName: PropTypes.string,
    milestoneName: PropTypes.string,
    status: PropTypes.string.isRequired,
    estimateMinutes: PropTypes.number.isRequired,
  }).isRequired,
  onMove: PropTypes.func.isRequired,
  onLog: PropTypes.func.isRequired,
}

/**
 * A Ready task nobody holds yet, with the one button that takes it. The button is
 * disabled while that claim is running, so a double click sends one claim.
 */
function ReadyCard({ task, onTake, taking }) {
  const titleId = `ready-${task.taskId}`
  return (
    <Card component="article" aria-labelledby={titleId}>
      <CardContent sx={{ display: 'grid', gap: 1 }}>
        <Typography id={titleId} variant="h3" component="h3">{task.title}</Typography>
        <Typography variant="body2" color="text.secondary">{task.projectName} · {task.milestoneName}</Typography>
        {task.description && <Typography variant="body2">{task.description}</Typography>}
        <Typography variant="body2">Estimate {formatHours(task.estimateMinutes)}</Typography>
      </CardContent>
      <CardActions sx={{ px: 2, pb: 2 }}>
        <Button variant="contained" disabled={taking} onClick={() => onTake(task)}>Take this</Button>
      </CardActions>
    </Card>
  )
}

ReadyCard.propTypes = {
  task: PropTypes.shape({
    taskId: PropTypes.number.isRequired,
    title: PropTypes.string.isRequired,
    description: PropTypes.string,
    projectName: PropTypes.string,
    milestoneName: PropTypes.string,
    estimateMinutes: PropTypes.number.isRequired,
  }).isRequired,
  onTake: PropTypes.func.isRequired,
  /** True while this card's claim request is running. */
  taking: PropTypes.bool.isRequired,
}

/**
 * The employee's home: their open tasks (tick work off by moving status) and the
 * time they've logged. Logging past their weekly capacity (without overtime allowed)
 * asks "Log anyway?" with the server's message; Log anyway resends with
 * confirmOverCapacity and their manager is told. Other refusals show in the form.
 */
export default function MyTasksPage() {
  const loadTasks = useCallback(() => request('GET', '/me/tasks'), [])
  const tasks = useApi(loadTasks)
  const loadReady = useCallback(() => request('GET', '/me/ready-tasks'), [])
  const ready = useApi(loadReady)
  const [entriesPage, setEntriesPage] = useState(1)
  const loadEntries = useCallback(() => request('GET', '/me/time-entries', { query: { page: entriesPage, pageSize: 10 } }), [entriesPage])
  const entries = useApi(loadEntries)
  const [logging, setLogging] = useState(null)
  const [editing, setEditing] = useState(null)
  const [message, setMessage] = useState(null)
  const [takingId, setTakingId] = useState(null)
  const [overCapacity, setOverCapacity] = useState(null)

  /**
   * Run send(body). If the server answers OVER_CAPACITY, keep a resend with
   * confirmOverCapacity for the "Log anyway" button; the form then closes.
   */
  async function sendTime(send, body) {
    try {
      await send(body)
    } catch (failure) {
      if (failure.code !== 'OVER_CAPACITY') throw failure
      setOverCapacity({ message: failure.message, send: () => send({ ...body, confirmOverCapacity: true }) })
    }
  }

  function logTime(task, body) {
    return sendTime(async (sent) => {
      const entry = await request('POST', `/tasks/${task.taskId}/time-entries`, { body: sent })
      setMessage({ severity: 'success', text: `Logged ${formatHours(entry.minutes)} on ${task.title}. It's waiting for approval.` })
      entries.reload()
    }, body)
  }

  function editTime(entry, body) {
    return sendTime(async (sent) => {
      await request('PATCH', `/time-entries/${entry.entryId}`, { body: sent })
      entries.reload()
    }, body)
  }

  async function move(task, status) {
    setMessage(null)
    try {
      await request('POST', `/tasks/${task.taskId}/status`, { body: { status } })
      tasks.reload()
    } catch (failure) {
      setMessage({ severity: 'error', text: failure.message })
    }
  }

  async function take(task) {
    setMessage(null)
    // Disables this card's button until the answer arrives: a second click would
    // otherwise send a second claim, which the server refuses as "already taken".
    setTakingId(task.taskId)
    try {
      await request('POST', `/tasks/${task.taskId}/claim`)
      setMessage({ severity: 'success', text: `You took ${task.title}.` })
    } catch (failure) {
      // The server's sentence is the explanation (at the limit, already taken, ...).
      setMessage({ severity: 'error', text: failure.message })
    }
    // Take this comes back only once both reloaded lists have arrived, so a card that is
    // about to move cannot be taken a second time in the gap.
    await Promise.all([tasks.reload(), ready.reload()])
    setTakingId(null)
  }

  const items = tasks.data?.items ?? []
  const readyItems = ready.data?.items ?? []
  const columns = [
    { key: 'workDate', label: 'Date', render: (e) => formatDate(e.workDate) },
    { key: 'taskTitle', label: 'Task' },
    { key: 'projectName', label: 'Project' },
    { key: 'minutes', label: 'Time', render: (e) => <>{formatHours(e.minutes)} {e.overCapacity && <OverCapacityMark />}</> },
    { key: 'status', label: 'Approval', render: (e) => <StatusChip status={e.status} /> },
    { key: 'note', label: 'Note' },
    { key: 'actions', label: '', align: 'right', render: (e) => <Button size="small" onClick={() => setEditing(e)}>Edit</Button> },
  ]

  return (
    <>
      <PageHeader title="My tasks" subtitle="Move your tasks along as you work, and log the time you spend on them." />
      {message && <Alert severity={message.severity} sx={{ mb: 2 }} onClose={() => setMessage(null)}>{message.text}</Alert>}

      <PageState loading={tasks.loading && !tasks.data} error={tasks.error} onRetry={tasks.reload} empty={tasks.data && items.length === 0 ? 'No open tasks. Nice work.' : null}>
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' } }}>
          {items.map((task) => <TaskCard key={task.taskId} task={task} onMove={move} onLog={setLogging} />)}
        </Box>
      </PageState>

      <Typography variant="h2" sx={{ mt: 4, mb: 1 }}>Ready to take</Typography>
      <PageState loading={ready.loading && !ready.data} error={ready.error} onRetry={ready.reload}>
        {ready.data && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {`You hold ${ready.data.held} of ${ready.data.limit}`}
          </Typography>
        )}
        {ready.data && readyItems.length === 0 && (
          <Typography variant="body2">No Ready tasks on your projects right now.</Typography>
        )}
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' } }}>
          {readyItems.map((task) => <ReadyCard key={task.taskId} task={task} onTake={take} taking={takingId === task.taskId} />)}
        </Box>
      </PageState>

      <Typography variant="h2" sx={{ mt: 4, mb: 1 }}>My logged time</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Your line manager approves it. Editing an entry sends it back for approval.
      </Typography>
      <PageState loading={entries.loading} error={entries.error} onRetry={entries.reload}>
        <DataTable columns={columns} rows={entries.data?.items ?? []} rowKey="entryId" label="My logged time" empty="You haven't logged any time yet." />
        <Pager page={entriesPage} totalPages={entries.data?.totalPages} onChange={setEntriesPage} />
      </PageState>

      {logging && (
        <FormDialog
          open
          title={`Log time on ${logging.title}`}
          submitLabel="Log"
          fields={TIME_FIELDS}
          defaults={{ workDate: todayIso() }}
          onSubmit={(body) => logTime(logging, body)}
          onClose={() => setLogging(null)}
        />
      )}
      {editing && (
        <FormDialog
          open
          title="Edit logged time"
          fields={TIME_FIELDS}
          initial={editing}
          onSubmit={(body) => editTime(editing, body)}
          onClose={() => setEditing(null)}
        />
      )}
      {overCapacity && (
        <ConfirmDialog
          open
          title="Over your weekly capacity"
          message={overCapacity.message}
          confirmLabel="Log anyway"
          onConfirm={overCapacity.send}
          onClose={() => setOverCapacity(null)}
        />
      )}
    </>
  )
}
