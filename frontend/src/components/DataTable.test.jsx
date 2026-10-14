import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import DataTable from './DataTable'

vi.mock('../theme/responsive', () => ({ useIsMobile: vi.fn(() => false) }))
const responsive = await import('../theme/responsive')

const columns = [
  { key: 'name', label: 'Name' },
  { key: 'hours', label: 'Hours', render: (row) => `${row.hours} h` },
]
const rows = [{ id: 1, name: 'Ana Ruiz', hours: 30 }, { id: 2, name: 'Ben Okafor', hours: 45 }]

describe('DataTable', () => {
  it('is a table on desktop, with headings and rendered cells', () => {
    render(<DataTable columns={columns} rows={rows} rowKey="id" label="People" />)
    const table = screen.getByRole('table', { name: 'People' })
    expect(within(table).getByRole('columnheader', { name: 'Hours' })).toBeInTheDocument()
    expect(within(table).getByText('45 h')).toBeInTheDocument()
  })

  it('becomes one card per row on phones, each value labelled', () => {
    responsive.useIsMobile.mockReturnValue(true)
    render(<DataTable columns={columns} rows={rows} rowKey="id" label="People" />)
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    const cards = screen.getAllByRole('listitem')
    expect(cards).toHaveLength(2)
    expect(within(cards[1]).getByText('Hours')).toBeInTheDocument()
    expect(within(cards[1]).getByText('45 h')).toBeInTheDocument()
    responsive.useIsMobile.mockReturnValue(false)
  })

  it('shows a dash for an empty value instead of a blank row', () => {
    responsive.useIsMobile.mockReturnValue(true)
    render(<DataTable columns={[{ key: 'name', label: 'Name' }, { key: 'note', label: 'Note' }]}
      rows={[{ id: 1, name: 'Ana Ruiz', note: null }, { id: 2, name: 'Ben Okafor', note: '' }]} rowKey="id" label="People" />)
    const cards = screen.getAllByRole('listitem')
    expect(within(cards[0]).getByText('—')).toBeInTheDocument()
    expect(within(cards[1]).getByText('—')).toBeInTheDocument()
    responsive.useIsMobile.mockReturnValue(false)
  })

  it('shows the empty message when there are no rows', () => {
    render(<DataTable columns={columns} rows={[]} rowKey="id" label="People" empty="Nobody booked yet." />)
    expect(screen.getByText('Nobody booked yet.')).toBeInTheDocument()
  })
})
