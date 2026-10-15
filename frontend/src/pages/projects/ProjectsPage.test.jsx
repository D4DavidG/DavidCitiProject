import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ProjectsPage from './ProjectsPage'
import { APOLLO, MARIA } from './fixtures'
import * as responsive from '../../theme/responsive'
import { USERS, page, renderAt, session, stubApi } from '../../test/utils'

vi.mock('../../theme/responsive', () => ({ useIsMobile: vi.fn(() => false) }))

// Apollo is managed by Maria (user 2, the test manager); Zeus by someone else.
const ZEUS = { ...APOLLO, projectId: 2, name: 'Zeus', managerId: 9 }
const OLD = { ...APOLLO, projectId: 3, name: 'Old news', isArchived: true }

beforeEach(() => { responsive.useIsMobile.mockReturnValue(false) })

function renderList(user = USERS.admin, answers = {}) {
  const calls = stubApi({
    'GET /projects': [200, page([APOLLO])],
    'GET /users': [200, page([MARIA])],
    ...answers,
  })
  renderAt(<ProjectsPage />, { path: '/projects', auth: session(user) })
  return calls
}

describe('ProjectsPage', () => {
  it('lists projects with status, progress and dates', async () => {
    renderList()
    expect(await screen.findByRole('link', { name: 'Apollo' })).toHaveAttribute('href', '/projects/1')
    expect(screen.getByText('Active')).toBeInTheDocument()
    expect(screen.getByText('12%')).toBeInTheDocument()
    expect(screen.getByText('Dec 31, 2026')).toBeInTheDocument()
  })

  it('searches as you type, on the server, and goes back to page 1', async () => {
    const calls = renderList(USERS.admin, { 'GET /projects': [200, page([APOLLO], { totalPages: 3 })] })
    await screen.findByRole('link', { name: 'Apollo' })
    expect(screen.queryByRole('button', { name: /^search$/i })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /go to page 2/i }))
    await waitFor(() => expect(calls.at(-1).query.page).toBe('2'))
    await userEvent.type(screen.getByRole('textbox', { name: 'Search projects' }), 'apo')
    await waitFor(() => expect(calls.at(-1).query).toMatchObject({ q: 'apo', page: '1' }))
  })

  it('filters by status on the server', async () => {
    const calls = renderList()
    await screen.findByRole('link', { name: 'Apollo' })
    await userEvent.click(screen.getByLabelText(/^status/i))
    await userEvent.click(await screen.findByRole('option', { name: 'On hold' }))
    await waitFor(() => expect(calls.at(-1).query.status).toBe('ON_HOLD'))
  })

  it('makes the project name a real link you can reach with the keyboard (it only goes somewhere, so it is not a button)', async () => {
    renderList()
    const link = await screen.findByRole('link', { name: 'Apollo' })
    expect(link).toHaveAttribute('href', '/projects/1')
    expect(link).toHaveClass('MuiLink-root')
    expect(link).not.toHaveClass('MuiButton-root')
    expect(link).not.toHaveAttribute('tabindex', '-1')
    link.focus()
    expect(link).toHaveFocus()
  })

  it('shows the newest search even when an older, slower answer arrives last', async () => {
    renderList()
    await screen.findByRole('link', { name: 'Apollo' })
    const stubbed = globalThis.fetch
    const held = {} // q -> a function that lets that request answer
    const answer = (q) => ({ ok: true, status: 200, text: () => Promise.resolve(JSON.stringify(page([{ ...APOLLO, projectId: 7, name: `Answer for ${q}` }]))) })
    vi.stubGlobal('fetch', vi.fn((url, init) => {
      const { pathname, searchParams } = new URL(url, 'http://localhost')
      const q = searchParams.get('q')
      if (!pathname.endsWith('/projects') || !['ben', 'benjamin'].includes(q)) return stubbed(url, init)
      return new Promise((resolve) => { held[q] = () => resolve(answer(q)) })
    }))
    const box = screen.getByRole('textbox', { name: 'Search projects' })
    await userEvent.type(box, 'ben')
    await waitFor(() => expect(held.ben).toBeTypeOf('function'))
    await userEvent.type(box, 'jamin')
    await waitFor(() => expect(held.benjamin).toBeTypeOf('function'))
    held.benjamin() // the newer search answers first ...
    expect(await screen.findByRole('link', { name: 'Answer for benjamin' })).toBeInTheDocument()
    held.ben() // ... and the older one limps in afterwards
    await new Promise((resolve) => { setTimeout(resolve, 50) })
    expect(screen.getByRole('link', { name: 'Answer for benjamin' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Answer for ben' })).not.toBeInTheDocument()
  })

  it('lets admins see archived projects too', async () => {
    const calls = renderList()
    await screen.findByRole('link', { name: 'Apollo' })
    await userEvent.click(screen.getByLabelText(/show archived/i))
    await waitFor(() => expect(calls.at(-1).query.includeArchived).toBe('true'))
  })

  it('does not promise employees a budget they cannot see', async () => {
    renderList(USERS.employee)
    await screen.findByRole('link', { name: 'Apollo' })
    expect(screen.queryByText(/budget/i)).not.toBeInTheDocument()
  })

  it('offers "New project" to admins only', async () => {
    renderList(USERS.manager)
    await screen.findByRole('link', { name: 'Apollo' })
    expect(screen.queryByRole('button', { name: /new project/i })).not.toBeInTheDocument()
  })

  describe('archiving from the list', () => {
    const both = { 'GET /projects': [200, page([APOLLO, ZEUS, OLD])] }

    it('offers a manager "Request archive" only on the projects they manage', async () => {
      renderList(USERS.manager, both)
      await screen.findByRole('link', { name: 'Apollo' })
      expect(screen.getByRole('button', { name: 'Request archive for Apollo' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /request archive for zeus/i })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /request archive for old news/i })).not.toBeInTheDocument() // already archived
      expect(screen.queryByRole('button', { name: /^archive /i })).not.toBeInTheDocument() // only admins archive
    })

    it('offers an employee neither button', async () => {
      renderList(USERS.employee, both)
      await screen.findByRole('link', { name: 'Apollo' })
      expect(screen.queryByRole('button', { name: /archive/i })).not.toBeInTheDocument()
    })

    it('sends the existing archive-kind request, with the reason typed', async () => {
      const calls = renderList(USERS.manager, { ...both, 'POST /project-requests': [201, { requestId: 4 }] })
      await screen.findByRole('link', { name: 'Apollo' })
      await userEvent.click(screen.getByRole('button', { name: 'Request archive for Apollo' }))
      const dialog = await screen.findByRole('dialog', { name: /request archive of apollo/i })
      await userEvent.type(within(dialog).getByLabelText(/reason/i), 'Finished and handed over')
      await userEvent.click(within(dialog).getByRole('button', { name: /send request/i }))
      await waitFor(() => expect(calls.find((c) => c.method === 'POST').body)
        .toEqual({ kind: 'ARCHIVE_PROJECT', projectId: 1, justification: 'Finished and handed over' }))
      expect(calls.find((c) => c.method === 'POST').path).toBe('/project-requests')
      expect(await screen.findByText(/request sent.*an admin will answer it/i)).toBeInTheDocument()
    })

    it('lets the reason stay empty (the server wants a note, so one is filled in)', async () => {
      const calls = renderList(USERS.manager, { ...both, 'POST /project-requests': [201, { requestId: 4 }] })
      await screen.findByRole('link', { name: 'Apollo' })
      await userEvent.click(screen.getByRole('button', { name: 'Request archive for Apollo' }))
      const dialog = await screen.findByRole('dialog', { name: /request archive of apollo/i })
      await userEvent.click(within(dialog).getByRole('button', { name: /send request/i }))
      await waitFor(() => expect(calls.find((c) => c.method === 'POST').body)
        .toEqual({ kind: 'ARCHIVE_PROJECT', projectId: 1, justification: 'No reason given.' }))
    })

    it("shows the server's refusal inside the dialog", async () => {
      renderList(USERS.manager, { ...both, 'POST /project-requests': [409, { error: 'This project is already archived.' }] })
      await screen.findByRole('link', { name: 'Apollo' })
      await userEvent.click(screen.getByRole('button', { name: 'Request archive for Apollo' }))
      const dialog = await screen.findByRole('dialog', { name: /request archive of apollo/i })
      await userEvent.click(within(dialog).getByRole('button', { name: /send request/i }))
      expect(await within(dialog).findByText('This project is already archived.')).toBeInTheDocument()
    })

    it('offers an admin "Archive", which asks first and then archives', async () => {
      const calls = renderList(USERS.admin, { ...both, 'POST /projects/1/archive': [200, { ...APOLLO, isArchived: true }] })
      await screen.findByRole('link', { name: 'Apollo' })
      expect(screen.queryByRole('button', { name: /request archive/i })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Archive Old news' })).not.toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: 'Archive Apollo' }))
      const dialog = await screen.findByRole('dialog', { name: /archive apollo\?/i })
      expect(calls.some((c) => c.method === 'POST')).toBe(false) // nothing happens before the confirmation
      await userEvent.click(within(dialog).getByRole('button', { name: /^archive project$/i }))
      await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.path === '/projects/1/archive')).toBe(true))
      await waitFor(() => expect(calls.filter((c) => c.method === 'GET' && c.path === '/projects').length).toBe(2)) // list reloaded
    })

    it('draws Archive as the danger kind and Request archive as the secondary kind, never a bare word', async () => {
      renderList(USERS.admin, both)
      const archive = await screen.findByRole('button', { name: 'Archive Apollo' })
      expect(archive).toHaveClass('MuiButton-outlined', 'MuiButton-colorError')
      cleanup()
      renderList(USERS.manager, both)
      const request = await screen.findByRole('button', { name: 'Request archive for Apollo' })
      expect(request).toHaveClass('MuiButton-outlined')
      expect(request).not.toHaveClass('MuiButton-colorError')
    })

    it('shows the request-sent message below the search and filter rows, just above the list', async () => {
      renderList(USERS.manager, { ...both, 'POST /project-requests': [201, { requestId: 4 }] })
      await screen.findByRole('link', { name: 'Apollo' })
      await userEvent.click(screen.getByRole('button', { name: 'Request archive for Apollo' }))
      const dialog = await screen.findByRole('dialog', { name: /request archive of apollo/i })
      await userEvent.click(within(dialog).getByRole('button', { name: /send request/i }))
      const message = await screen.findByText(/request sent.*an admin will answer it/i)
      const follows = (a, b) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
      expect(follows(screen.getByRole('textbox', { name: 'Search projects' }), message)).toBe(true)
      expect(follows(screen.getByLabelText(/^status/i), message)).toBe(true)
      expect(follows(message, screen.getByRole('table', { name: 'Projects' }))).toBe(true)
    })

    it('steps back to the last page that exists when archiving empties the page you are on', async () => {
      let archived = false
      const calls = renderList(USERS.admin, {
        'GET /projects': (call) => {
          const onTwo = call.query.page === '2'
          if (archived) return [200, onTwo ? page([], { page: 2, totalPages: 1 }) : page([ZEUS], { totalPages: 1 })]
          return [200, page([onTwo ? APOLLO : ZEUS], { page: Number(call.query.page), totalPages: 2 })]
        },
        'POST /projects/1/archive': () => { archived = true; return [200, { ...APOLLO, isArchived: true }] },
      })
      await screen.findByRole('link', { name: 'Zeus' })
      await userEvent.click(screen.getByRole('button', { name: /go to page 2/i }))
      await userEvent.click(await screen.findByRole('button', { name: 'Archive Apollo' }))
      await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /^archive project$/i }))
      expect(await screen.findByRole('link', { name: 'Zeus' })).toBeInTheDocument()
      expect(screen.queryByText('No projects match.')).not.toBeInTheDocument()
      expect(calls.at(-1).query.page).toBe('1')
    })

    it('shows the same buttons on the phone cards', async () => {
      responsive.useIsMobile.mockReturnValue(true)
      renderList(USERS.manager, both)
      const list = await screen.findByRole('list', { name: 'Projects' })
      expect(within(list).getByRole('link', { name: 'Apollo' })).toBeInTheDocument()
      expect(within(list).getByRole('button', { name: 'Request archive for Apollo' })).toBeInTheDocument()
    })
  })

  it('creates a project with the budget sent in cents', async () => {
    const calls = renderList(USERS.admin, { 'POST /projects': [201, { ...APOLLO, projectId: 9, name: 'Iris' }] })
    await screen.findByRole('link', { name: 'Apollo' })
    await userEvent.click(screen.getByRole('button', { name: /new project/i }))
    await userEvent.type(screen.getByLabelText(/^name/i), 'Iris')
    await userEvent.click(screen.getByLabelText(/manager/i))
    await userEvent.click(await screen.findByRole('option', { name: 'Maria Lopez' }))
    await userEvent.type(screen.getByLabelText(/start date/i), '2026-11-01')
    await userEvent.type(screen.getByLabelText(/end date/i), '2027-01-31')
    await userEvent.type(screen.getByLabelText(/budget/i), '80,000')
    await userEvent.click(screen.getByRole('button', { name: /create/i }))
    const post = calls.find((c) => c.method === 'POST')
    expect(post.body).toEqual({ name: 'Iris', managerId: 2, startDate: '2026-11-01', predictedEndDate: '2027-01-31', budgetCents: 8_000_000 })
  })
})
