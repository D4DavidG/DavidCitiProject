import PropTypes from 'prop-types'
import { Table, TableBody, TableCell, TableHead, TableRow } from '@mui/material'
import { changedFields, show } from './auditText'

/** The fields one audit entry changed: before in red, after in green. */
export default function AuditChanges({ entry }) {
  const fields = changedFields(entry.beforeState, entry.afterState)
  return (
    <Table size="small" aria-label={`Changes in entry ${entry.auditId}`} sx={{ my: 1 }}>
      <TableHead>
        <TableRow><TableCell>Field</TableCell><TableCell>Before</TableCell><TableCell>After</TableCell></TableRow>
      </TableHead>
      <TableBody>
        {fields.map((field) => (
          <TableRow key={field}>
            <TableCell sx={{ fontFamily: 'monospace' }}>{field}</TableCell>
            <TableCell sx={{ color: 'error.main', wordBreak: 'break-word' }}>{show(entry.beforeState?.[field])}</TableCell>
            <TableCell sx={{ color: 'success.main', wordBreak: 'break-word' }}>{show(entry.afterState?.[field])}</TableCell>
          </TableRow>
        ))}
        {fields.length === 0 && <TableRow><TableCell colSpan={3}>No field changed.</TableCell></TableRow>}
      </TableBody>
    </Table>
  )
}

AuditChanges.propTypes = {
  entry: PropTypes.shape({
    auditId: PropTypes.number.isRequired,
    beforeState: PropTypes.object,
    afterState: PropTypes.object,
  }).isRequired,
}
