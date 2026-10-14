import { useCallback, useState } from 'react'
import { Alert, Box, Button, Pagination } from '@mui/material'
import DataTable from '../../components/DataTable'
import OverCapacityMark from '../../components/OverCapacityMark'
import PageHeader from '../../components/PageHeader'
import PageState from '../../components/PageState'
import { formatDate, formatHours } from '../../services/format'
import { request } from '../../services/request'
import { useApi } from '../../services/useApi'

/**
 * Logged time waiting for a decision: a manager sees their direct reports' time, an
 * admin sees everyone's. Only approved time counts as money spent; nobody approves
 * their own (the server enforces both).
 */
export default function ApprovalsPage() {
  const [pageNumber, setPageNumber] = useState(1)
  const load = useCallback(() => request('GET', '/approvals/time-entries', { query: { page: pageNumber, pageSize: 20 } }), [pageNumber])
  const { data, error, loading, reload } = useApi(load)
  const [message, setMessage] = useState(null)
  const [busy, setBusy] = useState(null)

  async function decide(entry, action) {
    setBusy(entry.entryId)
    setMessage(null)
    try {
      await request('POST', `/time-entries/${entry.entryId}/${action}`)
      const verb = action === 'approve' ? 'Approved' : 'Rejected'
      setMessage({ severity: 'success', text: `${verb} ${formatHours(entry.minutes)} by ${entry.personName}.` })
      reload()
    } catch (failure) {
      setMessage({ severity: 'error', text: failure.message })
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
    { key: 'minutes', label: 'Time', render: (e) => <>{formatHours(e.minutes)} {e.overCapacity && <OverCapacityMark />}</> },
    { key: 'note', label: 'Note' },
    {
      key: 'actions',
      label: '',
      align: 'right',
      render: (e) => (
        <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
          <Button size="small" variant="contained" color="success" disabled={busy === e.entryId} aria-label={`Approve ${describe(e)}`} onClick={() => decide(e, 'approve')}>Approve</Button>
          <Button size="small" color="error" disabled={busy === e.entryId} aria-label={`Reject ${describe(e)}`} onClick={() => decide(e, 'reject')}>Reject</Button>
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
      {message && <Alert severity={message.severity} sx={{ mb: 2 }} onClose={() => setMessage(null)}>{message.text}</Alert>}
      <PageState loading={loading && !data} error={error} onRetry={reload}>
        <DataTable columns={columns} rows={data?.items ?? []} rowKey="entryId" label="Time waiting for approval" empty="Nothing waiting for approval." />
        {data?.totalPages > 1 && (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
            <Pagination count={data.totalPages} page={pageNumber} onChange={(_, value) => setPageNumber(value)} />
          </Box>
        )}
      </PageState>
    </>
  )
}
