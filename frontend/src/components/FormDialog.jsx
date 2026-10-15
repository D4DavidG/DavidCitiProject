import { useEffect, useRef, useState } from 'react'
import PropTypes from 'prop-types'
import {
  Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, FormHelperText, FormLabel, MenuItem, TextField,
} from '@mui/material'
import { centsToDollarsInput, formatHours, parseDollars, splitMinutes } from '../services/format'

function toInput(field, value) {
  if (field.type === 'duration') return splitMinutes(value)
  if (value === null || value === undefined) return ''
  if (field.type === 'money') return centsToDollarsInput(value)
  return String(value)
}

function fromInput(field, text) {
  if (text === '') return field.type === 'text' || field.type === 'textarea' || !field.type ? text : null
  if (field.type === 'number' || (field.type === 'select' && field.numeric)) return Number(text)
  if (field.type === 'money') return parseDollars(text)
  if (field.type === 'boolean') return text === 'true'
  return text
}

const YES_NO = [['true', 'Yes'], ['false', 'No']]

/** Where a duration field's Minutes-box error is kept; its Hours-box error uses the field's own name. */
const minutesKey = (name) => `${name}.minutes`

const WHOLE = /^\d+$/

/** What a required field says when it is empty; the label sits right above it, so the words stay short. */
const REQUIRED = { select: 'Choose an option.', boolean: 'Choose an option.', date: 'Enter a date.' }

/** The id of the box to focus for a field: a duration's Hours box, or the field itself. */
const boxId = (field, part = 'hours') => (field.type === 'duration' ? `field-${field.name}-${part}` : `field-${field.name}`)

/** Message for a number outside min..max (either end may be missing) or not whole, else null. */
function checkNumber(text, { min, max }) {
  const n = Number(text)
  if (Number.isInteger(n) && (min === undefined || n >= min) && (max === undefined || n <= max)) return null
  if (min !== undefined && max !== undefined) return `Enter a whole number from ${min} to ${max}.`
  if (min !== undefined) return `Enter a whole number, ${min} or more.`
  if (max !== undefined) return `Enter a whole number, ${max} or less.`
  return null
}

/** Logged time is capped at a day by the database (`time_entries_minutes_range`); say so in its own words. */
const ONE_DAY = 1440

/**
 * What was typed in a duration's Hours and Minutes boxes -> { minutes } in total, or
 * { hours, minutes } holding the message for each box that is wrong (the total's own
 * messages sit under Hours). An empty box counts as 0. The Hours box takes any whole
 * number: only the total is held to `max` (minutes), so 99 h fails as "too much for one
 * entry", not as a bad Hours box. A required field's total must be above 0.
 */
function checkDuration(hoursText, minutesText, { max, required }) {
  const hours = hoursText.trim() || '0'
  const minutes = minutesText.trim() || '0'
  const errors = {}
  if (!WHOLE.test(hours)) errors.hours = 'Hours must be a whole number, 0 or more.'
  if (!WHOLE.test(minutes)) errors.minutes = 'Minutes must be a whole number from 0 to 59.'
  else if (Number(minutes) > 59) errors.minutes = 'Minutes must be under 60'
  if (errors.hours || errors.minutes) return { errors }
  const total = Number(hours) * 60 + Number(minutes)
  if (required && total === 0) return { errors: { hours: 'Enter some time: at least 1 minute.' } }
  if (max === ONE_DAY && total > max) return { errors: { hours: 'One entry can hold at most 24 h.' } }
  if (max !== undefined && total > max) return { errors: { hours: `That is more than ${formatHours(max)}.` } }
  if (!Number.isSafeInteger(total)) return { errors: { hours: 'That is too many hours.' } }
  return { minutes: total }
}

/**
 * A duration as two short boxes, Hours and Minutes, side by side on every screen
 * size, grouped under the field's label. Whole numbers only: type text with a
 * numeric keypad, so "2.5" reaches validation instead of being mangled by the browser.
 */
function DurationField({ field, value, errors, disabled = false, onChange }) {
  const helperId = `field-${field.name}-helper`
  const box = (part, label, error) => (
    <TextField
      id={`field-${field.name}-${part}`}
      label={label}
      value={value[part]}
      onChange={(e) => onChange({ ...value, [part]: e.target.value })}
      error={Boolean(error)}
      helperText={error}
      disabled={disabled}
      sx={{ flex: 1 }}
      slotProps={{ htmlInput: { inputMode: 'numeric' } }}
    />
  )
  return (
    <FormControl
      component="fieldset"
      required={field.required}
      error={Boolean(errors.hours || errors.minutes)}
      aria-describedby={field.helper ? helperId : undefined}
    >
      <FormLabel component="legend" sx={{ mb: 1.5 }}>{field.label}</FormLabel>
      <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
        {box('hours', 'Hours', errors.hours)}
        {box('minutes', 'Minutes', errors.minutes)}
      </Box>
      {field.helper && <FormHelperText id={helperId} error={false}>{field.helper}</FormHelperText>}
    </FormControl>
  )
}

