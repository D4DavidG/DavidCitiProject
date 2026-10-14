import PropTypes from 'prop-types'
import {
  Box, Card, CardContent, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography,
} from '@mui/material'
import { useIsMobile } from '../theme/responsive'

/** A cell's content; an empty value shows a dash, so a card row never looks like it failed to load. */
function cell(column, row) {
  const value = column.render ? column.render(row) : row[column.key]
  return value === null || value === undefined || value === '' ? '—' : value
}

/**
 * A list of records: a table on desktop, one card per record on phones, where each
 * value is labelled with its column name. Columns: { key, label, render?(row), align? }.
 */
export default function DataTable({ columns, rows, rowKey, label, empty = 'Nothing to show.' }) {
  const isMobile = useIsMobile()

  if (rows.length === 0) {
    return <Typography color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>{empty}</Typography>
  }

  if (isMobile) {
    return (
      <Box component="ul" aria-label={label} sx={{ listStyle: 'none', p: 0, m: 0, display: 'grid', gap: 1.5 }}>
        {rows.map((row) => (
          <Card component="li" key={row[rowKey]}>
            <CardContent sx={{ display: 'grid', gap: 0.75 }}>
              {columns.map((column) => (
                <Box key={column.key} sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, alignItems: 'center' }}>
                  {column.label && <Typography variant="caption" color="text.secondary">{column.label}</Typography>}
                  <Box sx={{ textAlign: 'right' }}>{cell(column, row)}</Box>
                </Box>
              ))}
            </CardContent>
          </Card>
        ))}
      </Box>
    )
  }

  return (
    <TableContainer component={Paper} variant="outlined">
      <Table size="small" aria-label={label}>
        <TableHead>
          <TableRow>
            {columns.map((column) => <TableCell key={column.key} align={column.align}>{column.label}</TableCell>)}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row[rowKey]} hover>
              {columns.map((column) => <TableCell key={column.key} align={column.align}>{cell(column, row)}</TableCell>)}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  )
}

DataTable.propTypes = {
  columns: PropTypes.arrayOf(PropTypes.shape({
    key: PropTypes.string.isRequired,
    label: PropTypes.string,
    render: PropTypes.func,
    align: PropTypes.oneOf(['left', 'right', 'center']),
  })).isRequired,
  rows: PropTypes.arrayOf(PropTypes.object).isRequired,
  /** The field that identifies a row, e.g. "projectId". */
  rowKey: PropTypes.string.isRequired,
  /** Accessible name of the table or list. */
  label: PropTypes.string.isRequired,
  empty: PropTypes.node,
}
