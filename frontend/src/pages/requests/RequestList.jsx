import { useCallback, useEffect, useRef } from 'react'
import PropTypes from 'prop-types'
import { Link as RouterLink } from 'react-router'
import { Box, Button, Link, MenuItem, TextField } from '@mui/material'
import DataTable from '../../components/DataTable'
import PageState, { Pager } from '../../components/PageState'
import SearchField from '../../components/SearchField'
import StatusChip from '../../components/StatusChip'
import { request } from '../../services/request'
import { useApi } from '../../services/useApi'
import { useLastPage } from '../../services/useLastPage'
import { KIND_LABELS } from './constants'

/**
 * One list of requests with its own search, filters and pages: what you sent
 * (scope "sent") or what is waiting for your decision ("decide", where Approve and
 * Reject show). The page keeps `view` so each tab remembers its own search and page;
 * `version` goes up after a change so the list loads again.
 */
export default function RequestList({ scope, kinds, view, version, notice = null, onView, onDecide }) {
  const { q, status, kind, page: pageNumber } = view
  const load = useCallback(() => request('GET', '/project-requests', {
    query: { scope, q, status, kind, page: pageNumber, pageSize: 20 },
  }), [scope, q, status, kind, pageNumber])
  const { data, error, loading, reload } = useApi(load)
  useLastPage(data, pageNumber, (next) => onView({ page: next }))

  // A new version means a request was sent or decided: load again (not on the first render).
  const seenVersion = useRef(version)
  useEffect(() => {
    if (version === seenVersion.current) return
    seenVersion.current = version
    reload()
  }, [version, reload])

  const columns = [
    { key: 'name', label: 'Request' },
    { key: 'kind', label: 'Kind', render: (r) => KIND_LABELS[r.kind] },
    { key: 'requesterName', label: 'Asked by' },
    { key: 'justification', label: 'Why' },
    { key: 'status', label: 'Status', render: (r) => <StatusChip status={r.status} /> },
    { key: 'decisionNote', label: 'Decision note' },
    {
      key: 'actions',
      label: '',
      align: 'right',
      render: (r) => (
        <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
          {r.createdProjectId && <Link component={RouterLink} to={`/projects/${r.createdProjectId}`} underline="hover">Open project</Link>}
          {scope === 'decide' && r.status === 'PENDING' && (
            <>
              <Button size="small" variant="contained" aria-label={`Approve ${r.name}`} onClick={() => onDecide('approve', r)}>Approve</Button>
              <Button size="small" variant="outlined" color="error" aria-label={`Reject ${r.name}`} onClick={() => onDecide('reject', r)}>Reject</Button>
            </>
          )}
        </Box>
      ),
    },
  ]

  const pick = (name) => (e) => onView({ [name]: e.target.value, page: 1 })
  return (
    <>
      <Box sx={{ mb: 2 }}>
        {/* The page remounts this list per tab, so the box starts with that tab's own search. */}
        <SearchField label="Search requests" placeholder="Request or person" value={q} onSearch={(text) => onView({ q: text, page: 1 })} />
      </Box>
      <Box sx={{ mb: 3, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        <TextField id="requests-status" select size="small" label="Status" value={status} onChange={pick('status')} sx={{ minWidth: 180 }}>
          <MenuItem value="">All statuses</MenuItem>
          <MenuItem value="PENDING">Pending</MenuItem>
          <MenuItem value="APPROVED">Approved</MenuItem>
          <MenuItem value="REJECTED">Rejected</MenuItem>
        </TextField>
        <TextField id="requests-kind" select size="small" label="Kind" value={kind} onChange={pick('kind')} sx={{ minWidth: 200 }}>
          <MenuItem value="">All kinds</MenuItem>
          {kinds.map((k) => <MenuItem key={k} value={k}>{KIND_LABELS[k]}</MenuItem>)}
        </TextField>
      </Box>

      {notice}
      <PageState loading={loading && !data} error={error} onRetry={reload}>
        <DataTable columns={columns} rows={data?.items ?? []} rowKey="requestId" label="Requests"
          empty={q || status || kind ? 'No requests match.' : 'No requests.'} />
        <Pager page={pageNumber} totalPages={data?.totalPages} onChange={(next) => onView({ page: next })} />
      </PageState>
    </>
  )
}

RequestList.propTypes = {
  /** Which list: "sent" or "decide" (the server's scope). */
  scope: PropTypes.oneOf(['sent', 'decide']).isRequired,
  /** The kinds the Kind filter offers. */
  kinds: PropTypes.arrayOf(PropTypes.string).isRequired,
  /** This list's search, filters and page. */
  view: PropTypes.shape({
    q: PropTypes.string.isRequired,
    status: PropTypes.string.isRequired,
    kind: PropTypes.string.isRequired,
    page: PropTypes.number.isRequired,
  }).isRequired,
  /** Changes after every send or decision, to load the list again. */
  version: PropTypes.number.isRequired,
  /** A message (an Alert) shown below the search and filters, just above the list. */
  notice: PropTypes.node,
  /** Called with the fields to change in `view`. */
  onView: PropTypes.func.isRequired,
  /** Called with 'approve' or 'reject' and the request, from the Approve and Reject buttons. */
  onDecide: PropTypes.func.isRequired,
}
