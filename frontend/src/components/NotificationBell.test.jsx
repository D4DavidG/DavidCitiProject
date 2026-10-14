import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, screen } from '@testing-library/react'
import NotificationBell from './NotificationBell'
import { request } from '../services/request'
import { renderAt, stubApi } from '../test/utils'

describe('NotificationBell', () => {
  afterEach(() => vi.useRealTimers())

  it('shows the unread count and links to the notifications page', async () => {
    stubApi({ 'GET /notifications/unread-count': [200, { count: 3 }] })
    renderAt(<NotificationBell />)
    const bell = await screen.findByRole('link', { name: 'Notifications, 3 unread' })
    expect(bell).toHaveAttribute('href', '/notifications')
  })

  it('checks again every 30 seconds', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    let count = 1
    const calls = stubApi({ 'GET /notifications/unread-count': () => [200, { count }] })
    renderAt(<NotificationBell />)
    await screen.findByRole('link', { name: 'Notifications, 1 unread' })
    count = 4
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000) })
    expect(await screen.findByRole('link', { name: 'Notifications, 4 unread' })).toBeInTheDocument()
    expect(calls.filter((c) => c.path === '/notifications/unread-count').length).toBeGreaterThanOrEqual(2)
  })

  it('checks again straight after any change made in the app', async () => {
    let count = 2
    stubApi({
      'GET /notifications/unread-count': () => [200, { count }],
      'POST /notifications/read-all': () => { count = 0; return [200, { updated: 2 }] },
    })
    renderAt(<NotificationBell />)
    await screen.findByRole('link', { name: 'Notifications, 2 unread' })
    await act(async () => { await request('POST', '/notifications/read-all') })
    expect(await screen.findByRole('link', { name: 'Notifications, no unread' })).toBeInTheDocument()
  })
})
