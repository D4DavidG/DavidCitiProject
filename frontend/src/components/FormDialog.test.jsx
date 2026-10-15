import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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

  it('sends id dropdowns as numbers', async () => {
    const onSubmit = vi.fn().mockResolvedValue({})
    render(
      <FormDialog
        open
        title="New task"
        fields={[{ name: 'assigneeUserId', label: 'Assignee', type: 'select', numeric: true, options: [[4, 'Ben Okafor'], [3, 'Ana Ruiz']] }]}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    )
    await userEvent.click(screen.getByLabelText(/assignee/i))
    await userEvent.click(await screen.findByRole('option', { name: 'Ben Okafor' }))
    await userEvent.click(screen.getByRole('button', { name: /save/i }))
    expect(onSubmit).toHaveBeenCalledWith({ assigneeUserId: 4 })
  })

  describe('a duration field (Hours and Minutes boxes)', () => {
    const TIME = { name: 'minutes', label: 'Time', type: 'duration', max: 1440, required: true }
    const ESTIMATE = { name: 'estimateMinutes', label: 'Estimate', type: 'duration', max: 60000, required: true }

    function renderDuration(field, props = {}) {
      const onSubmit = vi.fn().mockResolvedValue({})
      render(<FormDialog open title="Log time" fields={[field]} onClose={vi.fn()} onSubmit={onSubmit} {...props} />)
      return onSubmit
    }

    async function enter(hours, minutes) {
      const group = screen.getByRole('group', { name: /time|estimate/i })
      if (hours !== '') await userEvent.type(within(group).getByLabelText('Hours'), hours)
      if (minutes !== '') await userEvent.type(within(group).getByLabelText('Minutes'), minutes)
      await userEvent.click(screen.getByRole('button', { name: /save/i }))
    }

    it('groups the two boxes under the field label', () => {
      renderDuration(TIME)
      const group = screen.getByRole('group', { name: /time/i })
      expect(within(group).getByLabelText('Hours')).toHaveAttribute('inputmode', 'numeric')
      expect(within(group).getByLabelText('Minutes')).toHaveAttribute('inputmode', 'numeric')
    })

    it('sends 2 h 30 min as 150 minutes', async () => {
      const onSubmit = renderDuration(TIME)
      await enter('2', '30')
      expect(onSubmit).toHaveBeenCalledWith({ minutes: 150 })
    })

    it('refuses 75 minutes under the Minutes box, tied to it, and sends nothing', async () => {
      const onSubmit = renderDuration(TIME)
      await enter('1', '75')
      expect(screen.getByLabelText('Minutes')).toHaveAccessibleDescription('Minutes must be a whole number from 0 to 59.')
      expect(screen.getByLabelText('Minutes')).toHaveAttribute('aria-invalid', 'true')
      expect(onSubmit).not.toHaveBeenCalled()
    })

    it('refuses 2.5 minutes the same way', async () => {
      const onSubmit = renderDuration(TIME)
      await enter('', '2.5')
      expect(screen.getByLabelText('Minutes')).toHaveAccessibleDescription('Minutes must be a whole number from 0 to 59.')
      expect(onSubmit).not.toHaveBeenCalled()
    })

    it('refuses no time at all, under the Hours box', async () => {
      const onSubmit = renderDuration(TIME)
      await enter('', '')
      expect(screen.getByLabelText('Hours')).toHaveAccessibleDescription('Enter some time: at least 1 minute.')
      expect(onSubmit).not.toHaveBeenCalled()
    })

    it('refuses more than its maximum: 24 h 30 min of logged time', async () => {
      const onSubmit = renderDuration(TIME)
      await enter('24', '30')
      expect(screen.getByLabelText('Hours')).toHaveAccessibleDescription('That is more than 24 h.')
      expect(onSubmit).not.toHaveBeenCalled()
    })

    it('takes an estimate of 100 h but not 1001 h', async () => {
      const onSubmit = renderDuration(ESTIMATE)
      await enter('1001', '')
      expect(screen.getByLabelText('Hours')).toHaveAccessibleDescription('Hours must be a whole number from 0 to 1000.')
      expect(onSubmit).not.toHaveBeenCalled()
      await userEvent.clear(screen.getByLabelText('Hours'))
      await enter('100', '')
      expect(onSubmit).toHaveBeenCalledWith({ estimateMinutes: 6000 })
    })

    it('pre-fills 420 as 7 h 0 min when editing, and sends a change as minutes', async () => {
      const onSubmit = renderDuration(TIME, { initial: { minutes: 420 } })
      const hours = screen.getByLabelText('Hours')
      const minutes = screen.getByLabelText('Minutes')
      expect(hours).toHaveValue('7')
      expect(minutes).toHaveValue('0')
      await userEvent.clear(hours)
      await userEvent.type(hours, '6')
      await userEvent.clear(minutes)
      await userEvent.type(minutes, '45')
      await userEvent.click(screen.getByRole('button', { name: /save/i }))
      expect(onSubmit).toHaveBeenCalledWith({ minutes: 405 })
    })

    it('sends nothing when the time is unchanged, even if typed differently', async () => {
      const onClose = vi.fn()
      const onSubmit = renderDuration(TIME, { initial: { minutes: 420 }, onClose })
      await userEvent.clear(screen.getByLabelText('Minutes'))
      await userEvent.click(screen.getByRole('button', { name: /save/i }))
      expect(onSubmit).not.toHaveBeenCalled()
      expect(onClose).toHaveBeenCalled()
    })

    it("puts the server's error for the field under the Hours box", async () => {
      const onSubmit = vi.fn().mockRejectedValue(new ApiError(400, 'You can log at most 24 h in one day.', 'minutes'))
      renderDuration(TIME, { onSubmit })
      await enter('3', '')
      await waitFor(() => expect(screen.getByLabelText('Hours')).toHaveAccessibleDescription('You can log at most 24 h in one day.'))
    })
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

  describe('while saving', () => {
    /** A save the test finishes by hand, like a request held open. */
    function heldSave() {
      let finish
      let fail
      const onSubmit = vi.fn(() => new Promise((resolve, reject) => { finish = resolve; fail = reject }))
      return { onSubmit, finish: () => finish({}), fail: (error) => fail(error) }
    }
    const withTime = [...fields, { name: 'minutes', label: 'Time', type: 'duration', max: 1440 }]

    /** Every input, the dropdown and both buttons, as a person would find them. */
    function controls() {
      return [
        screen.getByLabelText(/^name/i), screen.getByLabelText(/hours per week/i), screen.getByLabelText(/budget/i),
        screen.getByLabelText(/start date/i), screen.getByLabelText('Hours'), screen.getByLabelText('Minutes'),
        screen.getByRole('button', { name: /cancel/i }), screen.getByRole('button', { name: /^(save|saving…)$/i }),
      ]
    }
    const statusDisabled = () => screen.getByRole('combobox', { name: /status/i }).getAttribute('aria-disabled') === 'true'

    it('disables every field and button, and says it is saving, until the save succeeds', async () => {
      const save = heldSave()
      renderForm({ fields: withTime, onSubmit: save.onSubmit })
      await userEvent.type(screen.getByLabelText(/^name/i), 'Apollo')
      await userEvent.click(screen.getByRole('button', { name: /save/i }))
      expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled()
      controls().forEach((control) => expect(control).toBeDisabled())
      expect(statusDisabled()).toBe(true)
      save.finish()
      await waitFor(() => expect(screen.getByLabelText(/^name/i)).toBeEnabled())
      controls().forEach((control) => expect(control).toBeEnabled())
      expect(statusDisabled()).toBe(false)
    })

    it('enables everything again after an error, so it can be fixed and sent again', async () => {
      const save = heldSave()
      renderForm({ fields: withTime, onSubmit: save.onSubmit })
      await userEvent.type(screen.getByLabelText(/^name/i), 'Apollo')
      await userEvent.click(screen.getByRole('button', { name: /save/i }))
      expect(screen.getByLabelText(/^name/i)).toBeDisabled()
      save.fail(new ApiError(409, 'A project with that name already exists.'))
      expect(await screen.findByText('A project with that name already exists.')).toBeInTheDocument()
      controls().forEach((control) => expect(control).toBeEnabled())
      expect(statusDisabled()).toBe(false)
    })

    it('sends once, however many times the form is submitted while saving', async () => {
      const save = heldSave()
      renderForm({ onSubmit: save.onSubmit })
      await userEvent.type(screen.getByLabelText(/^name/i), 'Apollo')
      const form = screen.getByLabelText(/^name/i).closest('form')
      fireEvent.submit(form)
      fireEvent.submit(form)
      fireEvent.submit(form)
      expect(save.onSubmit).toHaveBeenCalledTimes(1)
      save.finish()
      await waitFor(() => expect(screen.getByLabelText(/^name/i)).toBeEnabled())
    })

    it('cannot be closed with Escape while saving', async () => {
      const save = heldSave()
      const onClose = vi.fn()
      renderForm({ onSubmit: save.onSubmit, onClose })
      await userEvent.type(screen.getByLabelText(/^name/i), 'Apollo')
      await userEvent.click(screen.getByRole('button', { name: /save/i }))
      fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
      expect(onClose).not.toHaveBeenCalled()
      save.finish()
      await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1)) // the successful save closes it
    })
  })
})
