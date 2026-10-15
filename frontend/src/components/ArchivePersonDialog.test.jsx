import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ArchivePersonDialog from './ArchivePersonDialog'
import { USERS, holdOpen, page, renderAt, session, stubApi } from '../test/utils'

const BEN = { userId: 4, username: 'BO435681', firstName: 'Ben', lastName: 'Okafor' }
const APOLLO = { projectId: 1, name: 'Apollo', status: 'ACTIVE', hoursPerWeek: 20, bookingEndDate: '2026-12-31', openTaskCount: 2 }
const ZEUS = { projectId: 2, name: 'Zeus', status: 'ACTIVE', hoursPerWeek: 0, bookingEndDate: null, openTaskCount: 1 }
const ON_PROJECTS = {
  error: 'Ben Okafor is still on 1 live project: Apollo. Archiving ends their bookings there; their open tasks stay assigned to them.',
  code: 'ON_PROJECTS',
}

/** Open the dialog for Ben as an admin; returns the recorded API calls and the two callbacks. */
function renderDialog(answers = {}) {
  const calls = stubApi({ 'GET /users/4/projects': [200, page([])], 'POST /users/4/archive': [200, { ...BEN, isArchived: true }], ...answers })
  const onArchived = vi.fn()
  const onClose = vi.fn()
  renderAt(<ArchivePersonDialog person={BEN} onArchived={onArchived} onClose={onClose} />, { auth: session(USERS.admin) })
  return { calls, onArchived, onClose }
}

const dialog = () => screen.getByRole('dialog', { name: 'Archive Ben Okafor?' })

