import { describe, expect, it } from 'vitest'
import { act, screen, waitFor, within } from '@testing-library/react'
import { announceUnreadChange } from '../../services/request'
import userEvent from '@testing-library/user-event'
import NotificationsPage from './NotificationsPage'
import { USERS, page, renderAt, session, stubApi } from '../../test/utils'

const UNREAD = { notificationId: 5, auditId: 50, summary: 'Ana Ruiz logged 8 h on task Portal UI', entityType: 'time_entries', entityId: 30, isRead: false, readAt: null, createdAt: '2026-10-14T01:03:25+00:00' }
const READ = { ...UNREAD, notificationId: 4, summary: 'Ana Ruiz changed their email', isRead: true, readAt: '2026-10-14T02:00:00+00:00' }

function renderPage(answers = {}) {
  const calls = stubApi({
    'GET /notifications': [200, page([UNREAD, READ])],
    'POST /notifications/5/read': [200, { ...UNREAD, isRead: true }],
    'POST /notifications/read-all': [200, { updated: 1 }],
    ...answers,
  })
  renderAt(<NotificationsPage />, { path: '/notifications' })
  return calls
}

describe('NotificationsPage', () => {
  it('lists what changed, newest first, with when and whether it is read', async () => {
    renderPage()
    const unread = await screen.findByRole('listitem', { name: /ana ruiz logged 8 h/i })
    expect(within(unread).getByText('Oct 13, 2026, 9:03 PM')).toBeInTheDocument()
    expect(within(unread).getByText('New')).toBeInTheDocument()
    expect(within(screen.getByRole('listitem', { name: /changed their email/i })).queryByText('New')).not.toBeInTheDocument()
  })

  it('reloads its list when the unread count changes', async () => {
    let items = [UNREAD]
    renderPage({ 'GET /notifications': () => [200, page(items)] })
    await screen.findByRole('listitem', { name: /ana ruiz logged 8 h/i })
    items = [{ ...UNREAD, notificationId: 6, summary: 'Chloe Kim moved task Cut over databases to todo' }, UNREAD]
    await act(async () => { announceUnreadChange() })
    expect(await screen.findByRole('listitem', { name: /chloe kim moved task/i })).toBeInTheDocument()
  })

  it('marks one as read', async () => {
    const calls = renderPage()
    const unread = await screen.findByRole('listitem', { name: /ana ruiz logged 8 h/i })
    await userEvent.click(within(unread).getByRole('button', { name: /mark as read/i }))
    await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.path === '/notifications/5/read')).toBe(true))
  })

  it('marks all as read', async () => {
    const calls = renderPage()
    await screen.findByRole('listitem', { name: /ana ruiz logged 8 h/i })
    await userEvent.click(screen.getByRole('button', { name: /mark all as read/i }))
    await waitFor(() => expect(calls.some((c) => c.path === '/notifications/read-all')).toBe(true))
  })

  it('shows only unread ones when asked', async () => {
    const calls = renderPage()
    await screen.findByRole('listitem', { name: /ana ruiz logged 8 h/i })
    await userEvent.click(screen.getByLabelText(/unread only/i))
    await waitFor(() => expect(calls.at(-1).query.unread).toBe('true'))
  })

  it('says when there is nothing new, and offers nothing to mark', async () => {
    renderPage({ 'GET /notifications': [200, page([])] })
    expect(await screen.findByText(/no notifications/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /mark all as read/i })).toBeDisabled()
  })

  it('explains to an employee what they will be notified about', async () => {
    stubApi({ 'GET /notifications': [200, page([])] })
    renderAt(<NotificationsPage />, { path: '/notifications', auth: session(USERS.employee) })
    expect(await screen.findByText(/changes made by the people who report to you/i)).toBeInTheDocument()
  })
})