DurationField.propTypes = {
  field: PropTypes.shape({
    name: PropTypes.string.isRequired,
    label: PropTypes.string.isRequired,
    required: PropTypes.bool,
    helper: PropTypes.node,
  }).isRequired,
  /** The text in each box. */
  value: PropTypes.shape({ hours: PropTypes.string, minutes: PropTypes.string }).isRequired,
  /** The message to show under each box, if any. */
  errors: PropTypes.shape({ hours: PropTypes.string, minutes: PropTypes.string }).isRequired,
  /** True while the form is saving. */
  disabled: PropTypes.bool,
  onChange: PropTypes.func.isRequired,
}

/**
 * A create or edit form in a dialog. Fields: { name, label, type?, options?, required?, helper?, max? }
 * where type is text (default), textarea, number, money (typed in dollars, sent as
 * cents), duration (typed as whole Hours and Minutes, sent as minutes; Hours takes
 * any whole number, Minutes 0 to 59, and the total at most `max` minutes), date, select
 * or boolean (Yes/No). A required field left empty, a number outside `min` to `max` (whole
 * numbers), a date before the one named in `notBefore`, a bad amount and a bad duration are
 * all caught before anything is sent: the mistake shows under its box, focus moves to the
 * first box with a problem, and nothing is sent. With `initial`,
 * only the fields that changed are sent, so a manager never sends an admin-only field
 * they didn't touch. Server errors with a `field` show on that field (a duration's
 * under its Hours box); others show as one line just above the buttons. While it saves,
 * every field and button is disabled, Escape can't close it, and a second submit is
 * ignored; all of it comes back on success or error.
 */
