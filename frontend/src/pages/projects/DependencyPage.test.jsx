import { describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import DependencyPage from './DependencyPage'
import { APOLLO, BUILD, DESIGN } from './fixtures'
import { USERS, renderAt, session, stubApi } from '../../test/utils'

const LAUNCH = { ...BUILD, milestoneId: 12, name: 'Launch', dueDate: '2026-12-12', status: 'BLOCKED', progressPercent: 0 }
const GRAPH = {
  nodes: [DESIGN, BUILD, LAUNCH],
  edges: [{ from: 11, to: 10 }, { from: 12, to: 11 }],
}

function renderGraph(user = USERS.manager, answers = {}) {
  const calls = stubApi({
    'GET /projects/1': [200, APOLLO],
    'GET /projects/1/dependency-graph': [200, GRAPH],
    ...answers,
  })
  renderAt(<DependencyPage />, { path: '/projects/1/dependencies', route: '/projects/:id/dependencies', auth: session(user) })
  return calls
}

describe('DependencyPage', () => {
  it('lays deliverables out in steps: each one after everything it depends on', async () => {
    renderGraph()
    const step1 = await screen.findByRole('region', { name: 'Step 1' })
    expect(within(step1).getByText('Design')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Step 2' })).getByText('Build')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Step 3' })).getByText('Launch')).toBeInTheDocument()
  })

  it('shows each deliverable with its status and what it needs', async () => {
    renderGraph()
    const build = await screen.findByRole('article', { name: 'Build' })
    expect(within(build).getByText('In progress')).toBeInTheDocument()
    expect(within(build).getByText('Needs Design')).toBeInTheDocument()
  })

  it('says what a blocked deliverable is waiting for', async () => {
    renderGraph()
    const launch = await screen.findByRole('article', { name: 'Launch' })
    expect(within(launch).getByText('Blocked')).toBeInTheDocument()
    expect(within(launch).getByText(/waiting for build/i)).toBeInTheDocument()
  })

  it("adds a link, and shows the server's refusal when it would make a loop", async () => {
    const calls = renderGraph(USERS.manager, {
      'POST /milestones/10/dependencies': [409, { error: 'Launch already depends on Design, so this would make a loop.' }],
    })
    await screen.findByRole('region', { name: 'Step 1' })
    await userEvent.click(screen.getByRole('button', { name: /add a link/i }))
    await userEvent.click(screen.getByLabelText(/^deliverable/i))
    await userEvent.click(await screen.findByRole('option', { name: 'Design' }))
    await userEvent.click(screen.getByLabelText(/depends on/i))
    await userEvent.click(await screen.findByRole('option', { name: 'Launch' }))
    await userEvent.click(screen.getByRole('button', { name: /^add$/i }))
    expect(await screen.findByText(/would make a loop/i)).toBeInTheDocument()
    expect(calls.find((c) => c.method === 'POST').body).toEqual({ dependsOnMilestoneId: 12 })
  })

  it('removes a link', async () => {
    const calls = renderGraph(USERS.manager, { 'POST /milestones/12/dependencies/11/archive': [200, LAUNCH] })
    const launch = await screen.findByRole('article', { name: 'Launch' })
    await userEvent.click(within(launch).getByRole('button', { name: /remove the link to build/i }))
    await waitFor(() => expect(calls.some((c) => c.path === '/milestones/12/dependencies/11/archive')).toBe(true))
  })

  it('is read-only for employees', async () => {
    renderGraph(USERS.employee)
    await screen.findByRole('region', { name: 'Step 1' })
    expect(screen.queryByRole('button', { name: /add a link/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /remove the link/i })).not.toBeInTheDocument()
  })

  it('explains an empty project', async () => {
    renderGraph(USERS.manager, { 'GET /projects/1/dependency-graph': [200, { nodes: [], edges: [] }] })
    expect(await screen.findByText(/no deliverables yet/i)).toBeInTheDocument()
  })
})
