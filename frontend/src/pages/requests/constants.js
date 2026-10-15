/** What each kind of request is called on screen. */
export const KIND_LABELS = {
  NEW_PROJECT: 'New project',
  ARCHIVE_PROJECT: 'Archive a project',
  TASK_LIMIT: 'Raise my task limit',
  OVERTIME: 'Allow overtime',
  OTHER: 'Something else',
}

/** The kinds each role may send (the server's SENDERS). Admins have nobody to ask. */
export const SEND_KINDS = {
  MANAGER: ['NEW_PROJECT', 'ARCHIVE_PROJECT', 'OTHER'],
  EMPLOYEE: ['TASK_LIMIT', 'OVERTIME', 'OTHER'],
  ADMIN: [],
}

/**
 * The two lists, named as the server's `scope` values: what you sent, and what is
 * waiting for your decision. Admins send nothing and employees decide nothing, so each
 * role has the lists it can use; a manager has both, as tabs.
 */
export const TAB_LABELS = { sent: 'My requests', decide: 'Approve or deny' }
export const SCOPES_BY_ROLE = { EMPLOYEE: ['sent'], MANAGER: ['sent', 'decide'], ADMIN: ['decide'] }

/** The kinds that can appear in a list, for its Kind filter: a manager's own, an employee's, or any for an admin. */
export function kindsOn(role, scope) {
  if (scope === 'sent') return SEND_KINDS[role]
  return role === 'ADMIN' ? Object.keys(KIND_LABELS) : SEND_KINDS.EMPLOYEE
}
