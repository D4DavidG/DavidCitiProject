import { useRef, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router'
import { Alert, Box, Button, TextField } from '@mui/material'
import { homePath, useAuth } from '../../auth/useAuth'
import AuthCard from './AuthCard'

/**
 * Sign in with the generated username (initials + 6 digits) and password. A
 * first-time user is sent to change the generated password before anything else.
 * While signing in, both fields and the button are disabled and a second submit is ignored.
 */
export default function LoginPage() {
  const { status, user, login, sessionExpired } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const sending = useRef(false) // set at once, so two submits in the same moment send one login

  if (status === 'signedIn') return <Navigate to={homePath(user)} replace />

  async function submit(event) {
    event.preventDefault()
    if (sending.current) return
    sending.current = true
    setBusy(true)
    setError(null)
    try {
      const signedIn = await login(username.trim().toUpperCase(), password)
      const from = location.state?.from
      const next = signedIn.mustChangePassword ? '/change-password' : from ?? homePath(signedIn)
      navigate(next, { replace: true })
    } catch (failure) {
      setError(failure.message)
      sending.current = false
      setBusy(false)
    }
  }

  return (
    <AuthCard title="Sign in" subtitle="Use the username and password your administrator gave you.">
      {sessionExpired && !error && (
        <Alert severity="info" sx={{ mb: 2 }}>Your session expired. Please sign in again.</Alert>
      )}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <Box component="form" onSubmit={submit} noValidate sx={{ display: 'grid', gap: 2 }}>
        <TextField
          id="username"
          label="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          autoFocus
          required
          disabled={busy}
          placeholder="e.g. ML662930"
        />
        <TextField
          id="password"
          label="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
          disabled={busy}
        />
        <Button type="submit" variant="contained" size="large" disabled={busy || !username || !password}>
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>
      </Box>
    </AuthCard>
  )
}
