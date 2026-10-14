import { useState } from 'react'
import PropTypes from 'prop-types'
import {
  Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, TextField,
} from '@mui/material'
import { centsToDollarsInput, parseDollars } from '../services/format'

function toInput(field, value) {
  if (value === null || value === undefined) return ''
  if (field.type === 'money') return centsToDollarsInput(value)
  if (field.type === 'hours') return String(value / 60)
  return String(value)
}

function fromInput(field, text) {
  if (text === '') return field.type === 'text' || field.type === 'textarea' || !field.type ? text : null
  if (field.type === 'number' || (field.type === 'select' && field.numeric)) return Number(text)
  if (field.type === 'money') return parseDollars(text)
  if (field.type === 'hours') return Math.round(Number(text) * 60)
  if (field.type === 'boolean') return text === 'true'
  return text
}

const YES_NO = [['true', 'Yes'], ['false', 'No']]

/**
 * A create or edit form in a dialog. Fields: { name, label, type?, options?, required?, helper? }
 * where type is text (default), textarea, number, money (typed in dollars, sent as
 * cents), hours (typed in hours, sent as minutes), date, select or boolean (Yes/No). With `initial`, only the fields that changed are sent, so a
 * manager never sends an admin-only field they didn't touch. Server errors with a
 * `field` show on that field; others show above the form.
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
          {fields.map((field) => (
            <TextField
              key={field.name}
              id={`field-${field.name}`}
              label={field.label}
              required={field.required}
              type={field.type === 'date' ? 'date' : field.type === 'number' || field.type === 'hours' ? 'number' : 'text'}
              select={field.type === 'select' || field.type === 'boolean'}
              multiline={field.type === 'textarea'}
              minRows={field.type === 'textarea' ? 3 : undefined}
              value={values[field.name]}
              onChange={(e) => setValues({ ...values, [field.name]: String(e.target.value) })}
              error={Boolean(fieldErrors[field.name])}
              helperText={fieldErrors[field.name] ?? field.helper}
              slotProps={{
                inputLabel: field.type === 'date' ? { shrink: true } : undefined,
                htmlInput: field.type === 'money' ? { inputMode: 'decimal' } : field.type === 'hours' ? { step: 0.25, min: 0 } : undefined,
              }}
            >
              {(field.type === 'boolean' ? YES_NO : field.type === 'select' ? field.options ?? [] : [])
                .map(([value, label]) => <MenuItem key={value} value={String(value)}>{label}</MenuItem>)}
            </TextField>
          ))}
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
    type: PropTypes.oneOf(['text', 'textarea', 'number', 'money', 'hours', 'date', 'select', 'boolean']),
    /** [value, label] pairs for a select. */
    options: PropTypes.arrayOf(PropTypes.array),
    /** A select whose values are ids: sent as numbers. */
    numeric: PropTypes.bool,
    required: PropTypes.bool,
    helper: PropTypes.node,
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
