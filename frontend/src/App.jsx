import { HashRouter, Link, Navigate, Outlet, Route, Routes } from 'react-router'
import { Alert, Button, CssBaseline } from '@mui/material'
import { ThemeProvider } from '@mui/material/styles'
import AuthProvider from './auth/AuthContext'
import RequireRole from './auth/RequireRole'
import { STAFF, homePath, useAuth } from './auth/useAuth'
import AppLayout from './components/AppLayout'
import PageState from './components/PageState'
import AccountPage from './pages/account/AccountPage'
import AllocationPage from './pages/allocation/AllocationPage'
import ApprovalsPage from './pages/approvals/ApprovalsPage'
import AuditLogPage from './pages/audit/AuditLogPage'
import DashboardPage from './pages/dashboard/DashboardPage'
import ChangePasswordPage from './pages/login/ChangePasswordPage'
import LoginPage from './pages/login/LoginPage'
import MyTasksPage from './pages/mytasks/MyTasksPage'
import NotificationsPage from './pages/notifications/NotificationsPage'
import PeoplePage from './pages/people/PeoplePage'
import DependencyPage from './pages/projects/DependencyPage'
import ProjectDetailPage from './pages/projects/ProjectDetailPage'
import ProjectsPage from './pages/projects/ProjectsPage'
import RequestsPage from './pages/requests/RequestsPage'
import theme from './theme/theme'

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

/** Every signed-in page shares the layout; RequireRole keeps signed-out visitors out. */
function SignedIn() {
  return (
    <RequireRole>
      <AppLayout><Outlet /></AppLayout>
    </RequireRole>
  )
}

/**
 * The route table. Hash URLs (#/projects/7) mean the server only ever serves
 * index.html, so CloudFront needs no rewrite rule (it was removed on 13 Oct because
 * it also swallowed the API's 404s).
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

/** The whole app: theme, session, router. */
export default function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <HashRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </HashRouter>
    </ThemeProvider>
  )
}
