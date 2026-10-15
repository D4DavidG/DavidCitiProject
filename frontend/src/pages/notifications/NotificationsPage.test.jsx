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

  it('searches on the server and goes back to page 1', async () => {
    const calls = renderPage({ 'GET /notifications': [200, page([UNREAD, READ], { totalPages: 3 })] })
    await screen.findByRole('listitem', { name: /ana ruiz logged 8 h/i })
    expect(calls[0].query.q).toBeUndefined()
    await userEvent.click(screen.getByRole('button', { name: /go to page 2/i }))
    await waitFor(() => expect(calls.at(-1).query.page).toBe('2'))
    await userEvent.type(screen.getByRole('textbox', { name: 'Search notifications' }), 'email')
    await waitFor(() => expect(calls.at(-1).query).toMatchObject({ q: 'email', page: '1' }))
  })

  it('says so when a search finds nothing', async () => {
    renderPage({ 'GET /notifications': ({ query }) => [200, page(query.q ? [] : [UNREAD])] })
    await screen.findByRole('listitem', { name: /ana ruiz logged 8 h/i })
    await userEvent.type(screen.getByRole('textbox', { name: 'Search notifications' }), 'zzz')
    expect(await screen.findByText('No notifications match your search.')).toBeInTheDocument()
  })

  it('says when there is nothing new, and offers nothing to mark', async () => {
    renderPage({ 'GET /notifications': [200, page([])] })
    expect(await screen.findByText(/no notifications/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /mark all as read/i })).toBeDisabled()
  })

  it('tells an employee what reaches them: changes other people made to their own work and account', async () => {
    stubApi({ 'GET /notifications': [200, page([])] })
    renderAt(<NotificationsPage />, { path: '/notifications', auth: session(USERS.employee) })
    expect(await screen.findByText('Changes other people made to your bookings, tasks, logged time or account.')).toBeInTheDocument()
    expect(screen.queryByText(/people who report to you/i)).not.toBeInTheDocument() // an employee has no reports
  })

  it("tells a manager about their reports' changes and about changes others made to their own work", async () => {
    stubApi({ 'GET /notifications': [200, page([])] })
    renderAt(<NotificationsPage />, { path: '/notifications', auth: session(USERS.manager) })
    expect(await screen.findByText('Changes made by the people who report to you, and changes others made to your own work or account.')).toBeInTheDocument()
  })

  it('draws "Mark as read" as a button of the secondary kind, not a bare word', async () => {
    renderPage()
    const unread = await screen.findByRole('listitem', { name: /ana ruiz logged 8 h/i })
    expect(within(unread).getByRole('button', { name: /mark as read/i })).toHaveClass('MuiButton-outlined')
  })

  it('cannot mark everything as read while a search hides some of it, and can again once the search is cleared', async () => {
    const calls = renderPage()
    await screen.findByRole('listitem', { name: /ana ruiz logged 8 h/i })
    expect(screen.getByRole('button', { name: /mark all as read/i })).toBeEnabled()
    await userEvent.type(screen.getByRole('textbox', { name: 'Search notifications' }), 'ana')
    await waitFor(() => expect(calls.at(-1).query.q).toBe('ana'))
    expect(screen.getByRole('button', { name: /mark all as read/i })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Clear search' }))
    await waitFor(() => expect(screen.getByRole('button', { name: /mark all as read/i })).toBeEnabled())
  })

  it('shows a failed mark-as-read on that notification, next to its button, not in a page-wide alert', async () => {
    renderPage({ 'POST /notifications/5/read': [404, { error: 'Notification not found.' }] })
    const unread = await screen.findByRole('listitem', { name: /ana ruiz logged 8 h/i })
    await userEvent.click(within(unread).getByRole('button', { name: /mark as read/i }))
    const refusal = await within(unread).findByText('Notification not found.')
    expect(refusal).toHaveAttribute('role', 'alert')
    expect(refusal.closest('.MuiAlert-root')).toBeNull()
    expect(within(screen.getByRole('listitem', { name: /changed their email/i })).queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows a failed Mark all as read next to that button', async () => {
    renderPage({ 'POST /notifications/read-all': [500, { error: 'Could not mark them.' }] })
    await screen.findByRole('listitem', { name: /ana ruiz logged 8 h/i })
    await userEvent.click(screen.getByRole('button', { name: /mark all as read/i }))
    const refusal = await screen.findByText('Could not mark them.')
    expect(refusal).toHaveAttribute('role', 'alert')
    expect(refusal.parentElement).toBe(screen.getByRole('button', { name: /mark all as read/i }).closest('span').parentElement)
  })

  it('steps back to the last page that exists when marking the last unread one empties an unread-only page', async () => {
    let marked = false
    const calls = renderPage({
      'GET /notifications': ({ query }) => {
        const onTwo = query.page === '2'
        if (marked) return [200, onTwo ? page([], { page: 2, totalPages: 1 }) : page([READ], { totalPages: 1 })]
        return [200, page([onTwo ? UNREAD : READ], { page: Number(query.page), totalPages: 2 })]
      },
      'POST /notifications/5/read': () => { marked = true; return [200, { ...UNREAD, isRead: true }] },
    })
    await screen.findByRole('listitem', { name: /changed their email/i })
    await userEvent.click(screen.getByRole('button', { name: /go to page 2/i }))
    const unread = await screen.findByRole('listitem', { name: /ana ruiz logged 8 h/i })
    await userEvent.click(within(unread).getByRole('button', { name: /mark as read/i }))
    expect(await screen.findByRole('listitem', { name: /changed their email/i })).toBeInTheDocument()
    expect(screen.queryByText('No notifications.')).not.toBeInTheDocument()
    expect(calls.at(-1).query.page).toBe('1')
  })
})
