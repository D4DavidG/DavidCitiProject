import { HashRouter, Link, Navigate, Outlet, Route, Routes } from 'react-router'
import { Alert, Button, CssBaseline } from '@mui/material'
import { ThemeProvider } from '@mui/material/styles'
import AuthProvider from './auth/AuthContext'
import RequireRole from './auth/RequireRole'
import { STAFF, homePath, useAuth } from './auth/useAuth'
import AppLayout from './components/AppLayout'
import ComingSoon from './components/ComingSoon'
import PageState from './components/PageState'
import theme from './theme/theme'

/** "/" sends you to your home screen, or to the login page. */
function Home() {
  const { status, user } = useAuth()
  if (status === 'loading') return <PageState loading />
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
      <Route path="/login" element={<ComingSoon title="Sign in" />} />
      <Route path="/change-password" element={<RequireRole><ComingSoon title="Change password" /></RequireRole>} />
      <Route element={<SignedIn />}>
        <Route path="/dashboard" element={<RequireRole roles={STAFF}><ComingSoon title="Dashboard" /></RequireRole>} />
        <Route path="/allocation" element={<RequireRole roles={STAFF}><ComingSoon title="Allocation" /></RequireRole>} />
        <Route path="/projects" element={<ComingSoon title="Projects" />} />
        <Route path="/projects/:id" element={<ComingSoon title="Project" />} />
        <Route path="/projects/:id/dependencies" element={<ComingSoon title="Dependencies" />} />
        <Route path="/my-tasks" element={<RequireRole roles={['EMPLOYEE']}><ComingSoon title="My tasks" /></RequireRole>} />
        <Route path="/approvals" element={<RequireRole roles={STAFF}><ComingSoon title="Approvals" /></RequireRole>} />
        <Route path="/people" element={<RequireRole roles={STAFF}><ComingSoon title="People" /></RequireRole>} />
        <Route path="/requests" element={<RequireRole roles={STAFF}><ComingSoon title="Project requests" /></RequireRole>} />
        <Route path="/notifications" element={<ComingSoon title="Notifications" />} />
        <Route path="/audit" element={<RequireRole roles={['ADMIN']}><ComingSoon title="Audit log" /></RequireRole>} />
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
