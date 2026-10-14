import { useCallback, useState } from 'react'
import { Alert, Box, Button, Card, CardContent, Chip, FormControlLabel, Pagination, Switch, Typography } from '@mui/material'
import PageHeader from '../../components/PageHeader'
import PageState from '../../components/PageState'
import { formatDateTime } from '../../services/format'
import { request } from '../../services/request'
import { useApi } from '../../services/useApi'

/**
 * Every change is recorded in the audit log, and that notifies the people above
 * whoever made it: an employee's line manager and the admins; a manager's admins.
 * This page is your own inbox of those one-line summaries.
 */
export default function NotificationsPage() {
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [pageNumber, setPageNumber] = useState(1)
  const [error, setError] = useState(null)
  const load = useCallback(() => request('GET', '/notifications', {
    query: { unread: unreadOnly ? 'true' : undefined, page: pageNumber, pageSize: 20 },
  }), [unreadOnly, pageNumber])
  const notifications = useApi(load)

  async function write(path) {
    setError(null)
    try {
      await request('POST', path)
      notifications.reload()
    } catch (failure) {
      setError(failure.message)
    }
  }

  const items = notifications.data?.items ?? []
  return (
    <>
      <PageHeader
        title="Notifications"
        subtitle="What changed, made by people you oversee (or, for admins, by everyone)."
        actions={<Button variant="outlined" onClick={() => write('/notifications/read-all')}>Mark all as read</Button>}
      />
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <FormControlLabel
        sx={{ mb: 2 }}
        control={<Switch checked={unreadOnly} onChange={(e) => { setUnreadOnly(e.target.checked); setPageNumber(1) }} />}
        label="Unread only"
      />
      <PageState
        loading={notifications.loading && !notifications.data}
        error={notifications.error}
        onRetry={notifications.reload}
        empty={notifications.data && items.length === 0 ? 'No notifications.' : null}
      >
        <Box component="ul" sx={{ listStyle: 'none', p: 0, m: 0, display: 'grid', gap: 1 }}>
          {items.map((n) => (
            <Card component="li" key={n.notificationId} aria-label={n.summary} sx={{ borderLeft: 4, borderLeftColor: n.isRead ? 'divider' : 'primary.main' }}>
              <CardContent sx={{ display: 'flex', gap: 2, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', py: '12px !important' }}>
                <Box>
                  <Typography sx={{ fontWeight: n.isRead ? 400 : 600 }}>{n.summary}</Typography>
                  <Typography variant="caption" color="text.secondary">{formatDateTime(n.createdAt)}</Typography>
                </Box>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                  {!n.isRead && <Chip size="small" color="primary" label="New" />}
                  {!n.isRead && <Button size="small" onClick={() => write(`/notifications/${n.notificationId}/read`)}>Mark as read</Button>}
                </Box>
              </CardContent>
            </Card>
          ))}
        </Box>
        {notifications.data?.totalPages > 1 && (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
            <Pagination count={notifications.data.totalPages} page={pageNumber} onChange={(_, value) => setPageNumber(value)} />
          </Box>
        )}
      </PageState>
    </>
  )
}
