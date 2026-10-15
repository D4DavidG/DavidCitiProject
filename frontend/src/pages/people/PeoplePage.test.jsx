import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PeoplePage from './PeoplePage'
import * as responsive from '../../theme/responsive'
import { USERS, holdOpen, page, renderAt, session, stubApi } from '../../test/utils'

vi.mock('../../theme/responsive', () => ({ useIsMobile: vi.fn(() => false) }))

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

/** Open a person's Actions menu and pick one item. */
async function choose(person, item) {
  await userEvent.click(await screen.findByRole('button', { name: `Actions for ${person}` }))
  await userEvent.click(await screen.findByRole('menuitem', { name: item }))
}

const CAPACITY = 'Capacity, overtime and task limit'

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
    await userEvent.type(await screen.findByLabelText(/first name/i), 'Chloe')
    await userEvent.type(screen.getByLabelText(/last name/i), 'Kim')
    await userEvent.type(screen.getByLabelText(/email/i), 'chloe.kim@acme.test')
    await userEvent.type(screen.getByLabelText(/annual salary/i), '52,000')
    await userEvent.click(screen.getByRole('button', { name: /create/i }))
    await waitFor(() => expect(calls.find((c) => c.method === 'POST').body).toMatchObject({ firstName: 'Chloe', lastName: 'Kim', email: 'chloe.kim@acme.test', role: 'EMPLOYEE', annualSalaryCents: 5_200_000 }))
    const shown = await screen.findByRole('dialog', { name: /account created/i })
    expect(within(shown).getByText('CK971979')).toBeInTheDocument()
    expect(within(shown).getByText('Xy7kQ2mP9aLw')).toBeInTheDocument()
    expect(within(shown).getByText(/shown only once/i)).toBeInTheDocument()
  })

  it('requires the annual salary for a new person, and says the $20-an-hour minimum under it', async () => {
    const calls = renderPeople()
    await screen.findByRole('table', { name: 'People' })
    await userEvent.click(screen.getByRole('button', { name: /new person/i }))
    const salary = await screen.findByLabelText(/annual salary/i)
    expect(salary).toBeRequired()
    expect(salary).toHaveAccessibleDescription('At least $41,600 a year ($20 an hour). The hourly rate used for project costs is salary ÷ 2,080.')
    await userEvent.type(screen.getByLabelText(/first name/i), 'Chloe')
    await userEvent.type(screen.getByLabelText(/last name/i), 'Kim')
    await userEvent.type(screen.getByLabelText(/email/i), 'chloe.kim@acme.test')
    await userEvent.click(screen.getByRole('button', { name: /create/i }))
    await waitFor(() => expect(salary).toHaveAccessibleDescription('This field is required.'))
    expect(salary).toHaveAttribute('aria-invalid', 'true')
    expect(calls.some((c) => c.method === 'POST')).toBe(false)
  })

  it("shows the server's minimum-pay refusal on the salary box itself, in red", async () => {
    const message = 'Pay must be at least $20 an hour ($41,600 a year).'
    const calls = renderPeople(USERS.admin, { 'POST /users': [400, { error: message, field: 'annualSalaryCents' }] })
    await screen.findByRole('table', { name: 'People' })
    await userEvent.click(screen.getByRole('button', { name: /new person/i }))
    await userEvent.type(await screen.findByLabelText(/first name/i), 'Chloe')
    await userEvent.type(screen.getByLabelText(/last name/i), 'Kim')
    await userEvent.type(screen.getByLabelText(/email/i), 'chloe.kim@acme.test')
    const salary = screen.getByLabelText(/annual salary/i)
    await userEvent.type(salary, '100')
    await userEvent.click(screen.getByRole('button', { name: /create/i }))
    await waitFor(() => expect(salary).toHaveAccessibleDescription(message))
    expect(salary).toHaveAttribute('aria-invalid', 'true')
    expect(salary).toHaveFocus()
    expect(document.getElementById(salary.getAttribute('aria-describedby'))).toHaveClass('Mui-error')
    expect(calls.find((c) => c.method === 'POST').body.annualSalaryCents).toBe(10_000)
    expect(screen.getByRole('dialog', { name: 'New person' })).toBeInTheDocument() // nothing created: the form stays open
  })

  it('copies the new username and password together, as two lines', async () => {
    const writeText = stubClipboard()
    renderPeople(USERS.admin, {
      'POST /users': [201, { user: { ...BEN, userId: 7, username: 'CK971979', firstName: 'Chloe', lastName: 'Kim' }, temporaryPassword: 'Xy7kQ2mP9aLw' }],
    })
    await screen.findByRole('table', { name: 'People' })
    await userEvent.click(screen.getByRole('button', { name: /new person/i }))
    await userEvent.type(await screen.findByLabelText(/first name/i), 'Chloe')
    await userEvent.type(screen.getByLabelText(/last name/i), 'Kim')
    await userEvent.type(screen.getByLabelText(/email/i), 'chloe.kim@acme.test')
    await userEvent.type(screen.getByLabelText(/annual salary/i), '52000')
    await userEvent.click(screen.getByRole('button', { name: /create/i }))
    const shown = await screen.findByRole('dialog', { name: /account created/i })
    await userEvent.click(within(shown).getByRole('button', { name: 'Copy username and password' }))
    expect(writeText).toHaveBeenCalledWith('Username: CK971979\nTemporary password: Xy7kQ2mP9aLw')
    expect(within(shown).getByRole('button', { name: 'Copied' })).toBeInTheDocument()
  })

  it('copies the username and the reset password together', async () => {
    const writeText = stubClipboard()
    renderPeople(USERS.admin, { 'POST /users/4/reset-password': [200, { temporaryPassword: 'N3wTempPass12' }] })
    await choose('Ben Okafor', 'Reset password')
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /reset password/i }))
    const shown = await screen.findByRole('dialog', { name: /password reset/i })
    await userEvent.click(within(shown).getByRole('button', { name: 'Copy username and password' }))
    expect(writeText).toHaveBeenCalledWith('Username: BO435681\nTemporary password: N3wTempPass12')
  })

  it('says so when the browser refuses to copy, instead of failing silently', async () => {
    stubClipboard(vi.fn().mockRejectedValue(new Error('denied')))
    renderPeople(USERS.admin, { 'POST /users/4/reset-password': [200, { temporaryPassword: 'N3wTempPass12' }] })
    await choose('Ben Okafor', 'Reset password')
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /reset password/i }))
    const shown = await screen.findByRole('dialog', { name: /password reset/i })
    await userEvent.click(within(shown).getByRole('button', { name: 'Copy username and password' }))
    expect(await within(shown).findByText(/couldn't copy/i)).toBeInTheDocument()
  })

  it('lets a manager set capacity for their own reports only, and not create accounts', async () => {
    renderPeople(USERS.manager)
    const table = await screen.findByRole('table', { name: 'People' })
    expect(screen.queryByRole('button', { name: /new person/i })).not.toBeInTheDocument()
    expect(within(table).queryByRole('button', { name: 'Actions for Dev Shah' })).not.toBeInTheDocument()
    await choose('Ben Okafor', CAPACITY)
    expect(await screen.findByRole('dialog', { name: 'Capacity for Ben Okafor' })).toBeInTheDocument()
  })

  it('sets weekly capacity and overtime', async () => {
    const calls = renderPeople(USERS.manager, { 'PATCH /users/4/capacity': [200, { ...BEN, weeklyCapacityHours: 32, overtimeAllowed: true }] })
    await choose('Ben Okafor', CAPACITY)
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
    await choose('Ben Okafor', CAPACITY)
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
    await choose('Ben Okafor', CAPACITY)
    const limit = screen.getByLabelText(/task limit/i)
    await userEvent.clear(limit)
    await userEvent.type(limit, '5')
    await userEvent.click(screen.getByRole('button', { name: /save/i }))
    await waitFor(() => expect(calls.find((c) => c.method === 'PATCH').body).toEqual({ taskLimit: 5 }))
  })

  it('resets a password and shows the new one once', async () => {
    renderPeople(USERS.admin, { 'POST /users/4/reset-password': [200, { temporaryPassword: 'N3wTempPass12' }] })
    await choose('Ben Okafor', 'Reset password')
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /reset password/i }))
    expect(await screen.findByText('N3wTempPass12')).toBeInTheDocument()
  })

  it('archives an account after confirming', async () => {
    const calls = renderPeople(USERS.admin, { 'POST /users/4/archive': [200, { ...BEN, isArchived: true }] })
    await choose('Ben Okafor', 'Archive')
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /archive account/i }))
    await waitFor(() => expect(calls.some((c) => c.path === '/users/4/archive')).toBe(true))
  })

  it('archives once, however often Archive account is pressed, and shows a refusal in the dialog', async () => {
    const calls = renderPeople(USERS.admin, { 'POST /users/4/archive': [409, { error: 'Ben Okafor manages a live project: hand it over first.' }] })
    await choose('Ben Okafor', 'Archive')
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

  it("gives each row one filled Actions button instead of a row of buttons, Archive last in its menu", async () => {
    renderPeople()
    const table = await screen.findByRole('table', { name: 'People' })
    const row = within(table).getByText('Ben Okafor').closest('tr')
    const buttons = within(row).getAllByRole('button')
    expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual(['Actions for Ben Okafor'])
    expect(buttons[0]).toHaveClass('MuiButton-contained')
    await userEvent.click(buttons[0])
    const items = within(await screen.findByRole('menu')).getAllByRole('menuitem')
    expect(items.at(-1)).toHaveTextContent('Archive')
  })

  it('shows names in bold', async () => {
    renderPeople()
    const table = await screen.findByRole('table', { name: 'People' })
    expect(within(table).getByText('Ben Okafor')).toHaveStyle({ fontWeight: '600' })
  })

  it('gives each phone card the same one Actions button', async () => {
    responsive.useIsMobile.mockReturnValue(true)
    renderPeople()
    const cards = await screen.findByRole('list', { name: 'People' })
    const ben = within(cards).getByText('Ben Okafor').closest('li')
    expect(within(ben).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual(['Actions for Ben Okafor'])
    responsive.useIsMobile.mockReturnValue(false)
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
    await choose('Ben Okafor', 'Archive')
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

    /** Open Ana's menu and return its Reactivate item. */
    async function reactivateItem() {
      await userEvent.click(await screen.findByRole('button', { name: 'Actions for Ana Ruiz' }))
      return screen.findByRole('menuitem', { name: 'Reactivate' })
    }

    it('sends one request when pressed twice while the first is on its way', async () => {
      const { calls, release } = renderArchived([200, { ...ANA, isArchived: false }])
      const item = await reactivateItem()
      fireEvent.click(item)
      fireEvent.click(item)
      release()
      await waitFor(() => expect(screen.getByRole('button', { name: 'Actions for Ana Ruiz' })).toHaveTextContent(/^Actions$/))
      expect(calls.filter((c) => c.path === '/users/8/reactivate')).toHaveLength(1)
    })

    it('locks her Actions button, reading Reactivating…, while the request runs', async () => {
      const { release } = renderArchived([200, { ...ANA, isArchived: false }])
      fireEvent.click(await reactivateItem())
      const button = screen.getByRole('button', { name: 'Actions for Ana Ruiz' })
      await waitFor(() => expect(button).toBeDisabled())
      expect(button).toHaveTextContent('Reactivating…')
      release()
      await waitFor(() => expect(button).toBeEnabled())
    })

    it("shows the server's refusal and enables the button again", async () => {
      const { calls, release } = renderArchived([409, { error: 'Their line manager is archived: reactivate them first.' }])
      fireEvent.click(await reactivateItem())
      release()
      expect(await screen.findByText('Their line manager is archived: reactivate them first.')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Actions for Ana Ruiz' })).toBeEnabled()
      expect(calls.filter((c) => c.path === '/users/8/reactivate')).toHaveLength(1)
    })

    it('shows that refusal in the row of the person, under their button, not in a page-wide alert', async () => {
      const { release } = renderArchived([409, { error: 'Their line manager is archived: reactivate them first.' }])
      fireEvent.click(await reactivateItem())
      release()
      const refusal = await screen.findByText('Their line manager is archived: reactivate them first.')
      expect(refusal).toHaveAttribute('role', 'alert')
      expect(refusal.closest('tr')).toBe(screen.getByRole('button', { name: 'Actions for Ana Ruiz' }).closest('tr'))
      expect(refusal.closest('.MuiAlert-root')).toBeNull()
    })

    it('reloads the list after it succeeds', async () => {
      const { calls, release } = renderArchived([200, { ...ANA, isArchived: false }])
      fireEvent.click(await reactivateItem())
      const listsBefore = calls.filter((c) => c.method === 'GET' && c.path === '/users').length
      release()
      await waitFor(() => expect(calls.filter((c) => c.method === 'GET' && c.path === '/users').length).toBeGreaterThan(listsBefore))
    })
  })

  it('gives admins an Actions menu, with History in it, on every row', async () => {
    renderPeople(USERS.admin)
    await screen.findByRole('table', { name: 'People' })
    expect(screen.getAllByRole('button', { name: /^actions for/i })).toHaveLength(3)
    await choose('Maria Lopez', 'History')
    expect(await screen.findByRole('dialog', { name: 'History: Maria Lopez' })).toBeInTheDocument()
  })

  it('shows a manager an Actions menu only for their own reports', async () => {
    renderPeople(USERS.manager)
    await screen.findByRole('table', { name: 'People' })
    const buttons = screen.getAllByRole('button', { name: /^actions for/i })
    expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual(['Actions for Ben Okafor'])
  })

  it("opens a person's history", async () => {
    const calls = renderPeople(USERS.admin, {
      'GET /users/4/history': [200, page([{ auditId: 5, actorUserId: 4, actorRole: 'EMPLOYEE', action: 'UPDATE', entityType: 'users', entityId: 4, summary: 'Ben Okafor updated their profile', createdAt: '2026-10-14T01:03:25+00:00', actorName: 'Ben Okafor' }])],
    })
    await choose('Ben Okafor', 'History')
    const dialog = await screen.findByRole('dialog', { name: 'History: Ben Okafor' })
    expect(await within(dialog).findByText('Ben Okafor updated their profile')).toBeInTheDocument()
    expect(calls.some((c) => c.path === '/users/4/history')).toBe(true)
  })
})
