import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { Box, Button, TextField, Typography } from '@mui/material'
import { homePath, useAuth } from '../../auth/useAuth'
import { request } from '../../services/request'
import AuthCard from './AuthCard'
import PasswordField from '../../components/PasswordField'

const FIELDS = [
  { name: 'currentPassword', label: 'Current password', autoComplete: 'current-password' },
  { name: 'newPassword', label: 'New password', autoComplete: 'new-password', helper: 'At least 8 characters.' },
  { name: 'confirm', label: 'Confirm new password', autoComplete: 'new-password' },
]

/**
 * Change your password. Required on first sign-in: until then the server answers
 * every other request with 403, and RequireRole keeps sending you back here.
 * While saving, every field and the button are disabled and a second submit is ignored.
 * A problem with a field shows under that field, which takes the cursor; any other error
 * is one line just above the button.
 */
export default function ChangePasswordPage() {
  const { user, startSession } = useAuth()
  const navigate = useNavigate()
  const [values, setValues] = useState({ currentPassword: '', newPassword: '', confirm: '' })
  const [fieldErrors, setFieldErrors] = useState({})
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const sending = useRef(false) // set at once, so two submits in the same moment send once
  const boxes = useRef({})

  // After the fields are enabled again, so the cursor can land in the first one with a problem.
  useEffect(() => {
    const first = FIELDS.find(({ name }) => fieldErrors[name])
    if (first) boxes.current[first.name]?.focus()
  }, [fieldErrors])

  async function submit(event) {
    event.preventDefault()
    if (sending.current) return
    setError(null)
    if (values.newPassword !== values.confirm) {
      setFieldErrors({ confirm: "Passwords don't match." })
      return
    }
    setFieldErrors({})
    sending.current = true
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
      sending.current = false
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
      <Box component="form" onSubmit={submit} noValidate sx={{ display: 'grid', gap: 2 }}>
        {FIELDS.map(({ name, label, autoComplete, helper }) => (
          <PasswordField
            key={name}
            id={name}
            label={label}
            value={values[name]}
            onChange={(e) => setValues({ ...values, [name]: e.target.value })}
            autoComplete={autoComplete}
            required
            disabled={busy}
            inputRef={(box) => { boxes.current[name] = box }}
            error={Boolean(fieldErrors[name])}
            helperText={fieldErrors[name] ?? helper}
          />
        ))}
        {error && <Typography id="change-password-error" role="alert" variant="body2" sx={{ color: 'error.main' }}>{error}</Typography>}
        <Button
          type="submit"
          variant="contained"
          size="large"
          disabled={busy || Object.values(values).some((v) => !v)}
          aria-describedby={error ? 'change-password-error' : undefined}
        >
          {busy ? 'Saving…' : 'Change password'}
        </Button>
      </Box>
    </AuthCard>
  )
}
