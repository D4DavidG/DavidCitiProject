import { useEffect, useRef, useState } from 'react'
import PropTypes from 'prop-types'
import { Box, IconButton, InputAdornment, TextField } from '@mui/material'
import ClearOutlined from '@mui/icons-material/ClearOutlined'
import SearchOutlined from '@mui/icons-material/SearchOutlined'
import { useIsMobile } from '../theme/responsive'

/** How long typing must pause before the search is sent, in milliseconds. */
const DELAY_MS = 300

/**
 * The search box at the top of a list. It filters as you type: 300 ms after you stop
 * it calls `onSearch(q)` with the trimmed text, and at once when the box is emptied
 * (by the X or by deleting) or Enter is pressed. It never repeats a search the page
 * already has. The page owns the results: on `onSearch` it should keep `q` in its
 * query and go back to page 1. The box keeps its own text, so `value` is only the
 * starting text (to reset it from outside, give the field a new `key`).
 */
export default function SearchField({ label, value = '', onSearch, placeholder, id }) {
  const isMobile = useIsMobile()
  const [text, setText] = useState(value)
  const input = useRef(null)
  const timer = useRef(null)
  const lastSent = useRef(value.trim())
  const latest = useRef(onSearch)

  // The timer must call the newest onSearch, not the one from when typing began.
  useEffect(() => { latest.current = onSearch })
  useEffect(() => () => clearTimeout(timer.current), [])

  function send(raw) {
    clearTimeout(timer.current)
    const q = raw.trim()
    if (q === lastSent.current) return
    lastSent.current = q
    latest.current(q)
  }

  function change(raw) {
    setText(raw)
    clearTimeout(timer.current)
    if (raw.trim() === '') send(raw)
    else timer.current = setTimeout(() => send(raw), DELAY_MS)
  }

  function clear() {
    setText('')
    send('')
    input.current?.focus()
  }

  return (
    <Box data-testid="search-field" sx={{ width: isMobile ? '100%' : 360, maxWidth: '100%' }}>
      <TextField
        id={id}
        label={label}
        placeholder={placeholder}
        size="small"
        fullWidth
        value={text}
        inputRef={input}
        onChange={(e) => change(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return
          e.preventDefault() // a form around the box must not also submit
          send(text)
        }}
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position="start"><SearchOutlined fontSize="small" aria-hidden /></InputAdornment>
            ),
            endAdornment: text ? (
              <InputAdornment position="end">
                <IconButton size="small" edge="end" aria-label="Clear search" onClick={clear}>
                  <ClearOutlined fontSize="small" />
                </IconButton>
              </InputAdornment>
            ) : undefined,
          },
        }}
      />
    </Box>
  )
}

SearchField.propTypes = {
  /** The field's label and accessible name, e.g. "Search projects". */
  label: PropTypes.string.isRequired,
  /** The starting text (e.g. a search kept in the page's state). */
  value: PropTypes.string,
  /** Called with the trimmed text 300 ms after typing stops, and at once for ''. */
  onSearch: PropTypes.func.isRequired,
  /** Hint shown inside the box, e.g. "Name, username or email". */
  placeholder: PropTypes.string,
  /** The input's id, for a test or a link that needs a stable one. */
  id: PropTypes.string,
}
