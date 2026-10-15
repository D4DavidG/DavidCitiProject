import { useCallback, useState } from 'react'
import PropTypes from 'prop-types'
import {
  Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, TextField,
} from '@mui/material'
import AuditChanges from './AuditChanges'
import DataTable from './DataTable'
import PageState, { Pager } from './PageState'
import { ENTITY_LABELS, actionLabel } from './auditText'
import { formatDateTime } from '../services/format'
import { request } from '../services/request'
import { useApi } from '../services/useApi'

const ACTIONS = ['CREATE', 'UPDATE', 'ARCHIVE', 'REACTIVATE', 'RESET_PASSWORD', 'MOVE', 'CLAIM', 'RELEASE',
  'APPROVE', 'REJECT', 'SIGN_OFF', 'REOPEN', 'ADD_DEPENDENCY', 'REMOVE_DEPENDENCY']
const EMPTY_FILTERS = { action: '', dateFrom: '', dateTo: '' }

/**
 * One person's history: the changes they made and the changes to their account,
 * newest first. The server decides who may read it, and sends the before/after
 * state to admins only, so the Show changes button appears only for them.
 */
export default function HistoryPanel({ userId }) {
  const [draft, setDraft] = useState(EMPTY_FILTERS)
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const [pageNumber, setPageNumber] = useState(1)
  const [open, setOpen] = useState(null)

  const load = useCallback(
    () => request('GET', `/users/${userId}/history`, { query: { ...filters, page: pageNumber, pageSize: 10 } }),
    [userId, filters, pageNumber],
  )
  const { data, error, loading, reload } = useApi(load)
  const set = (name) => (e) => setDraft({ ...draft, [name]: e.target.value })
  const items = data?.items ?? []

  const columns = [
    { key: 'createdAt', label: 'When', render: (r) => formatDateTime(r.createdAt) },
    { key: 'actorName', label: 'Who', render: (r) => r.actorName ?? 'System' },
    { key: 'action', label: 'Action', render: (r) => <Chip size="small" variant="outlined" label={actionLabel(r.action)} /> },
    { key: 'record', label: 'Record', render: (r) => `${ENTITY_LABELS[r.entityType] ?? r.entityType} #${r.entityId}` },
    { key: 'summary', label: 'Summary' },
  ]
  if (items.some((r) => 'beforeState' in r || 'afterState' in r)) {
    columns.push({ key: 'changes', label: '', align: 'right', render: (r) => <Button size="small" onClick={() => setOpen(r)}>Show changes</Button> })
  }

  return (
    <>
      <Box
        component="form"
        onSubmit={(e) => { e.preventDefault(); setFilters(draft); setPageNumber(1) }}
        sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr) auto' }, mb: 2, alignItems: 'start' }}
      >
        <TextField id={`history-action-${userId}`} select size="small" label="Action" value={draft.action} onChange={set('action')}>
          <MenuItem value="">Any</MenuItem>
          {ACTIONS.map((a) => <MenuItem key={a} value={a}>{actionLabel(a)}</MenuItem>)}
        </TextField>
        <TextField id={`history-from-${userId}`} size="small" type="date" label="From" value={draft.dateFrom} onChange={set('dateFrom')} slotProps={{ inputLabel: { shrink: true } }} />
        <TextField id={`history-to-${userId}`} size="small" type="date" label="To" value={draft.dateTo} onChange={set('dateTo')} slotProps={{ inputLabel: { shrink: true } }} />
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button type="submit" variant="contained">Apply</Button>
          <Button onClick={() => { setDraft(EMPTY_FILTERS); setFilters(EMPTY_FILTERS); setPageNumber(1) }}>Clear</Button>
        </Box>
      </Box>

      <PageState loading={loading && !data} error={error} onRetry={reload}>
        <DataTable columns={columns} rows={items} rowKey="auditId" label="History" empty="No history matches." />
        <Pager page={pageNumber} totalPages={data?.totalPages} onChange={setPageNumber} />
      </PageState>

      <Dialog open={open !== null} onClose={() => setOpen(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Changes</DialogTitle>
        <DialogContent>{open && <AuditChanges entry={open} />}</DialogContent>
        <DialogActions><Button onClick={() => setOpen(null)}>Close</Button></DialogActions>
      </Dialog>
    </>
  )
}

HistoryPanel.propTypes = {
  /** Whose history to show. */
  userId: PropTypes.number.isRequired,
}
