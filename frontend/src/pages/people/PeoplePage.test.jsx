import { describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PeoplePage from './PeoplePage'
import { USERS, page, renderAt, session, stubApi } from '../../test/utils'

const MARIA = { userId: 2, username: 'ML662930', firstName: 'Maria', lastName: 'Lopez', email: 'maria.lopez@acme.test', role: 'MANAGER', jobTitle: 'Delivery lead', managerId: null, weeklyCapacityHours: 40, overtimeAllowed: false, isArchived: false, annualSalaryCents: 13_000_000 }
const BEN = { userId: 4, username: 'BO435681', firstName: 'Ben', lastName: 'Okafor', email: 'ben.okafor@acme.test', role: 'EMPLOYEE', jobTitle: 'Developer', managerId: 2, weeklyCapacityHours: 40, overtimeAllowed: false, isArchived: false, annualSalaryCents: 10_000_000 }
const DEV = { ...BEN, userId: 6, username: 'DS516414', firstName: 'Dev', lastName: 'Shah', managerId: 9, annualSalaryCents: undefined }

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
    await userEvent.click(screen.getByRole('button', { name: /^search$/i }))
    await waitFor(() => expect(calls.at(-1).query.search).toBe('okafor'))
    await userEvent.click(screen.getByLabelText(/^role/i))
    await userEvent.click(await screen.findByRole('option', { name: 'Employees' }))
    await waitFor(() => expect(calls.at(-1).query.role).toBe('EMPLOYEE'))
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
})
