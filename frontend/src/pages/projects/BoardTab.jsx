import { useCallback, useState } from 'react'
import PropTypes from 'prop-types'
import { Alert, Box, Button, Chip, FormHelperText, Paper, Typography } from '@mui/material'
import FormDialog from '../../components/FormDialog'
import PageState from '../../components/PageState'
import { useAuth } from '../../auth/useAuth'
import { formatHours } from '../../services/format'
import { request } from '../../services/request'
import { useApi } from '../../services/useApi'

const COLUMNS = ['Ready', 'To do', 'In progress', 'Done']

/** No assignee and not done: Ready. Otherwise the task's own status picks the column. */
function columnOf(task) {
  if (task.status === 'DONE') return 'Done'
  if (task.assigneeUserId === null || task.assigneeUserId === undefined) return 'Ready'
  return task.status === 'TODO' ? 'To do' : 'In progress'
}

/**
 * The project's pull board: four columns, a strip showing how many unfinished tasks
 * each person holds against their limit, and the buttons for the viewer's role.
 * Employees take a Ready task or put back their own; the project's manager assigns.
 * Every refusal is the server's own sentence; after any attempt the board reloads.
 */
export default function BoardTab({ projectId, canManage }) {
  const { user } = useAuth()
  const load = useCallback(() => request('GET', `/projects/${projectId}/board`), [projectId])
  const { data, error, loading, reload } = useApi(load)
  const [failure, setFailure] = useState(null) // { taskId, text }: shown on that task's card
  const [assigning, setAssigning] = useState(null)
  const [pendingId, setPendingId] = useState(null)

  /** Take or put back one task. Its buttons stay disabled until the board has reloaded. */
  async function act(taskId, verb) {
    setFailure(null)
    setPendingId(taskId)
    try {
      await request('POST', `/tasks/${taskId}/${verb}`)
    } catch (e) {
      setFailure({ taskId, text: e.message })
    }
    // The buttons come back only once the reloaded board has arrived, so a card that is
    // about to move cannot be taken a second time in the gap.
    await reload()
    setPendingId(null)
  }

  const tasks = data?.items ?? []
  const people = data?.people ?? []
  const isEmployee = user.role === 'EMPLOYEE'

  return (
    <PageState loading={loading && !data} error={error} onRetry={reload}>
      <Box sx={{ display: 'grid', gap: 2 }}>
        {/* A refusal sits on its card; only if the task has left the board does it show here. */}
        {failure && !tasks.some((t) => t.taskId === failure.taskId) && <Alert severity="error" onClose={() => setFailure(null)}>{failure.text}</Alert>}
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }} role="group" aria-label="Who holds what">
          {people.map((p) => {
            const over = p.held > p.limit
            return <Chip key={p.userId} variant="outlined" color={over ? 'error' : 'default'} label={`${p.name} ${p.held} / ${p.limit}${over ? ', over limit' : ''}`} />
          })}
        </Box>
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: 'repeat(4, 1fr)' }, alignItems: 'start' }}>
          {COLUMNS.map((column) => {
            const headingId = `board-${column.replace(' ', '-').toLowerCase()}`
            return (
              <Box component="section" key={column} aria-labelledby={headingId} sx={{ display: 'grid', gap: 1 }}>
                <Typography id={headingId} variant="subtitle1" component="h3">{column}</Typography>
                {tasks.filter((t) => columnOf(t) === column).map((t) => (
                  <Paper key={t.taskId} component="article" aria-label={t.title} variant="outlined" sx={{ p: 1.5, display: 'grid', gap: 0.5 }}>
                    <Typography variant="subtitle2">{t.title}</Typography>
                    <Typography variant="body2" color="text.secondary">{`${t.milestoneName} · ${formatHours(t.estimateMinutes)}`}</Typography>
                    <Typography variant="body2">{t.assigneeName ?? 'Unassigned'}</Typography>
                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                      {isEmployee && column === 'Ready' && (
                        <Button size="small" variant="contained" disabled={pendingId === t.taskId} onClick={() => act(t.taskId, 'claim')}>Take this</Button>
                      )}
                      {isEmployee && column !== 'Done' && t.assigneeUserId === user.userId && (
                        <Button size="small" variant="contained" disabled={pendingId === t.taskId} onClick={() => act(t.taskId, 'release')}>Put back</Button>
                      )}
                      {canManage && column !== 'Done' && (
                        <Button size="small" variant="contained" onClick={() => setAssigning(t)}>Assign</Button>
                      )}
                    </Box>
                    {failure?.taskId === t.taskId && <FormHelperText error role="alert" sx={{ m: 0 }}>{failure.text}</FormHelperText>}
                  </Paper>
                ))}
              </Box>
            )
          })}
        </Box>
      </Box>
      {assigning && (
        <FormDialog
          open
          title={`Assign ${assigning.title}`}
          submitLabel="Assign"
          fields={[{ name: 'assigneeUserId', label: 'Assignee', type: 'select', numeric: true, options: people.map((p) => [p.userId, p.name]) }]}
          initial={assigning}
          onSubmit={(body) => request('PATCH', `/tasks/${assigning.taskId}`, { body })}
          onClose={() => { setAssigning(null); reload() }}
        />
      )}
    </PageState>
  )
}

BoardTab.propTypes = {
  projectId: PropTypes.number.isRequired,
  /** True for the project's manager or an admin: shows Assign. */
  canManage: PropTypes.bool.isRequired,
}
