/* Words for audit entries, shared by the audit log and the History panel. */

/** Table names in the API, in the brief's words. */
export const ENTITY_LABELS = {
  users: 'Person',
  projects: 'Project',
  assignments: 'Resource booking',
  milestones: 'Deliverable',
  milestone_dependencies: 'Dependency',
  tasks: 'Task',
  time_entries: 'Time entry',
  project_requests: 'Project request',
}

/** RESET_PASSWORD -> "Reset password". */
export function actionLabel(action) {
  const words = action.toLowerCase().replace(/_/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/** One snapshot value as text; a missing value is a dash. */
export function show(value) {
  if (value === null || value === undefined) return '—'
  return typeof value === 'object' ? JSON.stringify(value) : String(value)
}

/** The fields that differ between the before and after snapshots (all of them for a create). */
export function changedFields(before, after) {
  const keys = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])]
  return keys.filter((k) => JSON.stringify(before?.[k]) !== JSON.stringify(after?.[k]))
}
