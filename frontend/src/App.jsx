import { Suspense } from 'react'
import { HashRouter, Link, Navigate, Outlet, Route, Routes } from 'react-router'
import { Alert, Button, CssBaseline } from '@mui/material'
import AuthProvider from './auth/AuthContext'
import RequireRole from './auth/RequireRole'
import { STAFF, homePath, useAuth } from './auth/useAuth'
import AppLayout from './components/AppLayout'
import lazyPage from './components/lazyPage'
import PageState from './components/PageState'
import ChangePasswordPage from './pages/login/ChangePasswordPage'
import LoginPage from './pages/login/LoginPage'
import ColorModeProvider from './theme/ColorModeProvider'

const AccountPage = lazyPage(() => import('./pages/account/AccountPage'))
const AllocationPage = lazyPage(() => import('./pages/allocation/AllocationPage'))
const ApprovalsPage = lazyPage(() => import('./pages/approvals/ApprovalsPage'))
const AuditLogPage = lazyPage(() => import('./pages/audit/AuditLogPage'))
const DashboardPage = lazyPage(() => import('./pages/dashboard/DashboardPage'))
const MyTasksPage = lazyPage(() => import('./pages/mytasks/MyTasksPage'))
const NotificationsPage = lazyPage(() => import('./pages/notifications/NotificationsPage'))
const PeoplePage = lazyPage(() => import('./pages/people/PeoplePage'))
const DependencyPage = lazyPage(() => import('./pages/projects/DependencyPage'))
const ProjectDetailPage = lazyPage(() => import('./pages/projects/ProjectDetailPage'))
const ProjectsPage = lazyPage(() => import('./pages/projects/ProjectsPage'))
const RequestsPage = lazyPage(() => import('./pages/requests/RequestsPage'))
const SchedulePage = lazyPage(() => import('./pages/schedule/SchedulePage'))

/** "/" sends you to your home screen, or to the login page. */
function Home() {
  const { status, user } = useAuth()
  if (status === 'loading') return <PageState loading />
  if (status === 'unavailable') return <RequireRole><span /></RequireRole> // shows the Retry state
  return <Navigate to={status === 'signedIn' ? homePath(user) : '/login'} replace />
}

function NotFound() {
  return (
    <Alert severity="warning" action={<Button component={Link} to="/" color="inherit">Go home</Button>}>
      Page not found.
    </Alert>
  )
}

/**
 * Every signed-in page shares the layout; RequireRole keeps signed-out visitors out.
 * Suspense sits inside the layout, so the menu stays while a page's file arrives.
 */
function SignedIn() {
  return (
    <RequireRole>
      <AppLayout><Suspense fallback={<PageState loading />}><Outlet /></Suspense></AppLayout>
    </RequireRole>
  )
}

/**
 * The route table. Hash URLs (#/projects/7) mean the server only ever serves
 * index.html, so CloudFront needs no rewrite rule (it was removed on 13 Oct because
 * it also swallowed the API's 404s). Each signed-in page is its own file, downloaded
 * on its first visit.
 */
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/change-password" element={<RequireRole><ChangePasswordPage /></RequireRole>} />
      <Route element={<SignedIn />}>
        <Route path="/dashboard" element={<RequireRole roles={STAFF}><DashboardPage /></RequireRole>} />
        <Route path="/allocation" element={<RequireRole roles={STAFF}><AllocationPage /></RequireRole>} />
        <Route path="/schedule" element={<RequireRole roles={STAFF}><SchedulePage /></RequireRole>} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/projects/:id" element={<ProjectDetailPage />} />
        <Route path="/projects/:id/dependencies" element={<DependencyPage />} />
        <Route path="/my-tasks" element={<RequireRole roles={['EMPLOYEE']}><MyTasksPage /></RequireRole>} />
        <Route path="/approvals" element={<RequireRole roles={STAFF}><ApprovalsPage /></RequireRole>} />
        <Route path="/people" element={<RequireRole roles={STAFF}><PeoplePage /></RequireRole>} />
        <Route path="/requests" element={<RequestsPage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/account" element={<AccountPage />} />
        <Route path="/audit" element={<RequireRole roles={['ADMIN']}><AuditLogPage /></RequireRole>} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}

/** The whole app: light or dark theme (a plain page, no grid), session, router. */
export default function App() {
  return (
    <ColorModeProvider>
      <CssBaseline enableColorScheme />
      <HashRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </HashRouter>
    </ColorModeProvider>
  )
}
