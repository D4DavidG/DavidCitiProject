import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, screen } from '@testing-library/react'
import { within } from '@testing-library/react'
import NotificationBell from './NotificationBell'
import { request } from '../services/request'
import { page, renderAt, stubApi } from '../test/utils'

/** Pretend the tab is shown or hidden, and tell the page, as a browser does. */
function setVisibility(state, { announce = false } = {}) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
  if (announce) document.dispatchEvent(new Event('visibilitychange'))
}

const checks = (calls) => calls.filter((c) => c.path === '/notifications/unread-count').length
const NEWEST = { notificationId: 9, summary: 'Chloe Kim moved task Cut over databases to in progress', isRead: false }

describe('NotificationBell', () => {
  afterEach(() => {
    vi.useRealTimers()
    setVisibility('visible')
  })

  it('shows the unread count and links to the notifications page', async () => {
    stubApi({ 'GET /notifications/unread-count': [200, { count: 3 }] })
    renderAt(<NotificationBell />)
    const bell = await screen.findByRole('link', { name: 'Notifications, 3 unread' })
    expect(bell).toHaveAttribute('href', '/notifications')
  })

  it('checks again every 10 seconds while the tab is visible', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    let count = 1
    const calls = stubApi({ 'GET /notifications/unread-count': () => [200, { count }], 'GET /notifications': [200, page([NEWEST])] })
    renderAt(<NotificationBell />)
    await screen.findByRole('link', { name: 'Notifications, 1 unread' })
    expect(checks(calls)).toBe(1)
    count = 4
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000) })
    expect(await screen.findByRole('link', { name: 'Notifications, 4 unread' })).toBeInTheDocument()
    expect(checks(calls)).toBe(2)
  })

  it('stops asking while the tab is hidden', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const calls = stubApi({ 'GET /notifications/unread-count': [200, { count: 1 }] })
    renderAt(<NotificationBell />)
    await screen.findByRole('link', { name: 'Notifications, 1 unread' })
    await act(async () => { setVisibility('hidden', { announce: true }) })
    const before = checks(calls)
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000) })
    expect(checks(calls)).toBe(before)
  })

  it('checks at once when the person comes back to the tab, and when the window gets focus', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const calls = stubApi({ 'GET /notifications/unread-count': [200, { count: 1 }] })
    renderAt(<NotificationBell />)
    await screen.findByRole('link', { name: 'Notifications, 1 unread' })
    await act(async () => { setVisibility('hidden', { announce: true }) })
    const before = checks(calls)
    await act(async () => { setVisibility('visible', { announce: true }) })
    expect(checks(calls)).toBe(before + 1)
    await act(async () => { window.dispatchEvent(new Event('focus')) })
    expect(checks(calls)).toBe(before + 2)
  })

  it('pops up the newest summary, with a View link, when the count rises', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    let count = 1
    const calls = stubApi({ 'GET /notifications/unread-count': () => [200, { count }], 'GET /notifications': [200, page([NEWEST])] })
    renderAt(<NotificationBell />)
    await screen.findByRole('link', { name: 'Notifications, 1 unread' })
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    count = 2
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000) })
    const popup = await screen.findByRole('status')
    expect(popup).toHaveTextContent('Chloe Kim moved task Cut over databases to in progress')
    expect(within(popup).getByRole('link', { name: 'View' })).toHaveAttribute('href', '/notifications')
    const fetched = calls.find((c) => c.path === '/notifications')
    expect(fetched.query).toEqual({ unread: 'true', pageSize: '1' })
    await act(async () => { await vi.advanceTimersByTimeAsync(6_500) })
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('does not pop up on the first load or when the count falls', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    let count = 3
    stubApi({ 'GET /notifications/unread-count': () => [200, { count }], 'GET /notifications': [200, page([NEWEST])] })
    renderAt(<NotificationBell />)
    await screen.findByRole('link', { name: 'Notifications, 3 unread' })
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    count = 0
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000) })
    expect(await screen.findByRole('link', { name: 'Notifications, no unread' })).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
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
