import { useCallback, useEffect, useRef, useState } from 'react'
import PropTypes from 'prop-types'
import { Autocomplete, TextField } from '@mui/material'
import { request } from '../services/request'
import { useApi } from '../services/useApi'

/** How long typing must pause before the search is sent, in milliseconds (as SearchField). */
const DELAY_MS = 300
/** How many matches the list shows: enough to pick from, small enough to stay quick. */
const PAGE_SIZE = 20
/** The longest search the server takes (`values.search`). */
const MAX_LENGTH = 100

/** While the list is closed there is nothing to ask the server. */
const nothing = () => Promise.resolve(null)

/**
 * Choose one or more projects by name. The list comes from the server (GET /projects, the
 * projects you may see), searched as you type: 300 ms after you pause, never per key, and an
 * older answer that lands late is ignored (useApi drops it). Chosen projects show as chips;
 * none chosen means all. `onChange` gets the new list of `{ projectId, name }`.
 */
export default function ProjectPicker({ value, onChange, label = 'Projects', id }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [q, setQ] = useState('')
  const timer = useRef(null)
  useEffect(() => () => clearTimeout(timer.current), [])

  const load = useCallback(
    () => (open ? request('GET', '/projects', { query: { q, pageSize: PAGE_SIZE } }) : nothing()),
    [open, q],
  )
  const { data, error, loading } = useApi(load)
  const options = (data?.items ?? []).map(({ projectId, name }) => ({ projectId, name }))

  function type(raw) {
    setText(raw)
    clearTimeout(timer.current)
    const next = raw.trim()
    if (next === '') setQ('')
    else timer.current = setTimeout(() => setQ(next), DELAY_MS)
  }

  let noOptionsText = 'No projects to choose from.'
  if (error) noOptionsText = error.message
  else if (q) noOptionsText = 'No projects match your search.'

  return (
    <Autocomplete
      id={id}
      multiple
      open={open}
      onOpen={() => setOpen(true)}
      onClose={() => setOpen(false)}
      value={value}
      onChange={(_, next) => onChange(next)}
      inputValue={text}
      onInputChange={(_, raw) => type(raw)}
      options={options}
      // The server has already searched; the box must not filter its answer again.
      filterOptions={(found) => found}
      filterSelectedOptions
      isOptionEqualToValue={(option, chosen) => option.projectId === chosen.projectId}
      getOptionLabel={(option) => option.name}
      getOptionKey={(option) => option.projectId}
      loading={open && (loading || text.trim() !== q)}
      loadingText="Searching…"
      noOptionsText={noOptionsText}
      size="small"
      sx={{ width: { xs: '100%', sm: 360 }, maxWidth: '100%' }}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          placeholder={value.length ? undefined : 'All projects'}
          slotProps={{ ...params.slotProps, htmlInput: { ...params.slotProps.htmlInput, maxLength: MAX_LENGTH } }}
        />
      )}
    />
  )
}

ProjectPicker.propTypes = {
  /** The chosen projects, in the order they were picked. */
  value: PropTypes.arrayOf(PropTypes.shape({
    projectId: PropTypes.number.isRequired,
    name: PropTypes.string.isRequired,
  })).isRequired,
  /** Called with the new list of `{ projectId, name }` when one is added or removed. */
  onChange: PropTypes.func.isRequired,
  /** The box's label and accessible name. */
  label: PropTypes.string,
  /** The input's id, for a label or test that needs a stable one. */
  id: PropTypes.string,
}
