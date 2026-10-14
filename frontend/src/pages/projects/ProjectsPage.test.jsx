import { describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ProjectsPage from './ProjectsPage'
import { APOLLO, MARIA } from './fixtures'
import { USERS, page, renderAt, session, stubApi } from '../../test/utils'

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

  it('searches and filters on the server', async () => {
    const calls = renderList()
    await screen.findByRole('link', { name: 'Apollo' })
    await userEvent.type(screen.getByLabelText(/search projects/i), 'apo')
    await userEvent.click(screen.getByRole('button', { name: /^search$/i }))
    await waitFor(() => expect(calls.at(-1).query.search).toBe('apo'))
  })

  it('lets admins see archived projects too', async () => {
    const calls = renderList()
    await screen.findByRole('link', { name: 'Apollo' })
    await userEvent.click(screen.getByLabelText(/show archived/i))
    await waitFor(() => expect(calls.at(-1).query.includeArchived).toBe('true'))
  })

  it('offers "New project" to admins only', async () => {
    renderList(USERS.manager)
    await screen.findByRole('link', { name: 'Apollo' })
    expect(screen.queryByRole('button', { name: /new project/i })).not.toBeInTheDocument()
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
