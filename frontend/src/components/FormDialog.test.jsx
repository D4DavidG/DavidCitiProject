import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import FormDialog from './FormDialog'
import { ApiError } from '../services/request'

const fields = [
  { name: 'name', label: 'Name', required: true },
  { name: 'hoursPerWeek', label: 'Hours per week', type: 'number' },
  { name: 'budgetCents', label: 'Budget ($)', type: 'money' },
  { name: 'startDate', label: 'Start date', type: 'date' },
  { name: 'status', label: 'Status', type: 'select', options: [['ACTIVE', 'Active'], ['ON_HOLD', 'On hold']] },
]

function renderForm(props) {
  const onSubmit = props.onSubmit ?? vi.fn().mockResolvedValue({})
  render(<FormDialog open title="Edit thing" fields={fields} onClose={vi.fn()} onSubmit={onSubmit} {...props} />)
  return onSubmit
}

describe('FormDialog', () => {
  it('converts values to what the API takes: numbers, cents and dates', async () => {
    const onSubmit = renderForm({})
    await userEvent.type(screen.getByLabelText(/^name/i), 'Apollo')
    await userEvent.type(screen.getByLabelText(/hours per week/i), '25')
    await userEvent.type(screen.getByLabelText(/budget/i), '12,500')
    await userEvent.type(screen.getByLabelText(/start date/i), '2026-10-01')
    await userEvent.click(screen.getByRole('button', { name: /save/i }))
    expect(onSubmit).toHaveBeenCalledWith({ name: 'Apollo', hoursPerWeek: 25, budgetCents: 1_250_000, startDate: '2026-10-01' })
  })

  it('sends only what changed when editing', async () => {
    const onSubmit = renderForm({ initial: { name: 'Apollo', hoursPerWeek: 20, budgetCents: 1_000_000, startDate: '2026-10-01', status: 'ACTIVE' } })
    const hours = screen.getByLabelText(/hours per week/i)
    await userEvent.clear(hours)
    await userEvent.type(hours, '30')
    await userEvent.click(screen.getByRole('button', { name: /save/i }))
    expect(onSubmit).toHaveBeenCalledWith({ hoursPerWeek: 30 })
  })

  it('shows a money input that is not an amount as a field error, without submitting', async () => {
    const onSubmit = renderForm({})
    await userEvent.type(screen.getByLabelText(/budget/i), 'lots')
    await userEvent.click(screen.getByRole('button', { name: /save/i }))
    expect(screen.getByText(/enter an amount in dollars/i)).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it("puts the server's field error on that field, and other errors on top", async () => {
    const onSubmit = vi.fn()
      .mockRejectedValueOnce(new ApiError(400, 'Hours must be between 1 and 40.', 'hoursPerWeek'))
      .mockRejectedValueOnce(new ApiError(409, 'That would overlap an existing booking.'))
    renderForm({ onSubmit })
    await userEvent.type(screen.getByLabelText(/hours per week/i), '60')
    await userEvent.click(screen.getByRole('button', { name: /save/i }))
    expect(await screen.findByText('Hours must be between 1 and 40.')).toBeInTheDocument()
    expect(screen.getByLabelText(/hours per week/i)).toHaveAttribute('aria-invalid', 'true')
    await userEvent.click(screen.getByRole('button', { name: /save/i }))
    expect(await screen.findByText('That would overlap an existing booking.')).toBeInTheDocument()
  })

  it('sends id dropdowns as numbers and hours as minutes', async () => {
    const onSubmit = vi.fn().mockResolvedValue({})
    render(
      <FormDialog
        open
        title="New task"
        fields={[
          { name: 'assigneeUserId', label: 'Assignee', type: 'select', numeric: true, options: [[4, 'Ben Okafor'], [3, 'Ana Ruiz']] },
          { name: 'estimateMinutes', label: 'Estimate (hours)', type: 'hours' },
        ]}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    )
    await userEvent.click(screen.getByLabelText(/assignee/i))
    await userEvent.click(await screen.findByRole('option', { name: 'Ben Okafor' }))
    await userEvent.type(screen.getByLabelText(/estimate/i), '2.5')
    await userEvent.click(screen.getByRole('button', { name: /save/i }))
    expect(onSubmit).toHaveBeenCalledWith({ assigneeUserId: 4, estimateMinutes: 150 })
  })

  it('shows minutes as hours when editing', () => {
    render(
      <FormDialog open title="Edit task" fields={[{ name: 'estimateMinutes', label: 'Estimate (hours)', type: 'hours' }]}
        initial={{ estimateMinutes: 90 }} onClose={vi.fn()} onSubmit={vi.fn()} />,
    )
    expect(screen.getByLabelText(/estimate/i)).toHaveValue(1.5)
  })

  it('pre-fills defaults for a new record and sends them', async () => {
    const onSubmit = vi.fn().mockResolvedValue({})
    render(
      <FormDialog open title="Log time" fields={[{ name: 'workDate', label: 'Date', type: 'date' }, { name: 'note', label: 'Note' }]}
        defaults={{ workDate: '2026-10-14' }} onClose={vi.fn()} onSubmit={onSubmit} />,
    )
    expect(screen.getByLabelText(/date/i)).toHaveValue('2026-10-14')
    await userEvent.click(screen.getByRole('button', { name: /save/i }))
    expect(onSubmit).toHaveBeenCalledWith({ workDate: '2026-10-14' })
  })

  it('sends a yes/no field as true or false', async () => {
    const onSubmit = vi.fn().mockResolvedValue({})
    render(
      <FormDialog open title="Capacity" fields={[{ name: 'overtimeAllowed', label: 'Overtime allowed', type: 'boolean' }]}
        initial={{ overtimeAllowed: false }} onClose={vi.fn()} onSubmit={onSubmit} />,
    )
    await userEvent.click(screen.getByLabelText(/overtime allowed/i))
    await userEvent.click(await screen.findByRole('option', { name: 'Yes' }))
    await userEvent.click(screen.getByRole('button', { name: /save/i }))
    expect(onSubmit).toHaveBeenCalledWith({ overtimeAllowed: true })
  })

  it('closes after a successful save', async () => {
    const onClose = vi.fn()
    renderForm({ onClose })
    await userEvent.type(screen.getByLabelText(/^name/i), 'Apollo')
    await userEvent.click(screen.getByRole('button', { name: /save/i }))
    expect(onClose).toHaveBeenCalled()
  })
})
