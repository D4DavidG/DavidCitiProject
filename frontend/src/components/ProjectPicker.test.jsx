import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ProjectPicker from './ProjectPicker'
import { page, renderAt, stubApi } from '../test/utils'

const APOLLO = { projectId: 1, name: 'Apollo', status: 'ACTIVE' }
const ZEUS = { projectId: 2, name: 'Zeus', status: 'ACTIVE' }
const BRIDGE = { projectId: 3, name: 'Bennet Bridge', status: 'ACTIVE' }
const TOWER = { projectId: 4, name: 'Benjamin Tower', status: 'ACTIVE' }

/** The server's project search: a name match, case-insensitive, like `p.name ILIKE`. */
function search({ query }) {
  const all = [APOLLO, ZEUS, BRIDGE, TOWER]
  const q = (query.q ?? '').toLowerCase()
  return [200, page(all.filter((p) => p.name.toLowerCase().includes(q)))]
}

/** The picker on a page that keeps its choice, as the Schedule does; `changes` sees every onChange. */
function renderPicker(answers = {}, start = []) {
  const calls = stubApi({ 'GET /projects': search, ...answers })
  const changes = vi.fn()
  function Page() {
    const [chosen, setChosen] = useState(start)
    return <ProjectPicker value={chosen} onChange={(next) => { changes(next); setChosen(next) }} />
  }
  renderAt(<Page />)
  return { calls, changes, projectCalls: () => calls.filter((c) => c.path === '/projects') }
}

const box = () => screen.getByRole('combobox', { name: 'Projects' })
const options = () => screen.getAllByRole('option').map((o) => o.textContent)

/** Hold the server's answer for the search `text` until release() runs; the rest answer at once. */
function holdSearch(text) {
  const stubbed = globalThis.fetch
  const sent = []
  let open
  const gate = new Promise((resolve) => { open = resolve })
  vi.stubGlobal('fetch', vi.fn((url, init) => {
    const q = new URL(url, 'http://localhost').searchParams.get('q')
    sent.push(q)
    return q === text ? gate.then(() => stubbed(url, init)) : stubbed(url, init)
  }))
  return { sent, release: () => open() }
}

describe('ProjectPicker', () => {
  it('is a box labelled Projects that asks the server nothing until it is opened', async () => {
    const { projectCalls } = renderPicker()
    expect(box()).toBeInTheDocument()
    await new Promise((done) => { setTimeout(done, 50) })
    expect(projectCalls()).toHaveLength(0)
  })

  it('opens on a list of projects from the server, 20 at most', async () => {
    const { projectCalls } = renderPicker()
    await userEvent.click(box())
    await waitFor(() => expect(options()).toEqual(['Apollo', 'Zeus', 'Bennet Bridge', 'Benjamin Tower']))
    expect(projectCalls()[0].query).toEqual({ pageSize: '20' })
  })

  it('searches on the server as you type, once you pause, not on every key', async () => {
    const { projectCalls } = renderPicker()
    await userEvent.type(box(), 'apo')
    await waitFor(() => expect(options()).toEqual(['Apollo']))
    expect(projectCalls().map((c) => c.query.q)).toEqual([undefined, 'apo'])
  })

  it('ignores a slow answer for an older search ("ben") that lands after the newer one ("benjamin")', async () => {
    renderPicker()
    const held = holdSearch('ben')
    await userEvent.type(box(), 'ben')
    await waitFor(() => expect(held.sent).toContain('ben'))
    await userEvent.type(box(), 'jamin')
    await waitFor(() => expect(options()).toEqual(['Benjamin Tower']))
    held.release()
    await new Promise((done) => { setTimeout(done, 50) })
    expect(options()).toEqual(['Benjamin Tower'])
  })

  it('shows a chosen project as a chip, gives the page its id and name, and leaves it out of the list', async () => {
    const { changes } = renderPicker()
    await userEvent.click(box())
    await userEvent.click(await screen.findByRole('option', { name: 'Zeus' }))
    expect(changes).toHaveBeenLastCalledWith([{ projectId: 2, name: 'Zeus' }])
    expect(screen.getByRole('button', { name: 'Zeus' })).toHaveClass('MuiChip-root')
    await userEvent.click(box())
    await waitFor(() => expect(options()).toEqual(['Apollo', 'Bennet Bridge', 'Benjamin Tower']))
  })

  it('chooses more than one, and drops one with its chip\'s cross', async () => {
    const { changes } = renderPicker({}, [{ projectId: 1, name: 'Apollo' }])
    await userEvent.click(box())
    await userEvent.click(await screen.findByRole('option', { name: 'Zeus' }))
    expect(changes).toHaveBeenLastCalledWith([{ projectId: 1, name: 'Apollo' }, { projectId: 2, name: 'Zeus' }])
    await userEvent.click(within(screen.getByRole('button', { name: 'Apollo' })).getByTestId('CancelIcon'))
    expect(changes).toHaveBeenLastCalledWith([{ projectId: 2, name: 'Zeus' }])
    expect(screen.queryByRole('button', { name: 'Apollo' })).not.toBeInTheDocument()
  })

  it('says so when no project matches the search', async () => {
    renderPicker()
    await userEvent.type(box(), 'zzz')
    expect(await screen.findByText('No projects match your search.')).toBeInTheDocument()
  })

  it("shows the server's error in the list instead of options", async () => {
    renderPicker({ 'GET /projects': [500, { error: 'The database is waking up.' }] })
    await userEvent.click(box())
    expect(await screen.findByText('The database is waking up.')).toBeInTheDocument()
  })
})
