import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useLocation } from 'react-router'
import TopSearch from './TopSearch'
import { FIELD, matchPages } from './searchPages'
import { contrast } from '../test/contrast'
import { makeTheme } from '../theme/theme'
import { USERS, page, renderAt, session, stubApi } from '../test/utils'

vi.mock('../theme/responsive', () => ({ useIsMobile: vi.fn(() => false) }))
const responsive = await import('../theme/responsive')

const APOLLO = { projectId: 1, name: 'Apollo', status: 'ACTIVE' }
const APEX = { projectId: 7, name: 'Apex Upgrade', status: 'PLANNING' }

/** The server's project search: a name match, case-insensitive, like `p.name ILIKE`. */
function search({ query }) {
  const q = (query.q ?? '').toLowerCase()
  return [200, page([APOLLO, APEX].filter((p) => p.name.toLowerCase().includes(q)))]
}

/** Where the router is now, so a test can see where choosing something went. */
function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>
}

function renderSearch(user = USERS.manager, answers = { 'GET /projects': search }) {
  const calls = stubApi(answers)
  renderAt(<><TopSearch /><Where /><input aria-label="Some other field" /></>, { path: '/dashboard', auth: session(user) })
  return { calls, projectCalls: () => calls.filter((c) => c.path === '/projects') }
}

const box = () => screen.getByRole('combobox', { name: 'Search pages and projects' })
/** The open list's groups: { Pages: [...], Projects: [...] } by their headings. */
function groups() {
  const list = screen.getByRole('listbox')
  return Object.fromEntries([...list.querySelectorAll(':scope > li')].map((group) => [
    group.querySelector('.MuiAutocomplete-groupLabel').textContent,
    within(group).getAllByRole('option').map((o) => o.textContent),
  ]))
}
const where = () => screen.getByTestId('where').textContent

beforeEach(() => {
  responsive.useIsMobile.mockReturnValue(false)
})

describe('matchPages', () => {
  it("finds the role's pages by name, ignoring case", () => {
    expect(matchPages('ALLOC', 'MANAGER').map((p) => p.label)).toEqual(['Allocation'])
    expect(matchPages('people', 'EMPLOYEE')).toEqual([]) // not one of an employee's pages
  })

  it('knows a few other words for a page: home, time, history', () => {
    expect(matchPages('home', 'MANAGER').map((p) => p.to)).toContain('/dashboard')
    expect(matchPages('home', 'EMPLOYEE').map((p) => p.to)).toContain('/my-tasks')
    expect(matchPages('time', 'MANAGER').map((p) => p.label)).toContain('Approvals')
    expect(matchPages('history', 'ADMIN').map((p) => p.label)).toContain('Audit log')
    expect(matchPages('history', 'MANAGER').map((p) => p.label)).not.toContain('Audit log')
  })

  it('offers My account to everyone', () => {
    for (const role of ['ADMIN', 'MANAGER', 'EMPLOYEE']) expect(matchPages('account', role).map((p) => p.to)).toEqual(['/account'])
  })

  it('puts a page whose name starts with the words before one that only matches another word', () => {
    expect(matchPages('a', 'MANAGER')[0].label).toBe('Allocation')
  })
})

