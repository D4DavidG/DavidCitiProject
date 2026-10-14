import { useState } from 'react'
import PropTypes from 'prop-types'
import { Link } from 'react-router'
import { Alert, Box, Button } from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import ConfirmDialog from '../../components/ConfirmDialog'
import DataTable from '../../components/DataTable'
import FormDialog from '../../components/FormDialog'
import { formatDate } from '../../services/format'
import { usePeopleOptions } from '../../services/people'
import { request } from '../../services/request'

const DATE_FIELDS = [
  { name: 'hoursPerWeek', label: 'Hours per week', type: 'number', required: true, helper: '1 to 40 hours a week on this project.' },
  { name: 'startDate', label: 'Start date', type: 'date', required: true },
  { name: 'endDate', label: 'End date', type: 'date', required: true },
]

function BookDialog({ projectId, onClose, onSaved }) {
  const { options } = usePeopleOptions('EMPLOYEE')
  return (
    <FormDialog
      open
      title="Book someone on this project"
      submitLabel="Book"
      fields={[{ name: 'userId', label: 'Person', type: 'select', numeric: true, options, required: true }, ...DATE_FIELDS]}
      onSubmit={async (body) => onSaved(await request('POST', `/projects/${projectId}/assignments`, { body }))}
      onClose={onClose}
    />
  )
}

BookDialog.propTypes = { projectId: PropTypes.number.isRequired, onClose: PropTypes.func.isRequired, onSaved: PropTypes.func.isRequired }

/**
 * The brief's "Resources": who is booked on this project, for how many hours a week,
 * between which dates. Over-booking someone across projects is allowed on purpose:
 * it's exactly what the Allocation grid exists to show (question 5).
 */
export default function ResourcesTab({ projectId, bookings, canManage, onChanged }) {
  const [booking, setBooking] = useState(false)
  const [editing, setEditing] = useState(null)
  const [archiving, setArchiving] = useState(null)

  const columns = [
    { key: 'personName', label: 'Person' },
    { key: 'hoursPerWeek', label: 'Hours', render: (b) => `${b.hoursPerWeek} h/week` },
    { key: 'startDate', label: 'From', render: (b) => formatDate(b.startDate) },
    { key: 'endDate', label: 'To', render: (b) => formatDate(b.endDate) },
    ...(canManage ? [{
      key: 'actions',
      label: '',
      align: 'right',
      render: (b) => (
        <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
          <Button size="small" onClick={() => setEditing(b)}>Edit</Button>
          <Button size="small" color="inherit" onClick={() => setArchiving(b)}>Archive</Button>
        </Box>
      ),
    }] : []),
  ]

  return (
    <Box sx={{ display: 'grid', gap: 2 }}>
      <Alert severity="info" action={<Button component={Link} to="/allocation" color="inherit" size="small">Allocation grid</Button>}>
        Booking past someone&apos;s weekly capacity is allowed: it shows in red on the Allocation grid.
      </Alert>
      {canManage && (
        <Box><Button variant="contained" startIcon={<AddIcon />} onClick={() => setBooking(true)}>Book someone</Button></Box>
      )}
      <DataTable columns={columns} rows={bookings} rowKey="assignmentId" label="People booked on this project" empty="Nobody is booked on this project yet." />

      {booking && <BookDialog projectId={projectId} onClose={() => setBooking(false)} onSaved={onChanged} />}
      {editing && (
        <FormDialog
          open
          title={`Change ${editing.personName}'s booking`}
          fields={DATE_FIELDS}
          initial={editing}
          onSubmit={async (body) => onChanged(await request('PATCH', `/assignments/${editing.assignmentId}`, { body }))}
          onClose={() => setEditing(null)}
        />
      )}
      {archiving && (
        <ConfirmDialog
          open
          title="Archive this booking?"
          message={`${archiving.personName} will no longer be booked on this project. The booking is kept in the history and their logged time is unaffected.`}
          confirmLabel="Archive booking"
          onConfirm={async () => onChanged(await request('POST', `/assignments/${archiving.assignmentId}/archive`))}
          onClose={() => setArchiving(null)}
        />
      )}
    </Box>
  )
}

ResourcesTab.propTypes = {
  projectId: PropTypes.number.isRequired,
  bookings: PropTypes.arrayOf(PropTypes.shape({
    assignmentId: PropTypes.number.isRequired,
    personName: PropTypes.string,
    hoursPerWeek: PropTypes.number.isRequired,
    startDate: PropTypes.string.isRequired,
    endDate: PropTypes.string.isRequired,
  })).isRequired,
  canManage: PropTypes.bool.isRequired,
  /** Called after any change, to reload the bookings. */
  onChanged: PropTypes.func.isRequired,
}
