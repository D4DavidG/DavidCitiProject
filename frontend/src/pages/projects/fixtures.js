/* Sample API answers shared by the project screen tests (field names exactly as the API sends them). */
export const APOLLO = {
  projectId: 1, name: 'Apollo', description: 'Customer portal rebuild', managerId: 2,
  startDate: '2026-10-01', predictedEndDate: '2026-12-31', budgetCents: 15_000_000,
  status: 'ACTIVE', isArchived: false, archivedAt: null, progressPercent: 12,
}
export const MARIA = { userId: 2, firstName: 'Maria', lastName: 'Lopez', role: 'MANAGER' }
export const BOOKINGS = [
  { assignmentId: 7, projectId: 1, userId: 3, personName: 'Ana Ruiz', hoursPerWeek: 30, startDate: '2026-10-01', endDate: '2026-12-31', isArchived: false },
  { assignmentId: 8, projectId: 1, userId: 4, personName: 'Ben Okafor', hoursPerWeek: 25, startDate: '2026-10-01', endDate: '2026-11-30', isArchived: false },
]
export const DESIGN = {
  milestoneId: 10, projectId: 1, name: 'Design', description: null, startDate: '2026-10-01', dueDate: '2026-10-06',
  completedAt: '2026-10-07T14:00:00+00:00', completedBy: 2, sortOrder: 0, isArchived: false,
  status: 'DONE', progressPercent: 100, totalEstimateMinutes: 600, doneEstimateMinutes: 600, taskCount: 1, doneTaskCount: 1,
}
export const BUILD = {
  ...DESIGN, milestoneId: 11, name: 'Build', dueDate: '2026-11-12', completedAt: null, completedBy: null,
  status: 'IN_PROGRESS', progressPercent: 0, totalEstimateMinutes: 1200, doneEstimateMinutes: 0, taskCount: 2, doneTaskCount: 0,
}
export const BUILD_TASKS = [
  { taskId: 20, milestoneId: 11, projectId: 1, title: 'Portal UI', assigneeUserId: 4, status: 'IN_PROGRESS', estimateMinutes: 600 },
  { taskId: 21, milestoneId: 11, projectId: 1, title: 'API wiring', assigneeUserId: 3, status: 'TODO', estimateMinutes: 600 },
]
export const BUDGET = {
  projectId: 1, budgetCents: 15_000_000, plannedCents: 3_197_600, consumedCents: 137_000, pendingCents: 153_800,
  remainingCents: 14_863_000, plannedOverBudget: false, consumedPercent: 0, scheduleElapsedPercent: 14,
}
export const BOARD_TASKS = [
  { taskId: 30, milestoneId: 12, projectId: 1, title: 'Go-live checklist', milestoneName: 'Launch', estimateMinutes: 480, assigneeUserId: null, assigneeName: null, status: 'TODO' },
  { taskId: 31, milestoneId: 11, projectId: 1, title: 'Portal UI', milestoneName: 'Build', estimateMinutes: 2400, assigneeUserId: 4, assigneeName: 'Ben Okafor', status: 'TODO' },
  { taskId: 32, milestoneId: 11, projectId: 1, title: 'Portal API', milestoneName: 'Build', estimateMinutes: 3600, assigneeUserId: 3, assigneeName: 'Ana Ruiz', status: 'IN_PROGRESS' },
  { taskId: 33, milestoneId: 10, projectId: 1, title: 'Wireframes', milestoneName: 'Design', estimateMinutes: 960, assigneeUserId: 3, assigneeName: 'Ana Ruiz', status: 'DONE' },
]
export const BOARD_PEOPLE = [
  { userId: 3, name: 'Ana Ruiz', held: 1, limit: 2 },
  { userId: 4, name: 'Ben Okafor', held: 1, limit: 2 },
]
