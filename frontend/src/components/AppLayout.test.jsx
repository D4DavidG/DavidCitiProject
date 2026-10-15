import { describe, expect, it, vi } from 'vitest'
import { act, cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AppLayout from './AppLayout'
import { request } from '../services/request'
import { USERS, renderAt, session, stubApi } from '../test/utils'

vi.mock('../theme/responsive', () => ({ useIsMobile: vi.fn(() => false) }))
const responsive = await import('../theme/responsive')

function navLabels() {
  const nav = screen.getByRole('navigation', { name: /main menu/i })
  return within(nav).getAllByRole('link').map((link) => link.textContent)
}

function renderLayout(user, auth = session(user)) {
  stubApi({ 'GET /notifications/unread-count': [200, { count: 0 }] })
  return renderAt(<AppLayout><p>page body</p></AppLayout>, { path: '/dashboard', auth })
}

describe('AppLayout', () => {
  it('gives managers the dashboard and allocation grid, not the audit log', () => {
    renderLayout(USERS.manager)
    const labels = navLabels()
    expect(labels).toEqual(expect.arrayContaining(['Dashboard', 'Allocation', 'Projects', 'Approvals', 'People']))
    expect(labels).not.toContain('Audit log')
    expect(labels).not.toContain('My tasks')
  })

  it('puts Schedule right after Allocation for managers and admins', () => {
    for (const user of [USERS.manager, USERS.admin]) {
      renderLayout(user)
      const labels = navLabels()
      expect(labels.indexOf('Schedule')).toBe(labels.indexOf('Allocation') + 1)
      cleanup()
    }
  })

  it('gives admins the audit log as well', () => {
    renderLayout(USERS.admin)
    expect(navLabels()).toContain('Audit log')
  })

  it('gives employees their tasks and projects only', () => {
    renderLayout(USERS.employee)
    const labels = navLabels()
    expect(labels).toEqual(expect.arrayContaining(['My tasks', 'Projects', 'Requests']))
    expect(labels).not.toContain('Dashboard')
    expect(labels).not.toContain('Allocation')
    expect(labels).not.toContain('Schedule')
    expect(labels).not.toContain('People')
  })

  it('puts each menu link in its own list item, so screen readers hear a list', () => {
    renderLayout(USERS.manager)
    const nav = screen.getByRole('navigation', { name: 'Main menu' })
    const links = within(nav).getAllByRole('link')
    expect(within(nav).getAllByRole('listitem')).toHaveLength(links.length)
    links.forEach((link) => expect(link.closest('li')).not.toBeNull())
  })

  it('shows who is signed in, and signs out', async () => {
    const auth = session(USERS.manager)
    renderLayout(USERS.manager, auth)
    expect(screen.getByText('Maria Lopez')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /sign out/i }))
    expect(auth.logout).toHaveBeenCalledOnce()
  })

  it('links your name to your account page', () => {
    renderLayout(USERS.manager)
    expect(screen.getByRole('link', { name: /my account/i })).toHaveAttribute('href', '/account')
  })

  it('has the notification bell in the top bar', async () => {
    renderLayout(USERS.manager)
    expect(await screen.findByRole('link', { name: /notifications, no unread/i })).toBeInTheDocument()
  })

  it('renders the page inside the layout', () => {
    renderLayout(USERS.manager)
    expect(screen.getByText('page body')).toBeInTheDocument()
  })

  it('hides the menu behind a button on phones', async () => {
    responsive.useIsMobile.mockReturnValue(true)
    renderLayout(USERS.manager)
    expect(screen.queryByRole('navigation', { name: /main menu/i })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /open menu/i }))
    expect(screen.getByRole('navigation', { name: /main menu/i })).toBeInTheDocument()
    responsive.useIsMobile.mockReturnValue(false)
  })
})

describe('AppLayout "Saved" message', () => {
  function renderWith(answers) {
    stubApi({ 'GET /notifications/unread-count': [200, { count: 0 }], ...answers })
    renderAt(<AppLayout><p>page body</p></AppLayout>, { path: '/dashboard', auth: session(USERS.manager) })
  }

  it('says "Saved" after a successful change', async () => {
    renderWith({ 'POST /projects': [201, { projectId: 9 }] })
    await act(() => request('POST', '/projects', { body: { name: 'Apollo' } }))
    expect(await screen.findByText('Saved')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Saved')
  })

  it('says nothing when the change is refused', async () => {
    renderWith({ 'PATCH /projects/1': [409, { error: 'No.' }] })
    await act(() => request('PATCH', '/projects/1', { body: {} }).catch(() => {}))
    expect(screen.queryByText('Saved')).not.toBeInTheDocument()
  })

  it('says nothing after a read', async () => {
    renderWith({ 'GET /projects': [200, { items: [] }] })
    await act(() => request('GET', '/projects'))
    expect(screen.queryByText('Saved')).not.toBeInTheDocument()
  })

  it.each(['/auth/login', '/auth/logout', '/notifications/read-all', '/notifications/5/read'])(
    'says nothing after POST %s (not a change to the work)',
    async (path) => {
      renderWith({ [`POST ${path}`]: [200, {}] })
      await act(() => request('POST', path, { body: {} }))
      expect(screen.queryByText('Saved')).not.toBeInTheDocument()
    },
  )
})
