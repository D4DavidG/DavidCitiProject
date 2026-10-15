import { describe, expect, it } from 'vitest'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import DependencyPage from './DependencyPage'
import { APOLLO, BUILD, DESIGN } from './fixtures'
import { USERS, holdOpen, renderAt, session, stubApi } from '../../test/utils'

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

  it('words progress the same way as the project page', async () => {
    renderGraph()
    const design = await screen.findByRole('article', { name: 'Design' })
    expect(within(design).getByText('100% of estimated hours done')).toBeInTheDocument()
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

  it('shows a refused link removal on the deliverable it was pressed on, not at the top of the page', async () => {
    renderGraph(USERS.manager, { 'POST /milestones/12/dependencies/11/archive': [409, { error: 'Build is already signed off.' }] })
    const launch = await screen.findByRole('article', { name: 'Launch' })
    await userEvent.click(within(launch).getByRole('button', { name: /remove link to build/i }))
    const refusal = await within(launch).findByText('Build is already signed off.')
    expect(refusal).toHaveAttribute('role', 'alert')
    expect(refusal.closest('.MuiAlert-root')).toBeNull()
  })

  it('removes a link', async () => {
    const calls = renderGraph(USERS.manager, { 'POST /milestones/12/dependencies/11/archive': [200, LAUNCH] })
    const launch = await screen.findByRole('article', { name: 'Launch' })
    const remove = within(launch).getByRole('button', { name: /remove link to build/i })
    expect(remove).toHaveTextContent('Remove link to Build') // visible words, not only an icon
    await userEvent.click(remove)
    await waitFor(() => expect(calls.some((c) => c.path === '/milestones/12/dependencies/11/archive')).toBe(true))
  })

  it('removes a link once, however often pressed: the button waits for the answer', async () => {
    const calls = renderGraph(USERS.manager, { 'POST /milestones/12/dependencies/11/archive': [200, LAUNCH] })
    const release = holdOpen('/milestones/12/dependencies/11/archive')
    const launch = await screen.findByRole('article', { name: 'Launch' })
    const remove = within(launch).getByRole('button', { name: /remove link to build/i })
    fireEvent.click(remove)
    fireEvent.click(remove)
    expect(remove).toBeDisabled()
    release()
    await waitFor(() => expect(calls.filter((c) => c.path === '/milestones/12/dependencies/11/archive')).toHaveLength(1))
    // The graph reloads and its cards are drawn again, so look the card up afresh.
    await waitFor(() => expect(within(screen.getByRole('article', { name: 'Launch' })).getByRole('button', { name: /remove link to build/i })).toBeEnabled())
  })

  it('is read-only for employees', async () => {
    renderGraph(USERS.employee)
    await screen.findByRole('region', { name: 'Step 1' })
    expect(screen.queryByRole('button', { name: /add a link/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /remove link/i })).not.toBeInTheDocument()
  })

  it('explains an empty project', async () => {
    renderGraph(USERS.manager, { 'GET /projects/1/dependency-graph': [200, { nodes: [], edges: [] }] })
    expect(await screen.findByText(/no deliverables yet/i)).toBeInTheDocument()
  })
})
