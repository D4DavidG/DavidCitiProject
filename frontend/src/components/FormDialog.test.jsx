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

  it('sends an emptied optional box when editing, so a description or note can be cleared', async () => {
    const onSubmit = vi.fn().mockResolvedValue({})
    render(
      <FormDialog
        open
        title="Edit project"
        fields={[{ name: 'name', label: 'Name', required: true }, { name: 'description', label: 'Description', type: 'textarea' }]}
        initial={{ name: 'Apollo', description: 'Old words' }}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    )
    await userEvent.clear(screen.getByLabelText(/description/i))
    await userEvent.click(screen.getByRole('button', { name: /save/i }))
    expect(onSubmit).toHaveBeenCalledWith({ description: '' })
  })

  it('makes the submit button the danger kind, filled red, when asked (Reject, Archive)', () => {
    renderForm({ submitLabel: 'Reject', danger: true })
    const reject = screen.getByRole('button', { name: 'Reject' })
    expect(reject).toHaveClass('MuiButton-contained')
    expect(reject).toHaveClass('MuiButton-colorError')
  })

  it('keeps the submit button the usual green otherwise', () => {
    renderForm({})
    expect(screen.getByRole('button', { name: /save/i })).toHaveClass('MuiButton-colorPrimary')
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
    await userEvent.type(screen.getByLabelText(/^name/i), 'Apollo')
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

  describe('checks before sending (spec 5a)', () => {
    const PAIR = [
      { name: 'startDate', label: 'Start date', type: 'date', required: true },
      { name: 'endDate', label: 'End date', type: 'date', required: true, notBefore: 'startDate' },
    ]

    it('catches a required text field left empty, under the field, and sends nothing', async () => {
      const onSubmit = renderForm({})
      await userEvent.click(screen.getByRole('button', { name: /save/i }))
      expect(screen.getByLabelText(/^name/i)).toHaveAccessibleDescription('This field is required.')
      expect(screen.getByLabelText(/^name/i)).toHaveAttribute('aria-invalid', 'true')
      expect(onSubmit).not.toHaveBeenCalled()
    })

    it('catches a required textarea, select and date the same way', async () => {
      const onSubmit = vi.fn()
      render(
        <FormDialog
          open
          title="Ask"
          fields={[
            { name: 'why', label: 'Why is it needed?', type: 'textarea', required: true },
            { name: 'projectId', label: 'Project', type: 'select', numeric: true, options: [[1, 'Apollo']], required: true },
            { name: 'due', label: 'Due', type: 'date', required: true },
          ]}
          onClose={vi.fn()}
          onSubmit={onSubmit}
        />,
      )
      await userEvent.click(screen.getByRole('button', { name: /save/i }))
      expect(screen.getByLabelText(/why is it needed/i)).toHaveAccessibleDescription('This field is required.')
      expect(screen.getByRole('combobox', { name: /project/i })).toHaveAccessibleDescription('Choose an option.')
      expect(screen.getByLabelText(/due/i)).toHaveAccessibleDescription('Enter a date.')
      expect(onSubmit).not.toHaveBeenCalled()
    })

    it('does not mind an optional field left empty', async () => {
      const onSubmit = renderForm({})
      await userEvent.type(screen.getByLabelText(/^name/i), 'Apollo')
      await userEvent.click(screen.getByRole('button', { name: /save/i }))
      expect(onSubmit).toHaveBeenCalledWith({ name: 'Apollo' })
    })

    it('when editing, clearing a required field is caught, but leaving it alone is not', async () => {
      const onSubmit = renderForm({ initial: { name: 'Apollo', hoursPerWeek: 20 } })
      await userEvent.clear(screen.getByLabelText(/^name/i))
      await userEvent.click(screen.getByRole('button', { name: /save/i }))
      expect(screen.getByLabelText(/^name/i)).toHaveAccessibleDescription('This field is required.')
      expect(onSubmit).not.toHaveBeenCalled()
      await userEvent.type(screen.getByLabelText(/^name/i), 'Gemini')
      await userEvent.click(screen.getByRole('button', { name: /save/i }))
      expect(onSubmit).toHaveBeenCalledWith({ name: 'Gemini' })
    })

    it('puts the focus on the first field with a problem, and then on the next one', async () => {
      renderForm({})
      await userEvent.type(screen.getByLabelText(/budget/i), 'lots')
      await userEvent.click(screen.getByRole('button', { name: /save/i }))
      expect(screen.getByLabelText(/^name/i)).toHaveFocus() // Name comes before Budget in the form
      await userEvent.type(screen.getByLabelText(/^name/i), 'Apollo')
      await userEvent.click(screen.getByRole('button', { name: /save/i }))
      expect(screen.getByLabelText(/budget/i)).toHaveFocus()
    })

    it("focuses a duration's Minutes box when only the minutes are wrong", async () => {
      render(<FormDialog open title="Log" fields={[{ name: 'minutes', label: 'Time', type: 'duration', max: 1440, required: true }]} onClose={vi.fn()} onSubmit={vi.fn()} />)
      await userEvent.type(screen.getByLabelText('Hours'), '1')
      await userEvent.type(screen.getByLabelText('Minutes'), '75')
      await userEvent.click(screen.getByRole('button', { name: /save/i }))
      expect(screen.getByLabelText('Minutes')).toHaveFocus()
    })

    it("focuses the field the server names, once the form is enabled again", async () => {
      const onSubmit = vi.fn().mockRejectedValue(new ApiError(400, 'Hours must be between 1 and 40.', 'hoursPerWeek'))
      renderForm({ onSubmit })
      await userEvent.type(screen.getByLabelText(/^name/i), 'Apollo')
      await userEvent.type(screen.getByLabelText(/hours per week/i), '60')
      await userEvent.click(screen.getByRole('button', { name: /save/i }))
      await screen.findByText('Hours must be between 1 and 40.')
      await waitFor(() => expect(screen.getByLabelText(/hours per week/i)).toHaveFocus())
    })

    it('refuses an end date before the start date, under the end date', async () => {
      const onSubmit = vi.fn()
      render(<FormDialog open title="Book" fields={PAIR} onClose={vi.fn()} onSubmit={onSubmit} />)
      await userEvent.type(screen.getByLabelText(/start date/i), '2026-10-20')
      await userEvent.type(screen.getByLabelText(/end date/i), '2026-10-10')
      await userEvent.click(screen.getByRole('button', { name: /save/i }))
      expect(screen.getByLabelText(/end date/i)).toHaveAccessibleDescription("End date can't be before start date.")
      expect(screen.getByLabelText(/end date/i)).toHaveFocus()
      expect(onSubmit).not.toHaveBeenCalled()
    })

    it('takes an end date the same day as the start date, and one after it', async () => {
      const onSubmit = vi.fn().mockResolvedValue({})
      render(<FormDialog open title="Book" fields={PAIR} onClose={vi.fn()} onSubmit={onSubmit} />)
      await userEvent.type(screen.getByLabelText(/start date/i), '2026-10-20')
      await userEvent.type(screen.getByLabelText(/end date/i), '2026-10-20')
      await userEvent.click(screen.getByRole('button', { name: /save/i }))
      expect(onSubmit).toHaveBeenCalledWith({ startDate: '2026-10-20', endDate: '2026-10-20' })
    })

    it('when editing only the end date, it is still held against the start date already on the record', async () => {
      const onSubmit = vi.fn()
      render(<FormDialog open title="Edit" fields={PAIR} initial={{ startDate: '2026-10-20', endDate: '2026-11-01' }} onClose={vi.fn()} onSubmit={onSubmit} />)
      fireEvent.change(screen.getByLabelText(/end date/i), { target: { value: '2026-10-01' } })
      await userEvent.click(screen.getByRole('button', { name: /save/i }))
      expect(screen.getByLabelText(/end date/i)).toHaveAccessibleDescription("End date can't be before start date.")
      expect(onSubmit).not.toHaveBeenCalled()
    })

    it('when only the start date is edited past the end date on the record, the end date is flagged', async () => {
      const onSubmit = vi.fn()
      render(<FormDialog open title="Edit" fields={PAIR} initial={{ startDate: '2026-10-20', endDate: '2026-11-01' }} onClose={vi.fn()} onSubmit={onSubmit} />)
      fireEvent.change(screen.getByLabelText(/start date/i), { target: { value: '2026-12-01' } })
      await userEvent.click(screen.getByRole('button', { name: /save/i }))
      expect(screen.getByLabelText(/end date/i)).toHaveAccessibleDescription("End date can't be before start date.")
      expect(onSubmit).not.toHaveBeenCalled()
    })

    it('holds a number to its range: below, above and not whole are refused, the ends are taken', async () => {
      const onSubmit = vi.fn().mockResolvedValue({})
      render(<FormDialog open title="Book" fields={[{ name: 'hoursPerWeek', label: 'Hours per week', type: 'number', min: 1, max: 40 }]} onClose={vi.fn()} onSubmit={onSubmit} />)
      const box = screen.getByLabelText(/hours per week/i)
      const save = () => userEvent.click(screen.getByRole('button', { name: /save/i }))
      for (const bad of ['0', '41', '2.5']) {
        fireEvent.change(box, { target: { value: bad } })
        await save()
        expect(box).toHaveAccessibleDescription('Enter a whole number from 1 to 40.')
      }
      expect(onSubmit).not.toHaveBeenCalled()
      fireEvent.change(box, { target: { value: '40' } })
      await save()
      expect(onSubmit).toHaveBeenCalledWith({ hoursPerWeek: 40 })
    })

    it('shows an error with no field on one line just above the buttons, never at the top of the form', async () => {
      const onSubmit = vi.fn().mockRejectedValue(new ApiError(409, 'That would overlap an existing booking.'))
      renderForm({ onSubmit })
      await userEvent.type(screen.getByLabelText(/^name/i), 'Apollo')
      await userEvent.click(screen.getByRole('button', { name: /save/i }))
      const line = await screen.findByRole('alert')
      expect(line).toHaveTextContent('That would overlap an existing booking.')
      expect(line.closest('.MuiDialogContent-root')).toBeNull()
      expect(line.nextElementSibling).toBe(screen.getByRole('button', { name: /cancel/i }).parentElement)
    })

    it('clears that line when the form is sent again', async () => {
      const onSubmit = vi.fn()
        .mockRejectedValueOnce(new ApiError(409, 'That would overlap an existing booking.'))
        .mockResolvedValueOnce({})
      renderForm({ onSubmit })
      await userEvent.type(screen.getByLabelText(/^name/i), 'Apollo')
      await userEvent.click(screen.getByRole('button', { name: /save/i }))
      await screen.findByRole('alert')
      await userEvent.click(screen.getByRole('button', { name: /save/i }))
      await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
    })
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
      expect(screen.getByLabelText('Minutes')).toHaveAccessibleDescription('Minutes must be under 60')
      expect(screen.getByLabelText('Minutes')).toHaveAttribute('aria-invalid', 'true')
      expect(onSubmit).not.toHaveBeenCalled()
    })

    it('takes 59 minutes but not 60', async () => {
      const onSubmit = renderDuration(TIME)
      await enter('1', '60')
      expect(screen.getByLabelText('Minutes')).toHaveAccessibleDescription('Minutes must be under 60')
      expect(onSubmit).not.toHaveBeenCalled()
      await userEvent.clear(screen.getByLabelText('Minutes'))
      await userEvent.type(screen.getByLabelText('Minutes'), '59')
      await userEvent.click(screen.getByRole('button', { name: /save/i }))
      expect(onSubmit).toHaveBeenCalledWith({ minutes: 119 })
    })

    it('refuses 2.5 minutes, which is not a whole number', async () => {
      const onSubmit = renderDuration(TIME)
      await enter('', '2.5')
      expect(screen.getByLabelText('Minutes')).toHaveAccessibleDescription('Minutes must be a whole number from 0 to 59.')
      expect(onSubmit).not.toHaveBeenCalled()
    })

    it('refuses 2.5 hours and negative hours under the Hours box', async () => {
      const onSubmit = renderDuration(TIME)
      await enter('2.5', '')
      expect(screen.getByLabelText('Hours')).toHaveAccessibleDescription('Hours must be a whole number, 0 or more.')
      await userEvent.clear(screen.getByLabelText('Hours'))
      await userEvent.type(screen.getByLabelText('Hours'), '-1')
      await userEvent.click(screen.getByRole('button', { name: /save/i }))
      expect(screen.getByLabelText('Hours')).toHaveAccessibleDescription('Hours must be a whole number, 0 or more.')
      expect(onSubmit).not.toHaveBeenCalled()
    })

    it('shows a mistake in each box at once', async () => {
      const onSubmit = renderDuration(TIME)
      await enter('x', '75')
      expect(screen.getByLabelText('Hours')).toHaveAccessibleDescription('Hours must be a whole number, 0 or more.')
      expect(screen.getByLabelText('Minutes')).toHaveAccessibleDescription('Minutes must be under 60')
      expect(onSubmit).not.toHaveBeenCalled()
    })

    it('refuses no time at all, under the Hours box', async () => {
      const onSubmit = renderDuration(TIME)
      await enter('', '')
      expect(screen.getByLabelText('Hours')).toHaveAccessibleDescription('Enter some time: at least 1 minute.')
      expect(onSubmit).not.toHaveBeenCalled()
    })

    it('refuses 0 h 0 min when required: the total must be above 0', async () => {
      const onSubmit = renderDuration(TIME)
      await enter('0', '0')
      expect(screen.getByLabelText('Hours')).toHaveAccessibleDescription('Enter some time: at least 1 minute.')
      expect(onSubmit).not.toHaveBeenCalled()
    })

    it('refuses more than its maximum: 24 h 30 min of logged time', async () => {
      const onSubmit = renderDuration(TIME)
      await enter('24', '30')
      expect(screen.getByLabelText('Hours')).toHaveAccessibleDescription('One entry can hold at most 24 h.')
      expect(onSubmit).not.toHaveBeenCalled()
    })

    it('takes exactly 24 h of logged time', async () => {
      const onSubmit = renderDuration(TIME)
      await enter('24', '0')
      expect(onSubmit).toHaveBeenCalledWith({ minutes: 1440 })
    })

    it('lets the Hours box take any whole number, and the total decide: 99 h is too much for one entry', async () => {
      const onSubmit = renderDuration(TIME)
      await enter('99', '')
      expect(screen.getByLabelText('Hours')).toHaveAccessibleDescription('One entry can hold at most 24 h.')
      expect(onSubmit).not.toHaveBeenCalled()
    })

    it('copes with an absurdly long number of hours', async () => {
      const onSubmit = renderDuration(TIME)
      fireEvent.change(screen.getByLabelText('Hours'), { target: { value: '9'.repeat(400) } })
      await userEvent.click(screen.getByRole('button', { name: /save/i }))
      expect(screen.getByLabelText('Hours')).toHaveAccessibleDescription('One entry can hold at most 24 h.')
      expect(onSubmit).not.toHaveBeenCalled()
    })

    it('words the limit for other fields as "more than" their maximum', async () => {
      const onSubmit = renderDuration(ESTIMATE)
      await enter('1000', '1')
      expect(screen.getByLabelText('Hours')).toHaveAccessibleDescription('That is more than 1000 h.')
      expect(onSubmit).not.toHaveBeenCalled()
    })

    it('takes an estimate of 100 h and of 1000 h but not 1001 h', async () => {
      const onSubmit = renderDuration(ESTIMATE)
      await enter('1001', '')
      expect(screen.getByLabelText('Hours')).toHaveAccessibleDescription('That is more than 1000 h.')
      expect(onSubmit).not.toHaveBeenCalled()
      await userEvent.clear(screen.getByLabelText('Hours'))
      await enter('100', '')
      expect(onSubmit).toHaveBeenCalledWith({ estimateMinutes: 6000 })
      await userEvent.clear(screen.getByLabelText('Hours'))
      await enter('1000', '')
      expect(onSubmit).toHaveBeenLastCalledWith({ estimateMinutes: 60000 })
    })

    it('with no maximum, any whole number of hours is sent as minutes', async () => {
      const onSubmit = renderDuration({ name: 'span', label: 'Span', type: 'duration', required: true })
      const group = screen.getByRole('group', { name: /span/i })
      await userEvent.type(within(group).getByLabelText('Hours'), '5000')
      await userEvent.click(screen.getByRole('button', { name: /save/i }))
      expect(onSubmit).toHaveBeenCalledWith({ span: 300000 })
    })

    it('with no maximum, a number too big to count is refused instead of sent', async () => {
      const onSubmit = renderDuration({ name: 'span', label: 'Span', type: 'duration', required: true })
      fireEvent.change(screen.getByLabelText('Hours'), { target: { value: '9'.repeat(400) } })
      await userEvent.click(screen.getByRole('button', { name: /save/i }))
      expect(screen.getByLabelText('Hours')).toHaveAccessibleDescription('That is too many hours.')
      expect(onSubmit).not.toHaveBeenCalled()
    })

    it('a field that is not required may be left empty (nothing sent) or set to 0', async () => {
      const optional = { name: 'extra', label: 'Extra', type: 'duration', max: 1440 }
      const onSubmit = renderDuration(optional)
      await userEvent.click(screen.getByRole('button', { name: /save/i }))
      expect(onSubmit).toHaveBeenLastCalledWith({})
      await userEvent.type(screen.getByLabelText('Hours'), '0')
      await userEvent.click(screen.getByRole('button', { name: /save/i }))
      expect(onSubmit).toHaveBeenLastCalledWith({ extra: 0 })
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

  it('has one primary button (Save) and Cancel as the secondary kind', () => {
    renderForm({})
    expect(screen.getByRole('button', { name: /save/i })).toHaveClass('MuiButton-contained')
    expect(screen.getByRole('button', { name: /cancel/i })).toHaveClass('MuiButton-outlined')
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
