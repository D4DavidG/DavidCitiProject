import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PeoplePage from './PeoplePage'
import { USERS, holdOpen, page, renderAt, session, stubApi } from '../../test/utils'

const MARIA = { userId: 2, username: 'ML662930', firstName: 'Maria', lastName: 'Lopez', email: 'maria.lopez@acme.test', role: 'MANAGER', jobTitle: 'Delivery lead', managerId: null, weeklyCapacityHours: 40, overtimeAllowed: false, isArchived: false, annualSalaryCents: 13_000_000 }
const BEN = { userId: 4, username: 'BO435681', firstName: 'Ben', lastName: 'Okafor', email: 'ben.okafor@acme.test', role: 'EMPLOYEE', jobTitle: 'Developer', managerId: 2, weeklyCapacityHours: 40, overtimeAllowed: false, isArchived: false, annualSalaryCents: 10_000_000 }
const DEV = { ...BEN, userId: 6, username: 'DS516414', firstName: 'Dev', lastName: 'Shah', managerId: 9, annualSalaryCents: undefined }

/** Gives jsdom (which has no clipboard) a navigator.clipboard whose writeText is the given mock. */
function stubClipboard(writeText = vi.fn().mockResolvedValue(undefined)) {
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  return writeText
}

afterEach(() => { delete navigator.clipboard })

function renderPeople(user = USERS.admin, answers = {}) {
  const calls = stubApi({ 'GET /users': [200, page([MARIA, BEN, DEV])], ...answers })
  renderAt(<PeoplePage />, { path: '/people', auth: session(user) })
  return calls
}

