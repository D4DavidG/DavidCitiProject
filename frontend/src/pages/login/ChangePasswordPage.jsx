import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Alert, Box, Button, TextField } from '@mui/material'
import { homePath, useAuth } from '../../auth/useAuth'
import { request } from '../../services/request'
import AuthCard from './AuthCard'

const FIELDS = [
  { name: 'currentPassword', label: 'Current password', autoComplete: 'current-password' },
  { name: 'newPassword', label: 'New password', autoComplete: 'new-password', helper: 'At least 8 characters.' },
  { name: 'confirm', label: 'Confirm new password', autoComplete: 'new-password' },
]

/**
 * Change your password. Required on first sign-in: until then the server answers
 * every other request with 403, and RequireRole keeps sending you back here.
 */
export default function ChangePasswordPage() {
  const { user, startSession } = useAuth()
  const navigate = useNavigate()
  const [values, setValues] = useState({ currentPassword: '', newPassword: '', confirm: '' })
  const [fieldErrors, setFieldErrors] = useState({})
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  async function submit(event) {
    event.preventDefault()
    setError(null)
    if (values.newPassword !== values.confirm) {
      setFieldErrors({ confirm: "Passwords don't match." })
      return
    }
    setFieldErrors({})
    setBusy(true)
    try {
      // The change ends every older session, this one included, and answers with a new one.
      const result = await request('POST', '/auth/change-password', {
        body: { currentPassword: values.currentPassword, newPassword: values.newPassword },
      })
      const updated = startSession(result)
      navigate(homePath(updated ?? user), { replace: true })
    } catch (failure) {
      if (failure.field && failure.field in values) setFieldErrors({ [failure.field]: failure.message })
      else setError(failure.message)
      setBusy(false)
    }
  }

  return (
    <AuthCard
      title="Change password"
      subtitle={user?.mustChangePassword
        ? 'Choose your own password before continuing. The one you were given only works once.'
        : 'Choose a new password.'}
    >
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <Box component="form" onSubmit={submit} noValidate sx={{ display: 'grid', gap: 2 }}>
        {FIELDS.map(({ name, label, autoComplete, helper }) => (
          <TextField
            key={name}
            id={name}
            label={label}
            type="password"
            value={values[name]}
            onChange={(e) => setValues({ ...values, [name]: e.target.value })}
            autoComplete={autoComplete}
            required
            error={Boolean(fieldErrors[name])}
            helperText={fieldErrors[name] ?? helper}
          />
        ))}
        <Button type="submit" variant="contained" size="large" disabled={busy || Object.values(values).some((v) => !v)}>
          {busy ? 'Saving…' : 'Change password'}
        </Button>
      </Box>
    </AuthCard>
  )
}
