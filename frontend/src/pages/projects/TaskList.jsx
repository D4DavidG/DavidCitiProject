import { useCallback, useState } from 'react'
import PropTypes from 'prop-types'
import { Box, Button } from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import DataTable from '../../components/DataTable'
import FormDialog from '../../components/FormDialog'
import PageState from '../../components/PageState'
import StatusChip from '../../components/StatusChip'
import { formatHours } from '../../services/format'
import { request } from '../../services/request'
import { useApi } from '../../services/useApi'

/**
 * A deliverable's tasks. The project's manager creates, estimates and assigns them
 * (to someone booked on the project); only the assignee moves their status, from My tasks.
 */
export default function TaskList({ milestoneId, canManage, people, onChanged }) {
  const load = useCallback(() => request('GET', `/milestones/${milestoneId}/tasks`), [milestoneId])
  const { data, error, loading, reload } = useApi(load)
  const [dialog, setDialog] = useState(null) // null | { task?: object }

  const fields = [
    { name: 'title', label: 'Title', required: true },
    { name: 'description', label: 'Description', type: 'textarea' },
    { name: 'estimateMinutes', label: 'Estimate (hours)', type: 'hours', required: true },
    { name: 'assigneeUserId', label: 'Assignee', type: 'select', numeric: true, options: people, helper: 'Only people booked on this project can be assigned.' },
  ]
  const names = Object.fromEntries(people)

  const columns = [
    { key: 'title', label: 'Task' },
    { key: 'assignee', label: 'Assignee', render: (t) => names[t.assigneeUserId] ?? 'Unassigned' },
    { key: 'estimate', label: 'Estimate', render: (t) => formatHours(t.estimateMinutes) },
    { key: 'status', label: 'Status', render: (t) => <StatusChip status={t.status} /> },
    ...(canManage ? [{ key: 'actions', label: '', align: 'right', render: (t) => <Button size="small" onClick={() => setDialog({ task: t })}>Edit</Button> }] : []),
  ]

  async function save(body) {
    const task = dialog.task
    await request(task ? 'PATCH' : 'POST', task ? `/tasks/${task.taskId}` : `/milestones/${milestoneId}/tasks`, { body })
    reload()
    onChanged()
  }

  return (
    <Box sx={{ display: 'grid', gap: 1.5, mt: 1 }}>
      <PageState loading={loading} error={error} onRetry={reload}>
        <DataTable columns={columns} rows={data?.items ?? []} rowKey="taskId" label="Tasks" empty="No tasks yet." />
      </PageState>
      {canManage && (
        <Box><Button size="small" startIcon={<AddIcon />} onClick={() => setDialog({})}>Add task</Button></Box>
      )}
      {dialog && (
        <FormDialog
          open
          title={dialog.task ? `Edit ${dialog.task.title}` : 'New task'}
          submitLabel={dialog.task ? 'Save' : 'Create'}
          fields={fields}
          initial={dialog.task ?? null}
          onSubmit={save}
          onClose={() => setDialog(null)}
        />
      )}
    </Box>
  )
}

TaskList.propTypes = {
  milestoneId: PropTypes.number.isRequired,
  canManage: PropTypes.bool.isRequired,
  /** [userId, name] for everyone booked on the project. */
  people: PropTypes.arrayOf(PropTypes.array).isRequired,
  /** Called after a task changes, so the deliverable's progress refreshes. */
  onChanged: PropTypes.func.isRequired,
}
