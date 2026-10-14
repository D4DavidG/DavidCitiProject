import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Badge, IconButton } from '@mui/material'
import BellIcon from '@mui/icons-material/NotificationsOutlined'
import { onWrite, request } from '../services/request'

const POLL_MS = 30_000

/**
 * The bell in the top bar with the number of unread notifications. Lambda can't
 * push (no websockets on Function URLs), so it asks every 30 seconds, and straight
 * after any change made in this app.
 */
export default function NotificationBell() {
  const [count, setCount] = useState(null)

  useEffect(() => {
    let current = true
    const check = () => request('GET', '/notifications/unread-count')
      .then((result) => { if (current) setCount(result?.count ?? 0) })
      .catch(() => {}) // the bell never shows an error; the next check will try again
    check()
    const timer = setInterval(check, POLL_MS)
    const stop = onWrite(check)
    return () => {
      current = false
      clearInterval(timer)
      stop()
    }
  }, [])

  const label = count === null ? 'Notifications' : `Notifications, ${count > 0 ? `${count} unread` : 'no unread'}`
  return (
    <IconButton component={Link} to="/notifications" aria-label={label}>
      <Badge badgeContent={count ?? 0} color="error" max={99}>
        <BellIcon />
      </Badge>
    </IconButton>
  )
}
