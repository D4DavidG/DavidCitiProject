import PropTypes from 'prop-types'
import FormDialog from '../../components/FormDialog'
import { request } from '../../services/request'

/** The server wants a note on every request; this stands in when the manager leaves the reason empty. */
export const NO_REASON = 'No reason given.'

/**
 * A manager asks the admins to archive a project they manage. It sends the same
 * ARCHIVE_PROJECT request as the Requests page's "Archive a project" form; the reason
 * is optional here. The server refuses a project the asker doesn't manage (404) or one
 * already archived (409), and its message shows in the dialog.
 */
export default function RequestArchiveDialog({ project, onSent, onClose }) {
  return (
    <FormDialog
      open
      title={`Request archive of ${project.name}`}
      submitLabel="Send request"
      fields={[{ name: 'justification', label: 'Reason (optional)', type: 'textarea', helper: 'An admin decides, and sees this note.' }]}
      onSubmit={async (body) => {
        await request('POST', '/project-requests', {
          body: { kind: 'ARCHIVE_PROJECT', projectId: project.projectId, justification: body.justification || NO_REASON },
        })
        onSent(project)
      }}
      onClose={onClose}
    />
  )
}

RequestArchiveDialog.propTypes = {
  project: PropTypes.shape({ projectId: PropTypes.number.isRequired, name: PropTypes.string.isRequired }).isRequired,
  /** Called with the project once the request is sent. */
  onSent: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
}