export default function FormDialog({ open, title, fields, initial = null, defaults = null, submitLabel = 'Save', onSubmit, onClose }) {
  const [values, setValues] = useState(() => Object.fromEntries(
    fields.map((f) => [f.name, toInput(f, initial?.[f.name] ?? defaults?.[f.name])]),
  ))
  const [fieldErrors, setFieldErrors] = useState({})
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  // Which box to focus; a new object each time, so asking for the same box twice still moves focus.
  const [focusRequest, setFocusRequest] = useState(null)
  // Set at once, unlike `busy` (state lands on the next render): a second submit in the
  // same moment, e.g. a double Enter, sees it and sends nothing.
  const saving = useRef(false)

  // After the render, so a box the save had locked is enabled again and can take the focus.
  useEffect(() => {
    if (focusRequest) document.getElementById(focusRequest.id)?.focus()
  }, [focusRequest])

  async function submit(event) {
    event.preventDefault()
    if (saving.current) return
    const body = {}
    const problems = {}
    let firstBad = null // the id of the first box with a problem, in form order
    const flag = (key, id, message) => {
      problems[key] = message
      firstBad ??= id
    }
    fields.forEach((field) => {
      if (field.type === 'duration') {
        const { hours, minutes } = values[field.name]
        if (!field.required && hours.trim() === '' && minutes.trim() === '') return
        const checked = checkDuration(hours, minutes, field)
        if (checked.errors) {
          if (checked.errors.hours) flag(field.name, boxId(field), checked.errors.hours)
          if (checked.errors.minutes) flag(minutesKey(field.name), boxId(field, 'minutes'), checked.errors.minutes)
        } else if (!initial || checked.minutes !== initial[field.name]) body[field.name] = checked.minutes
        return
      }
      const text = values[field.name].trim()
      // An end date is held against its start date even when only the start was edited.
      const start = field.notBefore && fields.find((f) => f.name === field.notBefore)
      if (start && text !== '' && text < values[start.name].trim()) {
        flag(field.name, boxId(field), `${field.label} can't be before ${start.label.toLowerCase()}.`)
        return
      }
      // Unchanged on an edit: not sent, and not checked (the record already holds it).
      if (initial && text === toInput(field, initial[field.name])) return
      if (text === '') {
        if (field.required) flag(field.name, boxId(field), REQUIRED[field.type] ?? 'This field is required.')
        else if (initial) body[field.name] = fromInput(field, '') // an edit that empties an optional box clears it
        return
      }
      const value = fromInput(field, text)
      if (field.type === 'money' && value === null) flag(field.name, boxId(field), 'Enter an amount in dollars, e.g. 12,500.')
      else if (field.type === 'number' && checkNumber(text, field)) flag(field.name, boxId(field), checkNumber(text, field))
      else body[field.name] = value
    })
    setFieldErrors(problems)
    setError(null)
    if (firstBad) {
      setFocusRequest({ id: firstBad })
      return
    }
    if (initial && Object.keys(body).length === 0) {
      onClose()
      return
    }
    saving.current = true
    setBusy(true)
    try {
      await onSubmit(body)
      onClose()
    } catch (failure) {
      const named = failure.field && fields.find((f) => f.name === failure.field)
      if (named) {
        setFieldErrors({ [named.name]: failure.message })
        setFocusRequest({ id: boxId(named) })
      } else setError(failure.message)
    } finally {
      saving.current = false
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onClose={() => { if (!busy) onClose() }} fullWidth maxWidth="sm">
      <form onSubmit={submit} noValidate>
        <DialogTitle>{title}</DialogTitle>
        <DialogContent sx={{ display: 'grid', gap: 2, pt: '8px !important' }}>
          {fields.map((field) => (field.type === 'duration' ? (
            <DurationField
              key={field.name}
              field={field}
              value={values[field.name]}
              errors={{ hours: fieldErrors[field.name], minutes: fieldErrors[minutesKey(field.name)] }}
              disabled={busy}
              onChange={(value) => setValues({ ...values, [field.name]: value })}
            />
          ) : (
            <TextField
              key={field.name}
              id={`field-${field.name}`}
              label={field.label}
              required={field.required}
              type={field.type === 'date' ? 'date' : field.type === 'number' ? 'number' : 'text'}
              select={field.type === 'select' || field.type === 'boolean'}
              multiline={field.type === 'textarea'}
              minRows={field.type === 'textarea' ? 3 : undefined}
              value={values[field.name]}
              onChange={(e) => setValues({ ...values, [field.name]: String(e.target.value) })}
              error={Boolean(fieldErrors[field.name])}
              helperText={fieldErrors[field.name] ?? field.helper}
              disabled={busy}
              slotProps={{
                inputLabel: field.type === 'date' ? { shrink: true } : undefined,
                htmlInput: field.type === 'money' ? { inputMode: 'decimal' } : undefined,
              }}
            >
              {(field.type === 'boolean' ? YES_NO : field.type === 'select' ? field.options ?? [] : [])
                .map(([value, label]) => <MenuItem key={value} value={String(value)}>{label}</MenuItem>)}
            </TextField>
          )))}
        </DialogContent>
        {/* An error that belongs to no field: one line next to the buttons just pressed. */}
        {error && <FormHelperText error role="alert" sx={{ mx: 3, mb: 1, fontSize: '0.875rem' }}>{error}</FormHelperText>}
        <DialogActions>
          <Button variant="outlined" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={busy}>{busy ? 'Saving…' : submitLabel}</Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}

FormDialog.propTypes = {
  open: PropTypes.bool.isRequired,
  title: PropTypes.string.isRequired,
  fields: PropTypes.arrayOf(PropTypes.shape({
    name: PropTypes.string.isRequired,
    label: PropTypes.string.isRequired,
    type: PropTypes.oneOf(['text', 'textarea', 'number', 'money', 'duration', 'date', 'select', 'boolean']),
    /** [value, label] pairs for a select. */
    options: PropTypes.arrayOf(PropTypes.array),
    /** A select whose values are ids: sent as numbers. */
    numeric: PropTypes.bool,
    required: PropTypes.bool,
    helper: PropTypes.node,
    /** A duration's largest total in minutes, the server's own limit (1440 for logged time; it holds the total only, never the Hours box). For a number, its largest value. */
    max: PropTypes.number,
    /** A number's smallest value. */
    min: PropTypes.number,
    /** A date field that may not be earlier than the date field with this name (an end date names its start). */
    notBefore: PropTypes.string,
  })).isRequired,
  /** Current values when editing (API field names); omit when creating. */
  initial: PropTypes.object,
  /** Pre-filled values for a new record; sent like anything typed. */
  defaults: PropTypes.object,
  submitLabel: PropTypes.string,
  /** Receives the body to send; reject with an ApiError to show it. */
  onSubmit: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
}