describe('TopSearch', () => {
  it('is a combobox named "Search pages and projects", with that placeholder', () => {
    renderSearch()
    expect(box()).toHaveAttribute('placeholder', 'Search pages and projects')
  })

  it('shows matching pages and projects in two groups, Pages then Projects', async () => {
    const { projectCalls } = renderSearch()
    await userEvent.type(box(), 'ap')
    await waitFor(() => expect(groups()).toEqual({ Pages: ['Approvals'], Projects: ['Apollo', 'Apex Upgrade'] }))
    expect(projectCalls().map((c) => c.query)).toEqual([{ q: 'ap', pageSize: '5' }])
  })

  it('asks the server about projects only from 2 characters, and once you pause, not on every key', async () => {
    const { projectCalls } = renderSearch()
    await userEvent.type(box(), 'a')
    await screen.findByRole('option', { name: 'Allocation' })
    await new Promise((done) => { setTimeout(done, 400) })
    expect(projectCalls()).toHaveLength(0)
    await userEvent.type(box(), 'pol')
    await screen.findByRole('option', { name: 'Apollo' })
    expect(projectCalls().map((c) => c.query.q)).toEqual(['apol'])
  })

  it('ignores a slow answer for an older search ("ap") that lands after the newer one ("apex")', async () => {
    renderSearch()
    const stubbed = globalThis.fetch
    let release
    const gate = new Promise((resolve) => { release = resolve })
    vi.stubGlobal('fetch', vi.fn((url, init) => (new URL(url, 'http://localhost').searchParams.get('q') === 'ap'
      ? gate.then(() => stubbed(url, init)) : stubbed(url, init))))
    await userEvent.type(box(), 'ap')
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(1))
    await userEvent.type(box(), 'ex')
    await waitFor(() => expect(groups()).toEqual({ Projects: ['Apex Upgrade'] }))
    release()
    await new Promise((done) => { setTimeout(done, 50) })
    expect(groups()).toEqual({ Projects: ['Apex Upgrade'] }) // Apollo, from the older search, never shows
  })

  it('opens a project when you choose it, then clears the box', async () => {
    renderSearch()
    await userEvent.type(box(), 'apol')
    await userEvent.click(await screen.findByRole('option', { name: 'Apollo' }))
    expect(where()).toBe('/projects/1')
    expect(box()).toHaveValue('')
  })

  it('goes to a page with the arrow keys and Enter, then clears the box', async () => {
    renderSearch()
    await userEvent.type(box(), 'sched')
    await screen.findByRole('option', { name: 'Schedule' })
    await userEvent.keyboard('{ArrowDown}{Enter}')
    expect(where()).toBe('/schedule')
    expect(box()).toHaveValue('')
  })

  it("takes an employee to their own Dashboard and never offers a manager's page", async () => {
    renderSearch(USERS.employee)
    await userEvent.type(box(), 'dash')
    await waitFor(() => expect(groups()).toEqual({ Pages: ['Dashboard'] }))
    await userEvent.keyboard('{Enter}')
    expect(where()).toBe('/my-tasks')
  })

  it('says so when nothing matches', async () => {
    renderSearch()
    await userEvent.type(box(), 'zzz')
    expect(await screen.findByText('No pages or projects match')).toBeInTheDocument()
  })

  it('still shows the matching pages when the project search fails', async () => {
    const { projectCalls } = renderSearch(USERS.manager, { 'GET /projects': [500, { error: 'Something went wrong.' }] })
    await userEvent.type(box(), 'approv')
    await waitFor(() => expect(projectCalls()).toHaveLength(1))
    await waitFor(() => expect(groups()).toEqual({ Pages: ['Approvals'] }))
    expect(screen.queryByText('Something went wrong.')).not.toBeInTheDocument()
  })

  it('closes on Escape', async () => {
    renderSearch()
    await userEvent.type(box(), 'alloc')
    await screen.findByRole('listbox')
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument())
  })

  it('takes focus on "/" when you are not typing in a field, and on Ctrl+K or Cmd+K anywhere', async () => {
    renderSearch()
    fireEvent.keyDown(document.body, { key: '/' })
    expect(box()).toHaveFocus()
    box().blur()
    const other = screen.getByRole('textbox', { name: 'Some other field' })
    other.focus()
    fireEvent.keyDown(other, { key: '/' })
    expect(other).toHaveFocus() // a "/" typed in a field stays there
    fireEvent.keyDown(other, { key: 'k', ctrlKey: true })
    expect(box()).toHaveFocus()
    box().blur()
    fireEvent.keyDown(document.body, { key: 'k', metaKey: true })
    expect(box()).toHaveFocus()
  })

  it('ignores a keydown with no key (a browser filling in a saved password sends one)', () => {
    renderSearch()
    const keyless = new KeyboardEvent('keydown', { bubbles: true, ctrlKey: true })
    Object.defineProperty(keyless, 'key', { value: undefined })
    const errors = []
    const onError = (event) => { errors.push(event.error); event.preventDefault() }
    window.addEventListener('error', onError)
    document.body.dispatchEvent(keyless)
    window.removeEventListener('error', onError)
    expect(errors).toEqual([])
    expect(box()).not.toHaveFocus()
  })

  it('is a white rounded field with dark words on the green bar', () => {
    renderSearch()
    const field = box().closest('.MuiOutlinedInput-root')
    expect(field).toHaveStyle({ backgroundColor: 'rgb(255, 255, 255)', color: 'rgb(22, 26, 22)', borderRadius: '8px' })
  })

  it.each(['light', 'dark'])('keeps its words, placeholder and focus border readable on it, and it on the bar (%s)', (mode) => {
    const bar = makeTheme(mode).palette.header.main
    expect(contrast(FIELD.ink, FIELD.background)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(FIELD.placeholder, FIELD.background)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(FIELD.focus, FIELD.background)).toBeGreaterThanOrEqual(3)
    expect(contrast(FIELD.background, bar)).toBeGreaterThanOrEqual(3)
  })
})

describe('TopSearch on a phone', () => {
  beforeEach(() => {
    responsive.useIsMobile.mockReturnValue(true)
  })

  it('is a search button that opens the box full width, with focus in it', async () => {
    renderSearch()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Search pages and projects' }))
    expect(box()).toHaveFocus()
    await userEvent.type(box(), 'apol')
    await userEvent.click(await screen.findByRole('option', { name: 'Apollo' }))
    expect(where()).toBe('/projects/1')
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument() // closed again after choosing
  })

  it("covers the whole bar above the bell's count, so the count never shows through", async () => {
    renderSearch()
    await userEvent.click(screen.getByRole('button', { name: 'Search pages and projects' }))
    const across = screen.getByTestId('search-across-bar')
    expect(across).toHaveStyle({ position: 'absolute', top: '0px', left: '0px', right: '0px', bottom: '0px' })
    expect(Number(getComputedStyle(across).zIndex)).toBeGreaterThan(1) // a Badge's count sits at z-index 1
  })

  it('closes with its Close search button or Escape', async () => {
    renderSearch()
    await userEvent.click(screen.getByRole('button', { name: 'Search pages and projects' }))
    await userEvent.click(screen.getByRole('button', { name: 'Close search' }))
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Search pages and projects' }))
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })
})
