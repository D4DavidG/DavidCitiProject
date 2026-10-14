import { useCallback, useState } from 'react'
import PropTypes from 'prop-types'
import { Alert, Box, Button, Card, CardActions, CardContent, MenuItem, Pagination, TextField, Typography } from '@mui/material'
import DataTable from '../../components/DataTable'
import FormDialog from '../../components/FormDialog'
import PageHeader from '../../components/PageHeader'
import PageState from '../../components/PageState'
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
 * The employee's home: their open tasks (tick work off by moving status) and the
 * time they've logged. Logging past their weekly capacity is refused unless their
 * manager allowed overtime; the server's message says exactly why.
 */
export default function MyTasksPage() {
  const loadTasks = useCallback(() => request('GET', '/me/tasks'), [])
  const tasks = useApi(loadTasks)
  const [entriesPage, setEntriesPage] = useState(1)
  const loadEntries = useCallback(() => request('GET', '/me/time-entries', { query: { page: entriesPage, pageSize: 10 } }), [entriesPage])
  const entries = useApi(loadEntries)
  const [logging, setLogging] = useState(null)
  const [editing, setEditing] = useState(null)
  const [message, setMessage] = useState(null)

  async function move(task, status) {
    setMessage(null)
    try {
      await request('POST', `/tasks/${task.taskId}/status`, { body: { status } })
      tasks.reload()
    } catch (failure) {
      setMessage({ severity: 'error', text: failure.message })
    }
  }

  const items = tasks.data?.items ?? []
  const columns = [
    { key: 'workDate', label: 'Date', render: (e) => formatDate(e.workDate) },
    { key: 'taskTitle', label: 'Task' },
    { key: 'projectName', label: 'Project' },
    { key: 'minutes', label: 'Time', render: (e) => formatHours(e.minutes) },
    { key: 'status', label: 'Approval', render: (e) => <StatusChip status={e.status} /> },
    { key: 'note', label: 'Note' },
    { key: 'actions', label: '', align: 'right', render: (e) => <Button size="small" onClick={() => setEditing(e)}>Edit</Button> },
  ]

  return (
    <>
      <PageHeader title="My tasks" subtitle="Move your tasks along as you work, and log the time you spend on them." />
      {message && <Alert severity={message.severity} sx={{ mb: 2 }} onClose={() => setMessage(null)}>{message.text}</Alert>}

      <PageState loading={tasks.loading} error={tasks.error} onRetry={tasks.reload} empty={tasks.data && items.length === 0 ? 'No open tasks. Nice work.' : null}>
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' } }}>
          {items.map((task) => <TaskCard key={task.taskId} task={task} onMove={move} onLog={setLogging} />)}
        </Box>
      </PageState>

      <Typography variant="h2" sx={{ mt: 4, mb: 1 }}>My logged time</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Your line manager approves it. Editing an entry sends it back for approval.
      </Typography>
      <PageState loading={entries.loading} error={entries.error} onRetry={entries.reload}>
        <DataTable columns={columns} rows={entries.data?.items ?? []} rowKey="entryId" label="My logged time" empty="You haven't logged any time yet." />
        {entries.data?.totalPages > 1 && (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
            <Pagination count={entries.data.totalPages} page={entriesPage} onChange={(_, value) => setEntriesPage(value)} />
          </Box>
        )}
      </PageState>

      {logging && (
        <FormDialog
          open
          title={`Log time on ${logging.title}`}
          submitLabel="Log"
          fields={TIME_FIELDS}
          defaults={{ workDate: todayIso() }}
          onSubmit={async (body) => {
            const entry = await request('POST', `/tasks/${logging.taskId}/time-entries`, { body })
            setMessage({ severity: 'success', text: `Logged ${formatHours(entry.minutes)} on ${logging.title}. It's waiting for approval.` })
            entries.reload()
          }}
          onClose={() => setLogging(null)}
        />
      )}
      {editing && (
        <FormDialog
          open
          title="Edit logged time"
          fields={TIME_FIELDS}
          initial={editing}
          onSubmit={async (body) => { await request('PATCH', `/time-entries/${editing.entryId}`, { body }); entries.reload() }}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  )
}
