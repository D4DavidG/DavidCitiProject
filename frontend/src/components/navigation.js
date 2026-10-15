import DashboardIcon from '@mui/icons-material/SpaceDashboardOutlined'
import GridIcon from '@mui/icons-material/GridViewOutlined'
import ScheduleIcon from '@mui/icons-material/ViewTimelineOutlined'
import FolderIcon from '@mui/icons-material/FolderOutlined'
import ApprovalIcon from '@mui/icons-material/FactCheckOutlined'
import PeopleIcon from '@mui/icons-material/PeopleOutlined'
import RequestIcon from '@mui/icons-material/PostAddOutlined'
import BellIcon from '@mui/icons-material/NotificationsOutlined'
import HistoryIcon from '@mui/icons-material/HistoryOutlined'

/**
 * The menu, in order; `roles` lists who sees each item (the server enforces the same rules).
 * An employee's Dashboard is their own page (/my-tasks): their projects, then their tasks.
 */
export const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', icon: DashboardIcon, roles: ['ADMIN', 'MANAGER'] },
  { to: '/allocation', label: 'Allocation', icon: GridIcon, roles: ['ADMIN', 'MANAGER'] },
  { to: '/schedule', label: 'Schedule', icon: ScheduleIcon, roles: ['ADMIN', 'MANAGER'] },
  { to: '/my-tasks', label: 'Dashboard', icon: DashboardIcon, roles: ['EMPLOYEE'] },
  { to: '/projects', label: 'Projects', icon: FolderIcon, roles: ['ADMIN', 'MANAGER', 'EMPLOYEE'] },
  { to: '/approvals', label: 'Approvals', icon: ApprovalIcon, roles: ['ADMIN', 'MANAGER'] },
  { to: '/people', label: 'People', icon: PeopleIcon, roles: ['ADMIN', 'MANAGER'] },
  { to: '/requests', label: 'Requests', icon: RequestIcon, roles: ['ADMIN', 'MANAGER', 'EMPLOYEE'] },
  { to: '/notifications', label: 'Notifications', icon: BellIcon, roles: ['ADMIN', 'MANAGER', 'EMPLOYEE'] },
  { to: '/audit', label: 'Audit log', icon: HistoryIcon, roles: ['ADMIN'] },
]

export const ROLE_LABELS = { ADMIN: 'Admin', MANAGER: 'Manager', EMPLOYEE: 'Employee' }
