/**
 * What the signed-in `user` may do to `person`, in menu order (Archive last). The server
 * checks every one again; this only hides what it would refuse. Admins: everything, but
 * never reset or archive themselves. A manager: capacity and history of their own reports
 * (person.managerId is them). A person with no isArchived (an Allocation row) counts as live.
 *
 * @param {{ userId: number, role: string }} user the signed-in user
 * @param {{ userId: number, managerId?: number|null, isArchived?: boolean }} person
 * @returns {string[]} action keys: capacity, history, edit, reset, reactivate, archive
 */
export function personActions(user, person) {
  const isAdmin = user.role === 'ADMIN'
  const theirManager = user.role === 'MANAGER' && person.managerId === user.userId
  const self = person.userId === user.userId
  const live = !person.isArchived
  return [
    (isAdmin || theirManager) && live && 'capacity',
    (isAdmin || theirManager) && 'history',
    isAdmin && live && 'edit',
    isAdmin && live && !self && 'reset',
    isAdmin && !self && !live && 'reactivate',
    isAdmin && !self && live && 'archive',
  ].filter(Boolean)
}

/** True when the Actions menu for `person` would offer `user` anything at all. */
export function mayActOn(user, person) {
  return personActions(user, person).length > 0
}
