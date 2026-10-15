import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Badge, Button, IconButton, Snackbar, SnackbarContent } from '@mui/material'
import BellIcon from '@mui/icons-material/NotificationsOutlined'
import { announceUnreadChange, onWrite, request } from '../services/request'

// 10 s: a manager sees a team member's change within about 10 s, at about 6 small reads a minute.
const POLL_MS = 10_000
const POPUP_MS = 6_000

const isVisible = () => document.visibilityState === 'visible'

/**
 * The bell in the top bar with the number of unread notifications. Lambda can't
 * push (no websockets on Function URLs), so it asks every 10 seconds while the tab
 * is visible, at once when the person comes back to the tab or window, and straight
 * after any change made in this app. When the count goes up (never on the first
 * load, never when it falls) a pop-up shows the newest summary with a View link.
 * Every count change is also announced so the Notifications page can reload itself.
 */
export default function NotificationBell() {
  const [count, setCount] = useState(null)
  const [popup, setPopup] = useState(null)

  useEffect(() => {
    let current = true
    let last = null // the previous count; null until the first answer
    let timer = null

    const showNewest = () => request('GET', '/notifications', { query: { unread: 'true', pageSize: 1 } })
      .then((result) => {
        const newest = result?.items?.[0]
        if (current && newest) setPopup({ key: newest.notificationId, summary: newest.summary })
      })
      .catch(() => {}) // no pop-up is better than an error message

    const check = () => request('GET', '/notifications/unread-count')
      .then((result) => {
        if (!current) return
        const next = result?.count ?? 0
        const previous = last
        last = next
        setCount(next)
        if (previous !== null && next !== previous) {
          announceUnreadChange()
          if (next > previous) showNewest()
        }
      })
      .catch(() => {}) // the bell never shows an error; the next check will try again

    const startTimer = () => {
      if (timer === null) timer = setInterval(check, POLL_MS)
    }
    const stopTimer = () => {
      clearInterval(timer)
      timer = null
    }
    const onVisibility = () => {
      if (isVisible()) {
        check()
        startTimer()
      } else {
        stopTimer()
      }
    }
    const onFocus = () => { if (isVisible()) check() }

    check()
    if (isVisible()) startTimer()
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('focus', onFocus)
    const stop = onWrite(check)
    return () => {
      current = false
      stopTimer()
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('focus', onFocus)
      stop()
    }
  }, [])

  const label = count === null ? 'Notifications' : `Notifications, ${count > 0 ? `${count} unread` : 'no unread'}`
  const close = () => setPopup(null)
  return (
    <>
      <IconButton component={Link} to="/notifications" aria-label={label} color="inherit">
        <Badge badgeContent={count ?? 0} color="error" max={99}>
          <BellIcon />
        </Badge>
      </IconButton>
      <Snackbar
        key={popup?.key}
        open={popup !== null}
        autoHideDuration={POPUP_MS}
        onClose={(_, reason) => { if (reason !== 'clickaway') close() }}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        {/* role="status" is polite; the default "alert" would interrupt a screen reader */}
        <SnackbarContent
          role="status"
          message={popup?.summary}
          action={<Button color="inherit" size="small" component={Link} to="/notifications" onClick={close}>View</Button>}
        />
      </Snackbar>
    </>
  )
}
