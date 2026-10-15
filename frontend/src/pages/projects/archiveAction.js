/**
 * What this person can do about archiving this project: 'archive' (an admin, with a
 * confirmation), 'request' (the project's own manager, who asks the admins) or null.
 * An archived project offers nothing; the server re-checks every case.
 */
export function archiveAction(user, project) {
  if (project.isArchived) return null
  if (user.role === 'ADMIN') return 'archive'
  if (user.role === 'MANAGER' && project.managerId === user.userId) return 'request'
  return null
}
