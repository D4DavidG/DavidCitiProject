import { useCallback, useState } from 'react'
import PropTypes from 'prop-types'
import {
  Accordion, AccordionDetails, AccordionSummary, Alert, Box, Button, Card, CardActions, CardContent, MenuItem, TextField, Typography,
} from '@mui/material'
import ExpandIcon from '@mui/icons-material/ExpandMoreOutlined'
import ConfirmDialog from '../../components/ConfirmDialog'
import DataTable from '../../components/DataTable'
import FormDialog from '../../components/FormDialog'
import OverCapacityMark from '../../components/OverCapacityMark'
import PageHeader from '../../components/PageHeader'
import PageState, { Pager } from '../../components/PageState'
import ProjectTimelines from '../../components/ProjectTimelines'
import SearchField from '../../components/SearchField'
import StatusChip from '../../components/StatusChip'
import { formatDate, formatHours, todayIso } from '../../services/format'
import { useIsMobile } from '../../theme/responsive'
import { request } from '../../services/request'
import { useApi } from '../../services/useApi'

/** What both task searches match on the server: GET /me/tasks and /me/ready-tasks take q. */
const TASK_SEARCH_HINT = 'Task, deliverable or project'
const TASK_STATUSES = [['TODO', 'To do'], ['IN_PROGRESS', 'In progress'], ['DONE', 'Done']]
const TIME_FIELDS = [
  { name: 'workDate', label: 'Date', type: 'date', required: true, helper: 'Not in the future. You must have been booked on the project that day.' },
  { name: 'minutes', label: 'Time', type: 'duration', max: 1440, required: true, helper: 'Hours and minutes, e.g. 2 h 30 min.' },
  { name: 'note', label: 'Note', type: 'textarea' },
]

/**
 * A line right under what you pressed: a refusal, or news (time waiting for approval). A plain
 * "done" needs none: the one Saved pop-up says it. News is polite (status); a refusal is an alert.
 */
function Notice({ notice, onClose }) {
  if (!notice) return null
  return (
    <Alert severity={notice.severity} role={notice.severity === 'error' ? 'alert' : 'status'} onClose={onClose} sx={{ mx: 2, mb: 2 }}>
      {notice.text}
    </Alert>
  )
}

Notice.propTypes = {
  notice: PropTypes.shape({ severity: PropTypes.oneOf(['success', 'error']).isRequired, text: PropTypes.string.isRequired }),
  onClose: PropTypes.func.isRequired,
}

