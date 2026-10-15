import { Fragment, useCallback, useState } from 'react'
import {
  Box, Button, Chip, Collapse, MenuItem, Paper, Table, TableBody, TableCell, TableContainer, TableHead,
  TableRow, TextField, Typography,
} from '@mui/material'
import AuditChanges from '../../components/AuditChanges'
import { ENTITY_LABELS, actionLabel } from '../../components/auditText'
import PageHeader from '../../components/PageHeader'
import PageState, { Pager } from '../../components/PageState'
import SearchField from '../../components/SearchField'
import { ROLE_LABELS } from '../../components/navigation'
import { formatDateTime } from '../../services/format'
import { usePeopleOptions } from '../../services/people'
import { request } from '../../services/request'
import { useApi } from '../../services/useApi'

const EMPTY_FILTERS = { actorId: '', entityType: '', entityId: '', dateFrom: '', dateTo: '' }

/**
 * Admin only: every change anyone made, newest first. Each entry is one record
 * changed, with a snapshot before and after. Snapshots can hold salaries (never
 * password hashes), which is why this page is admin only. The log is append-only:
 * the database refuses to edit or delete it.
 */
export default function AuditLogPage() {
  const [draft, setDraft] = useState(EMPTY_FILTERS)
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const [q, setQ] = useState('')
  const [pageNumber, setPageNumber] = useState(1)
  const [open, setOpen] = useState(null)
  const { options: people } = usePeopleOptions(undefined)
  const names = Object.fromEntries(people)

  const load = useCallback(() => request('GET', '/admin/audit-log', { query: { ...filters, q, page: pageNumber, pageSize: 25 } }), [filters, q, pageNumber])
  const { data, error, loading, reload } = useApi(load)
  const set = (name) => (e) => setDraft({ ...draft, [name]: e.target.value })

  return (
    <>
      <PageHeader title="Audit log" subtitle="Every change, who made it and when. Nothing here can be edited or deleted." />

      <Box sx={{ mb: 2 }}>
        <SearchField label="Search the audit log" placeholder="Person, record type, action or summary" onSearch={(text) => { setQ(text); setPageNumber(1) }} />
      </Box>
      <Box
        component="form"
        onSubmit={(e) => { e.preventDefault(); setFilters(draft); setPageNumber(1) }}
        sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'repeat(5, 1fr) auto' }, mb: 3, alignItems: 'start' }}
      >
        <TextField id="audit-person" select size="small" label="Person" value={draft.actorId} onChange={set('actorId')}>
          <MenuItem value="">Anyone</MenuItem>
          {people.map(([id, name]) => <MenuItem key={id} value={String(id)}>{name}</MenuItem>)}
        </TextField>
        <TextField id="audit-type" select size="small" label="Record type" value={draft.entityType} onChange={set('entityType')}>
          <MenuItem value="">Any</MenuItem>
          {Object.entries(ENTITY_LABELS).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}
        </TextField>
        <TextField id="audit-id" size="small" type="number" label="Record id" value={draft.entityId} onChange={set('entityId')} />
        <TextField id="audit-from" size="small" type="date" label="From" value={draft.dateFrom} onChange={set('dateFrom')} slotProps={{ inputLabel: { shrink: true } }} />
        <TextField id="audit-to" size="small" type="date" label="To" value={draft.dateTo} onChange={set('dateTo')} slotProps={{ inputLabel: { shrink: true } }} />
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button type="submit" variant="contained">Apply</Button>
          <Button variant="contained" onClick={() => { setDraft(EMPTY_FILTERS); setFilters(EMPTY_FILTERS); setPageNumber(1) }}>Clear</Button>
        </Box>
      </Box>

      <PageState loading={loading && !data} error={error} onRetry={reload} empty={data && data.items.length === 0 ? 'No changes match.' : null}>
        <TableContainer component={Paper} variant="outlined" sx={{ overflowX: 'auto' }}>
          <Table size="small" aria-label="Audit log">
            <TableHead>
              <TableRow>
                <TableCell>When</TableCell>
                <TableCell>Who</TableCell>
                <TableCell>Action</TableCell>
                <TableCell>Record</TableCell>
                <TableCell>Summary</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {(data?.items ?? []).map((entry) => (
                <Fragment key={entry.auditId}>
                  <TableRow hover>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDateTime(entry.createdAt)}</TableCell>
                    <TableCell>
                      <Typography variant="body2">{entry.actorUserId ? names[entry.actorUserId] ?? `User #${entry.actorUserId}` : 'System'}</Typography>
                      {entry.actorRole && <Typography variant="caption" color="text.secondary">{ROLE_LABELS[entry.actorRole]}</Typography>}
                    </TableCell>
                    <TableCell><Chip size="small" variant="outlined" label={actionLabel(entry.action)} /></TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{ENTITY_LABELS[entry.entityType] ?? entry.entityType} #{entry.entityId}</TableCell>
                    <TableCell>{entry.summary}</TableCell>
                    <TableCell align="right">
                      <Button size="small" variant="contained" onClick={() => setOpen(open === entry.auditId ? null : entry.auditId)}>
                        {open === entry.auditId ? 'Hide changes' : 'Show changes'}
                      </Button>
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell colSpan={6} sx={{ py: 0, borderBottom: open === entry.auditId ? undefined : 'none' }}>
                      <Collapse in={open === entry.auditId} unmountOnExit>
                        <AuditChanges entry={entry} />
                      </Collapse>
                    </TableCell>
                  </TableRow>
                </Fragment>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        <Pager page={pageNumber} totalPages={data?.totalPages} onChange={setPageNumber} />
      </PageState>
    </>
  )
}
