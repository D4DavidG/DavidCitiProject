import { describe, expect, it } from 'vitest'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PersonActions from './PersonActions'
import theme from '../theme/theme'
import { USERS, holdOpen, page, renderAt, session, stubApi } from '../test/utils'

const MARIA = { userId: 2, username: 'ML662930', firstName: 'Maria', lastName: 'Lopez', email: 'maria.lopez@acme.test', role: 'MANAGER', jobTitle: 'Delivery lead', managerId: null, weeklyCapacityHours: 40, overtimeAllowed: false, taskLimit: 2, isArchived: false }
const BEN = { userId: 4, username: 'BO435681', firstName: 'Ben', lastName: 'Okafor', email: 'ben.okafor@acme.test', role: 'EMPLOYEE', jobTitle: 'Developer', managerId: 2, weeklyCapacityHours: 40, overtimeAllowed: false, taskLimit: 2, isArchived: false }
const DEV = { ...BEN, userId: 6, username: 'DS516414', firstName: 'Dev', lastName: 'Shah', managerId: 9 }
const ADMIN_RECORD = { ...BEN, userId: 1, username: 'AD000001', firstName: 'System', lastName: 'Administrator', role: 'ADMIN', managerId: null }

/** Render the menu for one person, signed in as `user`; returns the recorded API calls. */
function renderActions(props, { user = USERS.admin, answers = {} } = {}) {
  const calls = stubApi({ 'GET /users': [200, page([MARIA])], ...answers })
  renderAt(<PersonActions {...props} />, { auth: session(user) })
  return calls
}

/** Open the menu and return the names of its items, top to bottom. */
async function menuItems(name) {
  await userEvent.click(screen.getByRole('button', { name: `Actions for ${name}` }))
  const menu = await screen.findByRole('menu')
  return within(menu).getAllByRole('menuitem').map((item) => item.textContent)
}