describe('ArchivePersonDialog', () => {
  it('checks which live projects they are on first, with Archive locked until it knows', async () => {
    const { calls } = renderDialog()
    const release = holdOpen('/users/4/projects')
    const confirm = within(dialog()).getByRole('button', { name: 'Archive account' })
    expect(confirm).toBeDisabled()
    expect(within(dialog()).getByText(/checking which projects they are on/i)).toBeInTheDocument()
    release()
    await waitFor(() => expect(confirm).toBeEnabled())
    expect(calls.filter((c) => c.path === '/users/4/projects')).toHaveLength(1)
  })

  it('archives someone on no live project as before: no warning, "Archive account", no body', async () => {
    const { calls, onArchived, onClose } = renderDialog()
    const confirm = within(dialog()).getByRole('button', { name: 'Archive account' })
    await waitFor(() => expect(confirm).toBeEnabled())
    expect(within(dialog()).queryByRole('alert')).not.toBeInTheDocument()
    expect(within(dialog()).getByText(/they can no longer sign in/i)).toBeInTheDocument()
    expect(confirm).toHaveClass('MuiButton-colorError')
    await userEvent.click(confirm)
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(calls.find((c) => c.path === '/users/4/archive').body).toBeUndefined()
    expect(onArchived).toHaveBeenCalledTimes(1)
  })

  it('warns in red, with a flag, naming each live project, and archives only with "Archive anyway"', async () => {
    const { calls, onClose } = renderDialog({ 'GET /users/4/projects': [200, page([APOLLO, ZEUS])] })
    const warning = await within(dialog()).findByRole('alert')
    expect(warning).toHaveClass('MuiAlert-colorError')
    expect(warning.querySelector('[data-testid="FlagOutlinedIcon"]')).not.toBeNull()
    expect(within(warning).getByText('Ben Okafor is still on 2 live projects')).toBeInTheDocument()
    expect(within(warning).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Apollo · 20 hours a week until Dec 31, 2026 · 2 open tasks',
      'Zeus · 1 open task',
    ])
    expect(within(warning).getByText('Archiving ends their bookings on these projects. Their open tasks stay assigned to them until someone reassigns them.')).toBeInTheDocument()
    // The warning comes first in the dialog, above the usual words.
    expect(warning.compareDocumentPosition(within(dialog()).getByText(/they can no longer sign in/i)) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(within(dialog()).queryByRole('button', { name: 'Archive account' })).not.toBeInTheDocument()
    const anyway = within(dialog()).getByRole('button', { name: 'Archive anyway' })
    expect(anyway).toHaveClass('MuiButton-colorError')
    await userEvent.click(anyway)
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(calls.find((c) => c.path === '/users/4/archive').body).toEqual({ confirmOnProjects: true })
  })

  it('says "1 live project" for one', async () => {
    renderDialog({ 'GET /users/4/projects': [200, page([APOLLO])] })
    expect(await within(dialog()).findByText('Ben Okafor is still on 1 live project')).toBeInTheDocument()
  })

  it('switches to the warning when the server refuses with ON_PROJECTS, reloading the list', async () => {
    let lists = 0
    const { calls, onClose } = renderDialog({
      'GET /users/4/projects': () => { lists += 1; return [200, page(lists === 1 ? [] : [APOLLO])] },
      'POST /users/4/archive': (call) => (call.body?.confirmOnProjects === true ? [200, { ...BEN, isArchived: true }] : [409, ON_PROJECTS]),
    })
    const confirm = within(dialog()).getByRole('button', { name: 'Archive account' })
    await waitFor(() => expect(confirm).toBeEnabled())
    await userEvent.click(confirm)
    // The server's words show at once; the reloaded list then takes their place.
    const title = await within(dialog()).findByText('Ben Okafor is still on 1 live project')
    expect(within(title.closest('[role="alert"]')).getByText(/^Apollo · 20 hours a week/)).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
    await userEvent.click(await within(dialog()).findByRole('button', { name: 'Archive anyway' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(calls.filter((c) => c.path === '/users/4/projects')).toHaveLength(2)
    expect(calls.filter((c) => c.path === '/users/4/archive').map((c) => c.body)).toEqual([undefined, { confirmOnProjects: true }])
  })

  it("says plainly when the list can't load, keeps Archive account, and lets the server's 409 bring the warning", async () => {
    const { calls } = renderDialog({
      'GET /users/4/projects': [503, { error: 'The database is not ready. Please try again shortly.' }],
      'POST /users/4/archive': (call) => (call.body ? [200, { ...BEN, isArchived: true }] : [409, ON_PROJECTS]),
    })
    expect(await within(dialog()).findByText(/couldn't check which projects they are on/i)).toBeInTheDocument()
    const confirm = within(dialog()).getByRole('button', { name: 'Archive account' })
    expect(confirm).toBeEnabled()
    await userEvent.click(confirm)
    // The list still fails, so the warning is the server's own words.
    const warning = await within(dialog()).findByRole('alert')
    expect(warning).toHaveTextContent(ON_PROJECTS.error)
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Archive anyway' }))
    await waitFor(() => expect(calls.filter((c) => c.path === '/users/4/archive').at(-1).body).toEqual({ confirmOnProjects: true }))
  })

  it('sends one request however often it is pressed, and shows any other refusal as one line', async () => {
    const { calls, onClose } = renderDialog({ 'POST /users/4/archive': [409, { error: 'Ben Okafor manages a live project: hand it over first.' }] })
    const confirm = within(dialog()).getByRole('button', { name: 'Archive account' })
    await waitFor(() => expect(confirm).toBeEnabled())
    const release = holdOpen('/users/4/archive')
    fireEvent.click(confirm)
    fireEvent.click(confirm)
    expect(within(dialog()).getByRole('button', { name: 'Please wait…' })).toBeDisabled()
    expect(within(dialog()).getByRole('button', { name: 'Cancel' })).toBeDisabled()
    release()
    expect(await within(dialog()).findByText('Ben Okafor manages a live project: hand it over first.')).toHaveAttribute('role', 'alert')
    expect(calls.filter((c) => c.path === '/users/4/archive')).toHaveLength(1)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('closes with Cancel and archives nobody', async () => {
    const { calls, onClose } = renderDialog({ 'GET /users/4/projects': [200, page([APOLLO])] })
    await within(dialog()).findByRole('alert')
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalled()
    expect(calls.some((c) => c.path === '/users/4/archive')).toBe(false)
  })
})
