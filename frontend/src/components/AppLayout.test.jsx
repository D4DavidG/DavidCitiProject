import {
  beforeAll, beforeEach, describe, expect, it, vi,
} from 'vitest'
import {
  act, cleanup, screen, waitFor, within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AppLayout from './AppLayout'
import { request } from '../services/request'
import { makeTheme } from '../theme/theme'
import { contrast } from '../test/contrast'
import { USERS, renderAt, session, stubApi } from '../test/utils'

vi.mock('../theme/responsive', () => ({ useIsMobile: vi.fn(() => false) }))
const responsive = await import('../theme/responsive')

function navLabels() {
  const nav = screen.getByRole('navigation', { name: /main menu/i })
  return within(nav).getAllByRole('link').map((link) => link.textContent)
}

function renderLayout(user, auth = session(user), theme = undefined) {
  stubApi({ 'GET /notifications/unread-count': [200, { count: 0 }] })
  return renderAt(<AppLayout><p>page body</p></AppLayout>, { path: '/dashboard', auth, theme })
}

// The first render in a file pays MUI's one-time style setup for the whole bar (search, bell, menu):
// over 5 s on a busy 2-CPU machine with coverage on (15 Oct), which timed out whichever test came first.
// Pay it once here, under the hook's own 10 s limit, so each test times only itself.
beforeAll(() => {
  renderLayout(USERS.manager)
  cleanup()
  vi.unstubAllGlobals()
})

beforeEach(() => {
  localStorage.clear()
  responsive.useIsMobile.mockReturnValue(false) // a phone test that fails part way must not leave the rest on a phone
})

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

  it('gives employees their own Dashboard (their tasks page) and projects only', () => {
    renderLayout(USERS.employee)
    const labels = navLabels()
    expect(labels).toEqual(expect.arrayContaining(['Dashboard', 'Projects', 'Requests']))
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/my-tasks')
    expect(labels).not.toContain('My tasks')
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

  it('puts the ACME logo and the dark mode switch in the top bar', () => {
    renderLayout(USERS.manager)
    const bar = screen.getByRole('banner')
    expect(within(bar).getByRole('img', { name: 'ACME' })).toBeInTheDocument()
    expect(within(bar).getByRole('button', { name: 'Switch to dark mode' })).toBeInTheDocument()
  })

  it('puts the search for pages and projects in the top bar, after the logo', () => {
    renderLayout(USERS.manager)
    const bar = screen.getByRole('banner')
    const search = within(bar).getByRole('combobox', { name: 'Search pages and projects' })
    const logo = within(bar).getByRole('img', { name: 'ACME' })
    expect(logo.compareDocumentPosition(search) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('makes the search a button in the top bar on phones', async () => {
    responsive.useIsMobile.mockReturnValue(true)
    renderLayout(USERS.manager)
    const bar = screen.getByRole('banner')
    expect(within(bar).queryByRole('combobox')).not.toBeInTheDocument()
    await userEvent.click(within(bar).getByRole('button', { name: 'Search pages and projects' }))
    expect(within(bar).getByRole('combobox', { name: 'Search pages and projects' })).toHaveFocus()
  })

  it.each([['light', '#165E26', '#FFFFFF'], ['dark', '#165E26', '#FFFFFF']])(
    'paints the top bar the one forest green with white words, in both modes (%s)',
    (mode, background, words) => {
      renderLayout(USERS.manager, session(USERS.manager), makeTheme(mode))
      // MUI paints the bar through two CSS variables (jsdom does not resolve var()).
      const bar = getComputedStyle(screen.getByRole('banner'))
      expect(bar.backgroundColor).toBe('var(--AppBar-background)')
      expect([bar.getPropertyValue('--AppBar-background'), bar.getPropertyValue('--AppBar-color')]).toEqual([background, words])
    },
  )

  it.each(['light', 'dark'])('draws the logo in the bar\'s white words, its gold tip standing out from the green (%s)', (mode) => {
    renderLayout(USERS.manager, session(USERS.manager), makeTheme(mode))
    const bar = screen.getByRole('banner')
    const [background, words] = ['--AppBar-background', '--AppBar-color'].map((name) => getComputedStyle(bar).getPropertyValue(name))
    const tip = within(bar).getByRole('img', { name: 'ACME' }).querySelector('[data-part="tip"]')
    expect(contrast(tip.getAttribute('fill'), background)).toBeGreaterThanOrEqual(3)
    expect(contrast(words, background)).toBeGreaterThanOrEqual(4.5)
  })

  it('keeps the top bar\'s words bare: your name, your role and Sign out have no box, border or chip (spec 6.2)', () => {
    renderLayout(USERS.manager)
    const bar = screen.getByRole('banner')
    for (const control of [screen.getByRole('link', { name: /my account/i }), screen.getByRole('button', { name: /sign out/i })]) {
      expect(control).toHaveClass('MuiButton-text')
      expect(getComputedStyle(control).borderStyle).not.toBe('solid')
    }
    expect(within(bar).getByText('Manager')).toBeInTheDocument()
    expect(bar.querySelector('.MuiChip-root')).toBeNull()
  })

  it('draws the keyboard focus ring in the bar\'s own text colour inside the top bar', async () => {
    renderLayout(USERS.manager)
    await userEvent.tab() // the first control in the bar: the search
    await userEvent.tab() // then the light/dark switch
    expect(screen.getByRole('button', { name: 'Switch to dark mode' })).toHaveClass('Mui-focusVisible')
    // jsdom resolves currentColor whether or not a rule sets it, so read the rule the bar adds.
    const bar = [...screen.getByRole('banner').classList].find((name) => name.startsWith('css-'))
    const css = [...document.querySelectorAll('style')].map((tag) => tag.textContent).join('')
    expect(css).toContain(`.${bar} .MuiButtonBase-root.Mui-focusVisible{outline-color:currentColor;}`)
  })

  it.each([
    [/^notifications, no unread$/i, 'Notifications, no unread'],
    [/switch to dark mode/i, 'Switch to dark mode'],
    [/collapse menu/i, 'Collapse menu'],
  ])('gives the icon-only button %s a tooltip', async (name, tip) => {
    renderLayout(USERS.manager)
    const button = await screen.findByRole(name.source.startsWith('^notif') ? 'link' : 'button', { name })
    expect(button.textContent).toMatch(/^\d*$/) // icon only (the bell's hidden badge holds its count)
    await userEvent.hover(button)
    expect(await screen.findByRole('tooltip')).toHaveTextContent(tip)
  })

  it('gives the phone menu button a tooltip', async () => {
    responsive.useIsMobile.mockReturnValue(true)
    renderLayout(USERS.manager)
    await userEvent.hover(screen.getByRole('button', { name: 'Open menu' }))
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Open menu')
    responsive.useIsMobile.mockReturnValue(false)
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

  it('makes My account in the phone menu a filled button like every other', async () => {
    responsive.useIsMobile.mockReturnValue(true)
    renderLayout(USERS.manager)
    await userEvent.click(screen.getByRole('button', { name: /open menu/i }))
    const account = screen.getByRole('link', { name: 'My account' })
    expect(account).toHaveClass('MuiButton-contained')
    expect(getComputedStyle(account).paddingLeft).not.toBe('0px')
    responsive.useIsMobile.mockReturnValue(false)
  })
})

describe('the collapsible menu (desktop)', () => {
  const paper = () => screen.getByRole('navigation', { name: 'Main menu' }).closest('.MuiDrawer-paper')

  it('collapses from a bookmark tab sticking out of the menu\'s edge near the top, not a button at its foot', () => {
    renderLayout(USERS.manager)
    const tab = screen.getByRole('button', { name: 'Collapse menu' })
    expect(paper().contains(tab)).toBe(false) // it sticks out of the menu, so it sits outside the menu's panel
    expect(tab).toHaveStyle({ position: 'fixed', left: '240px', borderRadius: '0 8px 8px 0' })
  })

  it('moves the tab with the menu\'s edge when it shrinks', async () => {
    renderLayout(USERS.manager)
    await userEvent.click(screen.getByRole('button', { name: 'Collapse menu' }))
    expect(screen.getByRole('button', { name: 'Expand menu' })).toHaveStyle({ left: '64px' })
  })

  it('shrinks to icons; each icon keeps its name and a tooltip', async () => {
    renderLayout(USERS.manager)
    expect(paper()).toHaveStyle({ width: '240px' })
    await userEvent.click(screen.getByRole('button', { name: 'Collapse menu' }))
    expect(paper()).toHaveStyle({ width: '64px' })
    expect(screen.queryByText('Projects')).toBeNull() // no words, icons only
    const projects = screen.getByRole('link', { name: 'Projects' })
    expect(projects.closest('li')).not.toBeNull() // still one list item per link
    await userEvent.hover(projects)
    await waitFor(() => expect(screen.getAllByRole('tooltip').map((tip) => tip.textContent)).toContain('Projects'))
    await userEvent.click(screen.getByRole('button', { name: 'Expand menu' }))
    expect(paper()).toHaveStyle({ width: '240px' })
    expect(within(screen.getByRole('navigation', { name: 'Main menu' })).getByText('Projects')).toBeInTheDocument()
  })

  it('remembers the choice for next time', async () => {
    const { unmount } = renderLayout(USERS.manager)
    await userEvent.click(screen.getByRole('button', { name: 'Collapse menu' }))
    unmount()
    renderLayout(USERS.manager)
    expect(screen.getByRole('button', { name: 'Expand menu' })).toBeInTheDocument()
    expect(paper()).toHaveStyle({ width: '64px' })
  })

  it('still collapses when the browser blocks storage', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    renderLayout(USERS.manager)
    await userEvent.click(screen.getByRole('button', { name: 'Collapse menu' }))
    expect(paper()).toHaveStyle({ width: '64px' })
  })

  it('is not offered on phones, which keep the drawer', () => {
    responsive.useIsMobile.mockReturnValue(true)
    renderLayout(USERS.manager)
    expect(screen.queryByRole('button', { name: /collapse menu|expand menu/i })).toBeNull()
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

  it.each([[true, 'phones'], [false, 'desktop']])(
    'sits at the top centre, so it never covers the bell\'s pop-up at the bottom (%s: %s)',
    async (mobile) => {
      responsive.useIsMobile.mockReturnValue(mobile)
      renderWith({ 'POST /projects': [201, { projectId: 9 }] })
      await act(() => request('POST', '/projects', { body: { name: 'Apollo' } }))
      expect((await screen.findByText('Saved')).closest('.MuiSnackbar-root')).toHaveClass('MuiSnackbar-anchorOriginTopCenter')
      responsive.useIsMobile.mockReturnValue(false)
    },
  )

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