describe('PersonActions', () => {
  it('is one filled Actions button with a down arrow, that says it opens a menu', () => {
    renderActions({ person: BEN })
    const button = screen.getByRole('button', { name: 'Actions for Ben Okafor' })
    expect(button).toHaveTextContent(/^Actions$/)
    expect(button).toHaveClass('MuiButton-contained')
    expect(button).not.toHaveClass('MuiButton-colorError')
    expect(button).toHaveAttribute('aria-haspopup', 'true')
    expect(button.querySelector('.MuiButton-endIcon svg')).not.toBeNull()
  })

  it("gives an admin every action on someone else, with Archive last", async () => {
    renderActions({ person: BEN })
    expect(await menuItems('Ben Okafor')).toEqual([
      'Capacity, overtime and task limit', 'History', 'Edit details', 'Reset password', 'Archive',
    ])
  })

  it('writes Archive in red words, and nothing else', async () => {
    renderActions({ person: BEN })
    await menuItems('Ben Okafor')
    expect(screen.getByRole('menuitem', { name: 'Archive' })).toHaveStyle({ color: theme.palette.error.main })
    expect(screen.getByRole('menuitem', { name: 'History' })).not.toHaveStyle({ color: theme.palette.error.main })
  })

  // A hover or focus wash under the red words would drop them below 4.5:1 (3.2:1 in dark mode),
  // so Archive keeps a flat background and shows hover with an underline (the focus ring shows focus).
  it('keeps the red words readable on hover and focus: no wash, an underline instead', async () => {
    renderActions({ person: BEN })
    await menuItems('Ben Okafor')
    const scope = [...screen.getByRole('menuitem', { name: 'Archive' }).classList].find((name) => name.startsWith('css-'))
    const css = [...document.querySelectorAll('style')].map((tag) => tag.textContent).join('')
    expect(css).toMatch(new RegExp(`\\.${scope}:hover,\\.${scope}\\.Mui-focusVisible\\{[^}]*background-color:transparent;[^}]*text-decoration:underline`))
  })

  it('never offers an admin Reset password or Archive on their own account', async () => {
    renderActions({ person: ADMIN_RECORD })
    expect(await menuItems('System Administrator')).toEqual(['Capacity, overtime and task limit', 'History', 'Edit details'])
  })

  it('offers History and Reactivate on an archived person, and nothing that changes them', async () => {
    renderActions({ person: { ...BEN, isArchived: true } })
    expect(await menuItems('Ben Okafor')).toEqual(['History', 'Reactivate'])
  })

  it("gives a manager capacity and history for their own report, and no admin actions", async () => {
    renderActions({ person: BEN }, { user: USERS.manager })
    expect(await menuItems('Ben Okafor')).toEqual(['Capacity, overtime and task limit', 'History'])
  })

  it("shows no button at all to a manager for someone who isn't their report", () => {
    renderActions({ person: DEV }, { user: USERS.manager })
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('opens the dialog of the chosen action and tells the page when it saved', async () => {
    let changed = 0
    const calls = renderActions({ person: BEN, onChanged: () => { changed += 1 } }, { answers: { 'PATCH /users/4/capacity': [200, BEN] } })
    await menuItems('Ben Okafor')
    await userEvent.click(screen.getByRole('menuitem', { name: 'Capacity, overtime and task limit' }))
    const dialog = await screen.findByRole('dialog', { name: 'Capacity for Ben Okafor' })
    const limit = within(dialog).getByLabelText(/task limit/i)
    await userEvent.clear(limit)
    await userEvent.type(limit, '4')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(calls.find((c) => c.method === 'PATCH').body).toEqual({ taskLimit: 4 }))
    await waitFor(() => expect(changed).toBe(1))
  })

  it('edits an account with the line-manager list loaded first', async () => {
    const calls = renderActions({ person: BEN }, { answers: { 'PATCH /users/4': [200, { ...BEN, jobTitle: 'Senior developer' }] } })
    await menuItems('Ben Okafor')
    await userEvent.click(screen.getByRole('menuitem', { name: 'Edit details' }))
    const dialog = await screen.findByRole('dialog', { name: 'Edit Ben Okafor' })
    expect(calls.some((c) => c.path === '/users' && c.query.role === 'MANAGER')).toBe(true)
    expect(within(dialog).getByRole('combobox', { name: /line manager/i })).toHaveTextContent('Maria Lopez')
    const title = within(dialog).getByLabelText(/job title/i)
    await userEvent.clear(title)
    await userEvent.type(title, 'Senior developer')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(calls.find((c) => c.method === 'PATCH').body).toEqual({ jobTitle: 'Senior developer' }))
  })

  it("won't clear a salary on edit: the box is required, with the $20-an-hour minimum under it", async () => {
    const calls = renderActions({ person: { ...BEN, annualSalaryCents: 10_000_000 } })
    await menuItems('Ben Okafor')
    await userEvent.click(screen.getByRole('menuitem', { name: 'Edit details' }))
    const dialog = await screen.findByRole('dialog', { name: 'Edit Ben Okafor' })
    const salary = within(dialog).getByLabelText(/annual salary/i)
    expect(salary).toBeRequired()
    expect(salary).toHaveAccessibleDescription(/^At least \$41,600 a year \(\$20 an hour\)\./)
    await userEvent.clear(salary)
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(salary).toHaveAccessibleDescription('This field is required.'))
    expect(calls.some((c) => c.method === 'PATCH')).toBe(false)
  })

  it('archives after a confirm whose button is the red kind', async () => {
    const calls = renderActions({ person: BEN }, { answers: { 'POST /users/4/archive': [200, { ...BEN, isArchived: true }] } })
    await menuItems('Ben Okafor')
    await userEvent.click(screen.getByRole('menuitem', { name: 'Archive' }))
    const confirm = within(await screen.findByRole('dialog')).getByRole('button', { name: 'Archive account' })
    expect(confirm).toHaveClass('MuiButton-colorError')
    await userEvent.click(confirm)
    await waitFor(() => expect(calls.some((c) => c.path === '/users/4/archive')).toBe(true))
  })

  it('reactivates in one press: the button is locked and reads Reactivating… until the answer', async () => {
    const calls = renderActions({ person: { ...BEN, isArchived: true } }, { answers: { 'POST /users/4/reactivate': [200, BEN] } })
    const release = holdOpen('/users/4/reactivate')
    await menuItems('Ben Okafor')
    const item = screen.getByRole('menuitem', { name: 'Reactivate' })
    fireEvent.click(item)
    fireEvent.click(item)
    const button = screen.getByRole('button', { name: 'Actions for Ben Okafor' })
    await waitFor(() => expect(button).toBeDisabled())
    expect(button).toHaveTextContent('Reactivating…')
    release()
    await waitFor(() => expect(button).toBeEnabled())
    expect(calls.filter((c) => c.path === '/users/4/reactivate')).toHaveLength(1)
  })

  it("shows a refused Reactivate under the person's button, and unlocks it", async () => {
    renderActions({ person: { ...BEN, isArchived: true } }, { answers: { 'POST /users/4/reactivate': [409, { error: 'Their line manager is archived: reactivate them first.' }] } })
    await menuItems('Ben Okafor')
    await userEvent.click(screen.getByRole('menuitem', { name: 'Reactivate' }))
    const refusal = await screen.findByText('Their line manager is archived: reactivate them first.')
    expect(refusal).toHaveAttribute('role', 'alert')
    expect(screen.getByRole('button', { name: 'Actions for Ben Okafor' })).toBeEnabled()
  })

  describe('opened from a row without the full record (the Allocation grid)', () => {
    it("shows the person's name on the button and loads their record when opened", async () => {
      const calls = renderActions({ userId: 4, name: 'Ben Okafor', label: 'Ben Okafor' }, { answers: { 'GET /users/4': [200, BEN] } })
      const button = screen.getByRole('button', { name: 'Actions for Ben Okafor' })
      expect(button).toHaveTextContent(/^Ben Okafor$/)
      expect(calls.some((c) => c.path === '/users/4')).toBe(false)
      expect(await menuItems('Ben Okafor')).toEqual([
        'Capacity, overtime and task limit', 'History', 'Edit details', 'Reset password', 'Archive',
      ])
      expect(calls.filter((c) => c.path === '/users/4')).toHaveLength(1)
    })

    it('says Loading… in the menu until the record arrives', async () => {
      renderActions({ userId: 4, name: 'Ben Okafor' }, { answers: { 'GET /users/4': [200, BEN] } })
      const release = holdOpen('/users/4')
      await userEvent.click(screen.getByRole('button', { name: 'Actions for Ben Okafor' }))
      expect(await screen.findByRole('menuitem', { name: 'Loading…' })).toHaveAttribute('aria-disabled', 'true')
      release()
      expect(await screen.findByRole('menuitem', { name: 'History' })).toBeInTheDocument()
    })

    it('says when there is nothing this manager may do for the person', async () => {
      renderActions({ userId: 6, name: 'Dev Shah' }, { user: USERS.manager, answers: { 'GET /users/6': [200, DEV] } })
      await userEvent.click(screen.getByRole('button', { name: 'Actions for Dev Shah' }))
      expect(await screen.findByRole('menuitem', { name: /only their line manager or an admin/i })).toHaveAttribute('aria-disabled', 'true')
    })

    it("offers to try again when the record can't be loaded", async () => {
      let attempts = 0
      renderActions({ userId: 4, name: 'Ben Okafor' }, {
        answers: { 'GET /users/4': () => { attempts += 1; return attempts === 1 ? [503, { error: 'Try later.' }] : [200, BEN] } },
      })
      await userEvent.click(screen.getByRole('button', { name: 'Actions for Ben Okafor' }))
      await userEvent.click(await screen.findByRole('menuitem', { name: /couldn't load.*try again/i }))
      expect(await screen.findByRole('menuitem', { name: 'History' })).toBeInTheDocument()
    })
  })
})
