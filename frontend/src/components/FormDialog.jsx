import { useState } from 'react'
import PropTypes from 'prop-types'
import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, FormHelperText, FormLabel, MenuItem, TextField,
} from '@mui/material'
import { centsToDollarsInput, parseDollars, parseDuration, splitMinutes } from '../services/format'

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

/**
 * A duration as two short boxes, Hours and Minutes, side by side on every screen
 * size, grouped under the field's label. Whole numbers only: type text with a
 * numeric keypad, so "2.5" reaches validation instead of being mangled by the browser.
 */
function DurationField({ field, value, errors, onChange }) {
  const helperId = `field-${field.name}-helper`
  const box = (part, label, error) => (
    <TextField
      id={`field-${field.name}-${part}`}
      label={label}
      value={value[part]}
      onChange={(e) => onChange({ ...value, [part]: e.target.value })}
      error={Boolean(error)}
      helperText={error}
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
  onChange: PropTypes.func.isRequired,
}

/**
 * A create or edit form in a dialog. Fields: { name, label, type?, options?, required?, helper?, max? }
 * where type is text (default), textarea, number, money (typed in dollars, sent as
 * cents), duration (typed as whole Hours and Minutes, sent as minutes, at most `max`
 * minutes), date, select or boolean (Yes/No). Durations and money are checked before
 * anything is sent; a mistake shows under its box and nothing is sent. With `initial`,
 * only the fields that changed are sent, so a manager never sends an admin-only field
 * they didn't touch. Server errors with a `field` show on that field (a duration's
 * under its Hours box); others show above the form.
 */
export default function FormDialog({ open, title, fields, initial = null, defaults = null, submitLabel = 'Save', onSubmit, onClose }) {
  const [values, setValues] = useState(() => Object.fromEntries(
    fields.map((f) => [f.name, toInput(f, initial?.[f.name] ?? defaults?.[f.name])]),
  ))
  const [fieldErrors, setFieldErrors] = useState({})
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  async function submit(event) {
    event.preventDefault()
    const body = {}
    const problems = {}
    fields.forEach((field) => {
      if (field.type === 'duration') {
        const { hours, minutes } = values[field.name]
        if (!field.required && hours.trim() === '' && minutes.trim() === '') return
        const parsed = parseDuration(hours, minutes, field.max)
        if (parsed.error) problems[parsed.box === 'minutes' ? minutesKey(field.name) : field.name] = parsed.error
        else if (!initial || parsed.minutes !== initial[field.name]) body[field.name] = parsed.minutes
        return
      }
      const text = values[field.name].trim()
      if (initial && text === toInput(field, initial[field.name])) return
      if (!initial && text === '') return
      const value = fromInput(field, text)
      if (field.type === 'money' && value === null) problems[field.name] = 'Enter an amount in dollars, e.g. 12,500.'
      else body[field.name] = value
    })
    setFieldErrors(problems)
    setError(null)
    if (Object.keys(problems).length) return
    if (initial && Object.keys(body).length === 0) {
      onClose()
      return
    }
    setBusy(true)
    try {
      await onSubmit(body)
      onClose()
    } catch (failure) {
      if (failure.field && fields.some((f) => f.name === failure.field)) setFieldErrors({ [failure.field]: failure.message })
      else setError(failure.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <form onSubmit={submit} noValidate>
        <DialogTitle>{title}</DialogTitle>
        <DialogContent sx={{ display: 'grid', gap: 2, pt: '8px !important' }}>
          {error && <Alert severity="error">{error}</Alert>}
          {fields.map((field) => (field.type === 'duration' ? (
            <DurationField
              key={field.name}
              field={field}
              value={values[field.name]}
              errors={{ hours: fieldErrors[field.name], minutes: fieldErrors[minutesKey(field.name)] }}
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
        <DialogActions>
          <Button onClick={onClose}>Cancel</Button>
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
    /** A duration's largest total in minutes, the server's own limit (1440 for logged time). */
    max: PropTypes.number,
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
