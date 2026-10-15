import { useCallback, useEffect, useState } from 'react'
import { Box, Button, Card, CardContent, Chip, FormControlLabel, FormHelperText, Switch, Tooltip, Typography } from '@mui/material'
import PageHeader from '../../components/PageHeader'
import { useAuth } from '../../auth/useAuth'
import PageState, { Pager } from '../../components/PageState'
import SearchField from '../../components/SearchField'
import { formatDateTime } from '../../services/format'
import { onUnreadChange, request } from '../../services/request'
import { useApi } from '../../services/useApi'
import { useLastPage } from '../../services/useLastPage'

/**
 * Every change is recorded in the audit log, and that notifies the people above
 * whoever made it: an employee's line manager, the admins and, for project work, the
 * project's manager; a manager's admins.
 * This page is your own inbox of those one-line summaries.
 */
/** Who notifies whom follows the org chart, so the explanation depends on your role. */
const SUBTITLES = {
  ADMIN: 'Changes made by everyone else in the organisation.',
  MANAGER: 'Changes made by the people who report to you, and changes others made to your own work or account.',
  EMPLOYEE: 'Changes other people made to your bookings, tasks, logged time or account.',
}

export default function NotificationsPage() {
  const { user } = useAuth()
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [q, setQ] = useState('')
  const [pageNumber, setPageNumber] = useState(1)
  const [refusal, setRefusal] = useState(null) // { id, text }: a failed write, shown next to the button pressed
  const load = useCallback(() => request('GET', '/notifications', {
    query: { unread: unreadOnly ? 'true' : undefined, q, page: pageNumber, pageSize: 20 },
  }), [unreadOnly, q, pageNumber])
  const notifications = useApi(load)
  const { reload } = notifications
  useLastPage(notifications.data, pageNumber, setPageNumber)

  // The bell announces a new unread count; refresh the list so the new item shows up.
  useEffect(() => onUnreadChange(() => { reload() }), [reload])

  /** POST `path`; `id` is the notification (or 'all') whose button was pressed, so a refusal shows beside it. */
  async function write(path, id) {
    setRefusal(null)
    try {
      await request('POST', path)
      notifications.reload()
    } catch (failure) {
      setRefusal({ id, text: failure.message })
    }
  }

  const items = notifications.data?.items ?? []
  const nothingUnread = items.every((n) => n.isRead)
  return (
    <>
      <PageHeader
        title="Notifications"
        subtitle={SUBTITLES[user.role]}
        actions={(
          <Box sx={{ display: 'grid', gap: 0.5, justifyItems: 'end' }}>
            {/* The server marks every notification, not just the ones a search shows, so it waits until the search is cleared. */}
            <Tooltip title={q ? 'Clear the search to mark every notification as read.' : ''}>
              <Box component="span">
                <Button variant="outlined" disabled={nothingUnread || Boolean(q)} onClick={() => write('/notifications/read-all', 'all')}>Mark all as read</Button>
              </Box>
            </Tooltip>
            {refusal?.id === 'all' && <FormHelperText error role="alert">{refusal.text}</FormHelperText>}
          </Box>
        )}
      />
      <Box sx={{ mb: 2 }}>
        <SearchField label="Search notifications" placeholder="Words in the message" onSearch={(text) => { setQ(text); setPageNumber(1) }} />
      </Box>
      <FormControlLabel
        sx={{ mb: 2 }}
        control={<Switch checked={unreadOnly} onChange={(e) => { setUnreadOnly(e.target.checked); setPageNumber(1) }} />}
        label="Unread only"
      />
      <PageState
        loading={notifications.loading && !notifications.data}
        error={notifications.error}
        onRetry={notifications.reload}
        empty={notifications.data && items.length === 0 ? (q ? 'No notifications match your search.' : 'No notifications.') : null}
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
                  {!n.isRead && <Button size="small" variant="outlined" onClick={() => write(`/notifications/${n.notificationId}/read`, n.notificationId)}>Mark as read</Button>}
                </Box>
                {refusal?.id === n.notificationId && <FormHelperText error role="alert" sx={{ flexBasis: '100%', m: 0 }}>{refusal.text}</FormHelperText>}
              </CardContent>
            </Card>
          ))}
        </Box>
        <Pager page={pageNumber} totalPages={notifications.data?.totalPages} onChange={setPageNumber} />
      </PageState>
    </>
  )
}
