import { useState } from 'react'
import { Link } from 'react-router'
import { Box, Button, Card, CardContent, Typography } from '@mui/material'
import FormDialog from '../../components/FormDialog'
import HistoryPanel from '../../components/HistoryPanel'
import PageHeader from '../../components/PageHeader'
import { ROLE_LABELS } from '../../components/navigation'
import { useAuth } from '../../auth/useAuth'
import { formatCents } from '../../services/format'
import { request } from '../../services/request'

const PROFILE_FIELDS = [
  { name: 'firstName', label: 'First name', required: true },
  { name: 'lastName', label: 'Last name', required: true },
  { name: 'email', label: 'Email', required: true },
]

/**
 * Anyone's own account: they change their own name, email and password; everything
 * else (username, role, line manager, capacity, salary) is shown but set by others.
 * Changing your name is audited and notifies your line manager and the admins.
 * My history lists what you changed and what others changed on your account.
 */
export default function AccountPage() {
  const { user, refreshUser } = useAuth()
  const [editing, setEditing] = useState(false)

  const facts = [
    ['Username', user.username],
    ['Role', ROLE_LABELS[user.role]],
    ['Email', user.email],
    ['Job title', user.jobTitle || '—'],
    ['Weekly capacity', `${user.weeklyCapacityHours} h/week, ${user.overtimeAllowed ? 'overtime allowed' : 'no overtime'}`],
    ...(user.annualSalaryCents !== undefined ? [['Annual salary', formatCents(user.annualSalaryCents)]] : []),
  ]

  return (
    <>
      <PageHeader
        title="My account"
        subtitle={`${user.firstName} ${user.lastName}`}
        actions={(
          <>
            <Button variant="contained" onClick={() => setEditing(true)}>Edit my details</Button>
            <Button component={Link} to="/change-password" variant="outlined">Change password</Button>
          </>
        )}
      />
      <Card sx={{ maxWidth: 640 }}>
        <CardContent sx={{ display: 'grid', gap: 1.5 }}>
          {facts.map(([label, value]) => (
            <Box key={label} sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '180px 1fr' }, gap: { sm: 2 } }}>
              <Typography variant="body2" color="text.secondary">{label}</Typography>
              <Typography>{value}</Typography>
            </Box>
          ))}
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            You can change your name, email and password. Your username never changes; your role,
            line manager, capacity and salary are set by your manager or an admin.
          </Typography>
        </CardContent>
      </Card>

      <Card sx={{ mt: 3 }}>
        <CardContent>
          <Typography variant="h3" component="h2" sx={{ mb: 2 }}>My history</Typography>
          <HistoryPanel userId={user.userId} />
        </CardContent>
      </Card>

      {editing && (
        <FormDialog
          open
          title="Edit my details"
          fields={PROFILE_FIELDS}
          initial={user}
          onSubmit={async (body) => { await request('PATCH', '/users/me', { body }); await refreshUser() }}
          onClose={() => setEditing(false)}
        />
      )}
    </>
  )
}