describe('PeoplePage', () => {
  it('lists people with username, role, capacity, and salary where the server shares it', async () => {
    renderPeople()
    const table = await screen.findByRole('table', { name: 'People' })
    expect(within(table).getByText('Ben Okafor')).toBeInTheDocument()
    expect(within(table).getByText('BO435681')).toBeInTheDocument()
    expect(within(table).getAllByText('40 h/week').length).toBeGreaterThan(0)
    expect(within(table).getByText('$100,000')).toBeInTheDocument()
  })

  it('says "Hidden" where the server does not share a salary, so it is not mistaken for none', async () => {
    renderPeople(USERS.manager)
    const table = await screen.findByRole('table', { name: 'People' })
    expect(within(table).getByText('Hidden')).toBeInTheDocument() // Dev Shah's salary isn't shared
  })

  it('searches and filters by role on the server', async () => {
    const calls = renderPeople()
    await screen.findByRole('table', { name: 'People' })
    await userEvent.type(screen.getByLabelText(/search people/i), 'okafor')
    await waitFor(() => expect(calls.at(-1).query.q).toBe('okafor'))
    await userEvent.click(screen.getByLabelText(/^role/i))
    await userEvent.click(await screen.findByRole('option', { name: 'Employees' }))
    await waitFor(() => expect(calls.at(-1).query.role).toBe('EMPLOYEE'))
  })

  it('searches as you type, with no Search button, and goes back to page 1', async () => {
    const calls = renderPeople(USERS.admin, { 'GET /users': [200, page([MARIA, BEN, DEV], { totalPages: 3 })] })
    await screen.findByRole('table', { name: 'People' })
    expect(screen.queryByRole('button', { name: /^search$/i })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /go to page 2/i }))
    await waitFor(() => expect(calls.at(-1).query.page).toBe('2'))
    await userEvent.type(screen.getByRole('textbox', { name: 'Search people' }), 'ben')
    await waitFor(() => expect(calls.at(-1).query).toMatchObject({ q: 'ben', page: '1' }))
  })

  it('creates an account and shows the generated username and password once', async () => {
    const calls = renderPeople(USERS.admin, {
      'POST /users': [201, { user: { ...BEN, userId: 7, username: 'CK971979', firstName: 'Chloe', lastName: 'Kim' }, temporaryPassword: 'Xy7kQ2mP9aLw' }],
    })
    await screen.findByRole('table', { name: 'People' })
    await userEvent.click(screen.getByRole('button', { name: /new person/i }))
    await userEvent.type(screen.getByLabelText(/first name/i), 'Chloe')
    await userEvent.type(screen.getByLabelText(/last name/i), 'Kim')
    await userEvent.type(screen.getByLabelText(/email/i), 'chloe.kim@acme.test')
    await userEvent.click(screen.getByRole('button', { name: /create/i }))
    await waitFor(() => expect(calls.find((c) => c.method === 'POST').body).toMatchObject({ firstName: 'Chloe', lastName: 'Kim', email: 'chloe.kim@acme.test', role: 'EMPLOYEE' }))
    const shown = await screen.findByRole('dialog', { name: /account created/i })
    expect(within(shown).getByText('CK971979')).toBeInTheDocument()
    expect(within(shown).getByText('Xy7kQ2mP9aLw')).toBeInTheDocument()
    expect(within(shown).getByText(/shown only once/i)).toBeInTheDocument()
  })

  it('copies the new username and password together, as two lines', async () => {
    const writeText = stubClipboard()
    renderPeople(USERS.admin, {
      'POST /users': [201, { user: { ...BEN, userId: 7, username: 'CK971979', firstName: 'Chloe', lastName: 'Kim' }, temporaryPassword: 'Xy7kQ2mP9aLw' }],
    })
    await screen.findByRole('table', { name: 'People' })
    await userEvent.click(screen.getByRole('button', { name: /new person/i }))
    await userEvent.type(screen.getByLabelText(/first name/i), 'Chloe')
    await userEvent.type(screen.getByLabelText(/last name/i), 'Kim')
    await userEvent.type(screen.getByLabelText(/email/i), 'chloe.kim@acme.test')
    await userEvent.click(screen.getByRole('button', { name: /create/i }))
    const shown = await screen.findByRole('dialog', { name: /account created/i })
    await userEvent.click(within(shown).getByRole('button', { name: 'Copy username and password' }))
    expect(writeText).toHaveBeenCalledWith('Username: CK971979\nTemporary password: Xy7kQ2mP9aLw')
    expect(within(shown).getByRole('button', { name: 'Copied' })).toBeInTheDocument()
  })

  it('copies the username and the reset password together', async () => {
    const writeText = stubClipboard()
    renderPeople(USERS.admin, { 'POST /users/4/reset-password': [200, { temporaryPassword: 'N3wTempPass12' }] })
    const table = await screen.findByRole('table', { name: 'People' })
    await userEvent.click(within(table).getByRole('button', { name: /reset password for ben okafor/i }))
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /reset password/i }))
    const shown = await screen.findByRole('dialog', { name: /password reset/i })
    await userEvent.click(within(shown).getByRole('button', { name: 'Copy username and password' }))
    expect(writeText).toHaveBeenCalledWith('Username: BO435681\nTemporary password: N3wTempPass12')
  })

  it('says so when the browser refuses to copy, instead of failing silently', async () => {
    stubClipboard(vi.fn().mockRejectedValue(new Error('denied')))
    renderPeople(USERS.admin, { 'POST /users/4/reset-password': [200, { temporaryPassword: 'N3wTempPass12' }] })
    const table = await screen.findByRole('table', { name: 'People' })
    await userEvent.click(within(table).getByRole('button', { name: /reset password for ben okafor/i }))
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /reset password/i }))
    const shown = await screen.findByRole('dialog', { name: /password reset/i })
    await userEvent.click(within(shown).getByRole('button', { name: 'Copy username and password' }))
    expect(await within(shown).findByText(/couldn't copy/i)).toBeInTheDocument()
  })

  it('lets a manager set capacity for their own reports only, and not create accounts', async () => {
    renderPeople(USERS.manager)
    const table = await screen.findByRole('table', { name: 'People' })
    expect(screen.queryByRole('button', { name: /new person/i })).not.toBeInTheDocument()
    expect(within(table).getByRole('button', { name: /capacity for ben okafor/i })).toBeInTheDocument()
    expect(within(table).queryByRole('button', { name: /capacity for dev shah/i })).not.toBeInTheDocument()
  })

  it('sets weekly capacity and overtime', async () => {
    const calls = renderPeople(USERS.manager, { 'PATCH /users/4/capacity': [200, { ...BEN, weeklyCapacityHours: 32, overtimeAllowed: true }] })
    const table = await screen.findByRole('table', { name: 'People' })
    await userEvent.click(within(table).getByRole('button', { name: /capacity for ben okafor/i }))
    const hours = screen.getByLabelText(/weekly capacity/i)
    await userEvent.clear(hours)
    await userEvent.type(hours, '32')
    await userEvent.click(screen.getByLabelText(/overtime allowed/i))
    await userEvent.click(await screen.findByRole('option', { name: 'Yes' }))
    await userEvent.click(screen.getByRole('button', { name: /save/i }))
    await waitFor(() => expect(calls.find((c) => c.method === 'PATCH').body).toEqual({ weeklyCapacityHours: 32, overtimeAllowed: true }))
  })

  it('refuses an out-of-range task limit on that box before sending anything', async () => {
    const calls = renderPeople(USERS.manager, {})
    const table = await screen.findByRole('table', { name: 'People' })
    await userEvent.click(within(table).getByRole('button', { name: /capacity for ben okafor/i }))
    const limit = screen.getByLabelText(/task limit/i)
    await userEvent.clear(limit)
    await userEvent.type(limit, '11')
    await userEvent.click(screen.getByRole('button', { name: /save/i }))
    expect(limit).toHaveAccessibleDescription('Enter a whole number from 1 to 10.')
    expect(limit).toHaveFocus()
    expect(calls.some((c) => c.method === 'PATCH')).toBe(false)
  })

  it('sets the task limit', async () => {
    const calls = renderPeople(USERS.manager, { 'PATCH /users/4/capacity': [200, BEN] })
    const table = await screen.findByRole('table', { name: 'People' })
    await userEvent.click(within(table).getByRole('button', { name: /capacity for ben okafor/i }))
    const limit = screen.getByLabelText(/task limit/i)
    await userEvent.clear(limit)
    await userEvent.type(limit, '5')
    await userEvent.click(screen.getByRole('button', { name: /save/i }))
    await waitFor(() => expect(calls.find((c) => c.method === 'PATCH').body).toEqual({ taskLimit: 5 }))
  })

  it('resets a password and shows the new one once', async () => {
    renderPeople(USERS.admin, { 'POST /users/4/reset-password': [200, { temporaryPassword: 'N3wTempPass12' }] })
    const table = await screen.findByRole('table', { name: 'People' })
    await userEvent.click(within(table).getByRole('button', { name: /reset password for ben okafor/i }))
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /reset password/i }))
    expect(await screen.findByText('N3wTempPass12')).toBeInTheDocument()
  })

  it('archives an account after confirming', async () => {
    const calls = renderPeople(USERS.admin, { 'POST /users/4/archive': [200, { ...BEN, isArchived: true }] })
    const table = await screen.findByRole('table', { name: 'People' })
    await userEvent.click(within(table).getByRole('button', { name: /archive ben okafor/i }))
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /archive account/i }))
    await waitFor(() => expect(calls.some((c) => c.path === '/users/4/archive')).toBe(true))
  })

  it('archives once, however often Archive account is pressed, and shows a refusal in the dialog', async () => {
    const calls = renderPeople(USERS.admin, { 'POST /users/4/archive': [409, { error: 'Ben Okafor manages a live project: hand it over first.' }] })
    const table = await screen.findByRole('table', { name: 'People' })
    await userEvent.click(within(table).getByRole('button', { name: /archive ben okafor/i }))
    const dialog = await screen.findByRole('dialog')
    const release = holdOpen('/users/4/archive')
    const confirm = within(dialog).getByRole('button', { name: /archive account/i })
    fireEvent.click(confirm)
    fireEvent.click(confirm)
    expect(within(dialog).getByRole('button', { name: /please wait/i })).toBeDisabled()
    release()
    expect(await within(dialog).findByText('Ben Okafor manages a live project: hand it over first.')).toBeInTheDocument()
    expect(calls.filter((c) => c.path === '/users/4/archive')).toHaveLength(1)
  })

  it('draws row buttons as the secondary kind and Archive as the danger kind, with no bare words', async () => {
    renderPeople()
    const table = await screen.findByRole('table', { name: 'People' })
    ;['Capacity for Ben Okafor', 'History for Ben Okafor', 'Edit Ben Okafor', 'Reset password for Ben Okafor'].forEach((name) => {
      const button = within(table).getByRole('button', { name })
      expect(button).toHaveClass('MuiButton-outlined')
      expect(button).not.toHaveClass('MuiButton-colorError')
    })
    expect(within(table).getByRole('button', { name: 'Archive Ben Okafor' })).toHaveClass('MuiButton-outlined', 'MuiButton-colorError')
  })

  it('steps back to the last page that exists when archiving empties the page you are on', async () => {
    let archived = false
    const calls = renderPeople(USERS.admin, {
      'GET /users': ({ query }) => {
        const onTwo = query.page === '2'
        if (archived) return [200, onTwo ? page([], { page: 2, totalPages: 1 }) : page([MARIA], { totalPages: 1 })]
        return [200, page([onTwo ? BEN : MARIA], { page: Number(query.page), totalPages: 2 })]
      },
      'POST /users/4/archive': () => { archived = true; return [200, { ...BEN, isArchived: true }] },
    })
    await screen.findByText('Maria Lopez')
    await userEvent.click(screen.getByRole('button', { name: /go to page 2/i }))
    await userEvent.click(await screen.findByRole('button', { name: 'Archive Ben Okafor' }))
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /archive account/i }))
    expect(await screen.findByText('Maria Lopez')).toBeInTheDocument()
    expect(screen.queryByText('Nobody matches.')).not.toBeInTheDocument()
    expect(calls.at(-1).query.page).toBe('1')
  })

  describe('Reactivate on an archived person', () => {
    const ANA = { ...BEN, userId: 8, username: 'AR123456', firstName: 'Ana', lastName: 'Ruiz', isArchived: true }

    function renderArchived(reactivateAnswer) {
      const calls = renderPeople(USERS.admin, { 'GET /users': [200, page([MARIA, ANA])], 'POST /users/8/reactivate': reactivateAnswer })
      const release = holdOpen('/users/8/reactivate')
      return { calls, release }
    }

    it('sends one request when pressed twice while the first is on its way', async () => {
      const { calls, release } = renderArchived([200, { ...ANA, isArchived: false }])
      const button = await screen.findByRole('button', { name: 'Reactivate Ana Ruiz' })
      fireEvent.click(button)
      fireEvent.click(button)
      release()
      await waitFor(() => expect(screen.getByRole('button', { name: 'Reactivate Ana Ruiz' })).toHaveTextContent(/^Reactivate$/))
      expect(calls.filter((c) => c.path === '/users/8/reactivate')).toHaveLength(1)
    })

    it('is disabled and reads Reactivating… while the request runs', async () => {
      const { release } = renderArchived([200, { ...ANA, isArchived: false }])
      const button = await screen.findByRole('button', { name: 'Reactivate Ana Ruiz' })
      fireEvent.click(button)
      await waitFor(() => expect(button).toBeDisabled())
      expect(button).toHaveTextContent('Reactivating…')
      release()
      await waitFor(() => expect(button).toBeEnabled())
    })

    it("shows the server's refusal and enables the button again", async () => {
      const { calls, release } = renderArchived([409, { error: 'Their line manager is archived: reactivate them first.' }])
      const button = await screen.findByRole('button', { name: 'Reactivate Ana Ruiz' })
      fireEvent.click(button)
      release()
      expect(await screen.findByText('Their line manager is archived: reactivate them first.')).toBeInTheDocument()
      expect(button).toBeEnabled()
      expect(calls.filter((c) => c.path === '/users/8/reactivate')).toHaveLength(1)
    })

    it('shows that refusal below the search and filter rows, just above the list', async () => {
      const { release } = renderArchived([409, { error: 'Their line manager is archived: reactivate them first.' }])
      fireEvent.click(await screen.findByRole('button', { name: 'Reactivate Ana Ruiz' }))
      release()
      const message = await screen.findByText('Their line manager is archived: reactivate them first.')
      const follows = (a, b) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
      expect(follows(screen.getByRole('textbox', { name: 'Search people' }), message)).toBe(true)
      expect(follows(screen.getByLabelText(/^role/i), message)).toBe(true)
      expect(follows(message, screen.getByRole('table', { name: 'People' }))).toBe(true)
    })

    it('reloads the list after it succeeds', async () => {
      const { calls, release } = renderArchived([200, { ...ANA, isArchived: false }])
      fireEvent.click(await screen.findByRole('button', { name: 'Reactivate Ana Ruiz' }))
      const listsBefore = calls.filter((c) => c.method === 'GET' && c.path === '/users').length
      release()
      await waitFor(() => expect(calls.filter((c) => c.method === 'GET' && c.path === '/users').length).toBeGreaterThan(listsBefore))
    })
  })

  it('shows History to admins on every row', async () => {
    renderPeople(USERS.admin)
    await screen.findByRole('table', { name: 'People' })
    expect(screen.getAllByRole('button', { name: /^history for/i })).toHaveLength(3)
  })

  it('shows a manager History only for their own reports', async () => {
    renderPeople(USERS.manager)
    await screen.findByRole('table', { name: 'People' })
    const buttons = screen.getAllByRole('button', { name: /^history for/i })
    expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual(['History for Ben Okafor'])
  })

  it("opens a person's history", async () => {
    const calls = renderPeople(USERS.admin, {
      'GET /users/4/history': [200, page([{ auditId: 5, actorUserId: 4, actorRole: 'EMPLOYEE', action: 'UPDATE', entityType: 'users', entityId: 4, summary: 'Ben Okafor updated their profile', createdAt: '2026-10-14T01:03:25+00:00', actorName: 'Ben Okafor' }])],
    })
    await screen.findByRole('table', { name: 'People' })
    await userEvent.click(screen.getByRole('button', { name: 'History for Ben Okafor' }))
    const dialog = await screen.findByRole('dialog', { name: 'History: Ben Okafor' })
    expect(await within(dialog).findByText('Ben Okafor updated their profile')).toBeInTheDocument()
    expect(calls.some((c) => c.path === '/users/4/history')).toBe(true)
  })
})
