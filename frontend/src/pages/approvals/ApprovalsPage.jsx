import { useCallback, useState } from 'react'
import PropTypes from 'prop-types'
import { Box, Button, FormHelperText, Typography } from '@mui/material'
import DataTable from '../../components/DataTable'
import OverCapacityMark from '../../components/OverCapacityMark'
import OverEstimateMark from '../../components/OverEstimateMark'
import PageHeader from '../../components/PageHeader'
import PageState, { Pager } from '../../components/PageState'
import SearchField from '../../components/SearchField'
import { formatDate, formatHours } from '../../services/format'
import { request } from '../../services/request'
import { useApi } from '../../services/useApi'
import { useLastPage } from '../../services/useLastPage'

/**
 * How long an entry is, and the marks the approver should see: past the person's weekly
 * capacity, and past the task's estimate (with the task's hours against its estimate).
 */
function TimeCell({ entry }) {
  const hours = Number.isInteger(entry.taskLoggedMinutes) && Number.isInteger(entry.taskEstimateMinutes)
  return (
    <Box>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 0.5 }}>
        <span>{formatHours(entry.minutes)}</span>
        {entry.overCapacity && <OverCapacityMark />}
        {entry.overEstimate && <OverEstimateMark />}
      </Box>
      {entry.overEstimate && hours && (
        <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>
          {`Task: ${formatHours(entry.taskLoggedMinutes)} logged of ${formatHours(entry.taskEstimateMinutes)} estimated`}
        </Typography>
      )}
    </Box>
  )
}

TimeCell.propTypes = {
  entry: PropTypes.shape({
    minutes: PropTypes.number.isRequired,
    overCapacity: PropTypes.bool,
    overEstimate: PropTypes.bool,
    taskLoggedMinutes: PropTypes.number,
    taskEstimateMinutes: PropTypes.number,
  }).isRequired,
}

/**
 * Logged time waiting for a decision: a manager sees their direct reports' time, an
 * admin sees everyone's. Only approved time counts as money spent; nobody approves
 * their own (the server enforces both). Reject is one press on the row: the server takes
 * no note, and the person can edit the entry and send it again.
 */
export default function ApprovalsPage() {
  const [q, setQ] = useState('')
  const [pageNumber, setPageNumber] = useState(1)
  const load = useCallback(() => request('GET', '/approvals/time-entries', { query: { q, page: pageNumber, pageSize: 20 } }), [q, pageNumber])
  const { data, error, loading, reload } = useApi(load)
  useLastPage(data, pageNumber, setPageNumber)
  const [refusal, setRefusal] = useState(null) // { entryId, text }: shown in that entry's row
  const [busy, setBusy] = useState(null)

  async function decide(entry, action) {
    setBusy(entry.entryId)
    setRefusal(null)
    try {
      await request('POST', `/time-entries/${entry.entryId}/${action}`) // the Saved pop-up confirms it
      reload()
    } catch (failure) {
      setRefusal({ entryId: entry.entryId, text: failure.message })
    } finally {
      setBusy(null)
    }
  }

  const describe = (e) => `${formatHours(e.minutes)} by ${e.personName}`
  const columns = [
    { key: 'personName', label: 'Person' },
    { key: 'taskTitle', label: 'Task' },
    { key: 'projectName', label: 'Project' },
    { key: 'workDate', label: 'Date', render: (e) => formatDate(e.workDate) },
    { key: 'minutes', label: 'Time', render: (e) => <TimeCell entry={e} /> },
    { key: 'note', label: 'Note' },
    {
      key: 'actions',
      label: '',
      align: 'right',
      render: (e) => (
        <Box sx={{ display: 'grid', gap: 0.5, justifyItems: 'end' }}>
          <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
            <Button size="small" variant="contained" disabled={busy === e.entryId} aria-label={`Approve ${describe(e)}`} onClick={() => decide(e, 'approve')}>Approve</Button>
            <Button size="small" variant="contained" color="error" disabled={busy === e.entryId} aria-label={`Reject ${describe(e)}`} onClick={() => decide(e, 'reject')}>Reject</Button>
          </Box>
          {refusal?.entryId === e.entryId && <FormHelperText error role="alert">{refusal.text}</FormHelperText>}
        </Box>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title="Approvals"
        subtitle="Time your team logged, waiting for your decision. Only approved time counts against a project's budget."
      />
      <Box sx={{ mb: 3 }}>
        <SearchField label="Search approvals" placeholder="Person, task or project" onSearch={(text) => { setQ(text); setPageNumber(1) }} />
      </Box>
      <PageState loading={loading && !data} error={error} onRetry={reload}>
        <DataTable columns={columns} rows={data?.items ?? []} rowKey="entryId" label="Time waiting for approval"
          empty={q ? 'No time waiting for approval matches your search.' : 'Nothing waiting for approval.'} />
        <Pager page={pageNumber} totalPages={data?.totalPages} onChange={setPageNumber} />
      </PageState>
    </>
  )
}