function TaskCard({ task, busy = false, notice = null, onMove, onLog, onCloseNotice }) {
  const titleId = `task-${task.taskId}`
  return (
    <Card component="article" aria-labelledby={titleId}>
      <CardContent sx={{ display: 'grid', gap: 1 }}>
        <Typography id={titleId} variant="h3" component="h3">{task.title}</Typography>
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
          disabled={busy}
          sx={{ minWidth: 160 }}
        >
          {TASK_STATUSES.map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}
        </TextField>
        <Button variant="contained" onClick={() => onLog(task)} disabled={busy}>Log time</Button>
      </CardActions>
      <Notice notice={notice} onClose={onCloseNotice} />
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
  /** True while this task's status change is saving: the card's controls are disabled. */
  busy: PropTypes.bool,
  /** A line for this card: a refused move, or time logged and waiting for approval. */
  notice: PropTypes.object,
  onMove: PropTypes.func.isRequired,
  onLog: PropTypes.func.isRequired,
  onCloseNotice: PropTypes.func.isRequired,
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
 * The employee's Dashboard (route /my-tasks): their projects as a timeline, then their open tasks
 * (tick work off by moving status) beside the Ready tasks they may take (stacked on a phone), and
 * the time they've logged below both, folded away. Both task lists search on the server as you type. Logging past their weekly
 * capacity (without overtime allowed) asks "Log anyway?" with the server's message; Log anyway
 * resends with confirmOverCapacity and their manager is told. Other refusals show in the form.
 * Messages sit by what you pressed (spec 5c): a refused move on its card, a refused take in
 * Ready to take; a success only when it says something new.
 */
export default function MyTasksPage() {
  const isMobile = useIsMobile()
  const [taskSearch, setTaskSearch] = useState('')
  const loadTasks = useCallback(() => request('GET', '/me/tasks', { query: { q: taskSearch } }), [taskSearch])
  const tasks = useApi(loadTasks)
  const [readySearch, setReadySearch] = useState('')
  const loadReady = useCallback(() => request('GET', '/me/ready-tasks', { query: { q: readySearch } }), [readySearch])
  const ready = useApi(loadReady)
  const [entriesPage, setEntriesPage] = useState(1)
  const loadEntries = useCallback(() => request('GET', '/me/time-entries', { query: { page: entriesPage, pageSize: 10 } }), [entriesPage])
  const entries = useApi(loadEntries)
  const [logging, setLogging] = useState(null)
  const [editing, setEditing] = useState(null)
  // { where: 'task-<id>' or 'ready', severity, text }: one message at a time, by what was pressed.
  const [notice, setNotice] = useState(null)
  const [takingId, setTakingId] = useState(null)
  const [movingId, setMovingId] = useState(null)
  const [overCapacity, setOverCapacity] = useState(null)
  // Bumped after a task moves or is taken: the timeline loads again, as a deliverable's state
  // (computed from its tasks) or the projects you work on may have changed.
  const [timelineVersion, setTimelineVersion] = useState(0)

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
      setNotice({ where: `task-${task.taskId}`, severity: 'success', text: `Logged ${formatHours(entry.minutes)} on ${task.title}. It's waiting for approval.` })
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
    setNotice(null)
    setMovingId(task.taskId) // the card's status and Log time are disabled until the answer arrives
    try {
      await request('POST', `/tasks/${task.taskId}/status`, { body: { status } })
      tasks.reload()
      setTimelineVersion((v) => v + 1)
    } catch (failure) {
      setNotice({ where: `task-${task.taskId}`, severity: 'error', text: failure.message })
    } finally {
      setMovingId(null)
    }
  }

  async function take(task) {
    setNotice(null)
    // Disables this card's button until the answer arrives: a second click would
    // otherwise send a second claim, which the server refuses as "already taken".
    setTakingId(task.taskId)
    try {
      await request('POST', `/tasks/${task.taskId}/claim`) // the Saved pop-up confirms it
      setTimelineVersion((v) => v + 1)
    } catch (failure) {
      // The server's sentence is the explanation (at the limit, already taken, ...). It goes in the
      // section, not on the card: an "already taken" card leaves the list when it reloads.
      setNotice({ where: 'ready', severity: 'error', text: failure.message })
    }
    // Take this comes back only once both reloaded lists have arrived, so a card that is
    // about to move cannot be taken a second time in the gap.
    await Promise.all([tasks.reload(), ready.reload()])
    setTakingId(null)
  }

  const items = tasks.data?.items ?? []
  const readyItems = ready.data?.items ?? []
  const entryCount = entries.data?.total
  const loggedTitle = entryCount === undefined ? 'My logged time' : `My logged time (${entryCount} ${entryCount === 1 ? 'entry' : 'entries'})`
  const columns = [
    { key: 'workDate', label: 'Date', render: (e) => formatDate(e.workDate) },
    { key: 'taskTitle', label: 'Task' },
    { key: 'projectName', label: 'Project' },
    { key: 'minutes', label: 'Time', render: (e) => <>{formatHours(e.minutes)} {e.overCapacity && <OverCapacityMark />}</> },
    { key: 'status', label: 'Approval', render: (e) => <StatusChip status={e.status} /> },
    { key: 'note', label: 'Note' },
    { key: 'actions', label: '', align: 'right', render: (e) => <Button variant="contained" size="small" onClick={() => setEditing(e)}>Edit</Button> },
  ]

  return (
    <>
      <PageHeader title="Dashboard" subtitle="Your projects, your tasks and the time you've logged." />

      <ProjectTimelines title="My projects" headingVariant="h2" version={timelineVersion} />

      {/* Two equal columns on desktop, one above the other on a phone (spec 6.4). minmax(0, 1fr) lets a
          column shrink below its widest card, so the two always stay equal. */}
      <Box sx={{ display: 'grid', gap: 4, alignItems: 'start', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, minmax(0, 1fr))' }}>
        <Box component="section" aria-labelledby="my-tasks-heading">
          <Typography id="my-tasks-heading" variant="h2" sx={{ mb: 1 }}>My tasks</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Move your tasks along as you work, and log the time you spend on them.
          </Typography>
          <Box sx={{ mb: 2 }}>
            <SearchField id="my-tasks-search" label="Search my tasks" placeholder={TASK_SEARCH_HINT} onSearch={setTaskSearch} />
          </Box>
          <PageState
            loading={tasks.loading && !tasks.data}
            error={tasks.error}
            onRetry={tasks.reload}
            empty={tasks.data && items.length === 0 ? (taskSearch ? 'No tasks match your search.' : 'No open tasks. Nice work.') : null}
          >
            <Box sx={{ display: 'grid', gap: 2 }}>
              {items.map((task) => (
                <TaskCard
                  key={task.taskId}
                  task={task}
                  busy={movingId === task.taskId}
                  notice={notice?.where === `task-${task.taskId}` ? notice : null}
                  onMove={move}
                  onLog={setLogging}
                  onCloseNotice={() => setNotice(null)}
                />
              ))}
            </Box>
          </PageState>
        </Box>

        <Box component="section" aria-labelledby="ready-heading">
          <Typography id="ready-heading" variant="h2" sx={{ mb: 1 }}>Ready to take</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {ready.data ? `You hold ${ready.data.held} of ${ready.data.limit}` : 'Tasks on your projects that nobody holds yet.'}
          </Typography>
          <Box sx={{ mb: 2 }}>
            <SearchField id="ready-search" label="Search ready tasks" placeholder={TASK_SEARCH_HINT} onSearch={setReadySearch} />
          </Box>
          <PageState loading={ready.loading && !ready.data} error={ready.error} onRetry={ready.reload}>
            {notice?.where === 'ready' && (
              <Alert severity="error" onClose={() => setNotice(null)} sx={{ mb: 2 }}>{notice.text}</Alert>
            )}
            {ready.data && readyItems.length === 0 && (
              <Typography variant="body2">{readySearch ? 'No Ready tasks match your search.' : 'No Ready tasks on your projects right now.'}</Typography>
            )}
            <Box sx={{ display: 'grid', gap: 2 }}>
              {readyItems.map((task) => <ReadyCard key={task.taskId} task={task} onTake={take} taking={takingId === task.taskId} />)}
            </Box>
          </PageState>
        </Box>
      </Box>

      {/* Folded away by default: the count is in its title. The table mounts only when opened. MUI gives
          the region the id named in aria-controls, so AccordionDetails must not repeat it (duplicate id). */}
      <Accordion variant="outlined" disableGutters sx={{ mt: 4 }} slotProps={{ heading: { component: 'h2' }, transition: { unmountOnExit: true } }}>
        <AccordionSummary expandIcon={<ExpandIcon />} id="logged-time-summary" aria-controls="logged-time-details">
          <Typography variant="h2" component="span">{loggedTitle}</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Your line manager approves it. Editing an entry sends it back for approval.
          </Typography>
          <PageState loading={entries.loading} error={entries.error} onRetry={entries.reload}>
            <DataTable columns={columns} rows={entries.data?.items ?? []} rowKey="entryId" label="My logged time" empty="You haven't logged any time yet." />
            <Pager page={entriesPage} totalPages={entries.data?.totalPages} onChange={setEntriesPage} />
          </PageState>
        </AccordionDetails>
      </Accordion>

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
