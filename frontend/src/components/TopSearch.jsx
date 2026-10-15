import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import {
  Autocomplete, Box, IconButton, InputAdornment, TextField, Tooltip,
} from '@mui/material'
import SearchIcon from '@mui/icons-material/SearchOutlined'
import CloseIcon from '@mui/icons-material/CloseOutlined'
import FolderIcon from '@mui/icons-material/FolderOutlined'
import { useAuth } from '../auth/useAuth'
import { request } from '../services/request'
import { useApi } from '../services/useApi'
import { useIsMobile } from '../theme/responsive'
import { FIELD, matchPages } from './searchPages'

/** How long typing must pause before projects are searched, in milliseconds. */
const DELAY_MS = 250
/** Projects are searched from this many characters; pages from the first. */
const MIN_PROJECT_CHARS = 2
/** How many projects the list shows. */
const PROJECT_LIMIT = 5
/** The longest search the server takes (`values.search`). */
const MAX_LENGTH = 100
const NAME = 'Search pages and projects'

/** While there is nothing to search, there is nothing to ask the server. */
const nothing = () => Promise.resolve(null)

/** True when a key press lands in something you type into, where "/" is just a character. */
function isTyping(target) {
  return Boolean(target?.closest?.('input, textarea, select, [contenteditable="true"], [role="dialog"], [role="menu"], [role="listbox"]'))
}

/** The field: white with dark words and rounded corners, calm on the green bar (no glow). */
const FIELD_SX = {
  '& .MuiOutlinedInput-root': {
    bgcolor: FIELD.background,
    color: FIELD.ink,
    borderRadius: '8px',
    '& .MuiOutlinedInput-notchedOutline': { borderColor: 'transparent' },
    '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'transparent' },
    '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: FIELD.focus, borderWidth: 2 },
  },
  '& .MuiInputBase-input::placeholder': { color: FIELD.placeholder, opacity: 1 },
  '& .MuiSvgIcon-root': { color: FIELD.placeholder },
}

/**
 * The search in the top bar: type to jump to one of your pages (by name, or another word such as
 * "home" or "time") or to a project (GET /projects, the projects you may see: 5 at most, from 2
 * characters, 250 ms after you pause, an older answer that lands late is dropped by useApi).
 * Choosing goes there and clears the box. "/" (outside a field) or Ctrl+K / Cmd+K jumps into it;
 * Escape closes it. On phones it is a search button that opens the box across the whole bar.
 * A failed project search still shows the matching pages.
 */
export default function TopSearch() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const input = useRef(null)
  const timer = useRef(null)
  const [expanded, setExpanded] = useState(false) // phones: the box is open across the bar
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [q, setQ] = useState('')
  useEffect(() => () => clearTimeout(timer.current), [])

  const load = useCallback(
    () => (q ? request('GET', '/projects', { query: { q, pageSize: PROJECT_LIMIT } }) : nothing()),
    [q],
  )
  const { data, error, loading } = useApi(load)

  const typed = text.trim()
  const searching = typed.length >= MIN_PROJECT_CHARS && (q !== typed || loading)
  // Only the answer for what is in the box now; a failed search just leaves projects out.
  const projects = q && q === typed && !loading && !error ? (data?.items ?? []) : []
  const options = [
    ...matchPages(typed, user.role).map(({ to, label, icon }) => ({ key: `page ${to}`, group: 'Pages', label, to, icon })),
    ...projects.slice(0, PROJECT_LIMIT).map(({ projectId, name }) => ({
      key: `project ${projectId}`, group: 'Projects', label: name, to: `/projects/${projectId}`, icon: FolderIcon,
    })),
  ]

  // "/" outside a field, or Ctrl+K / Cmd+K anywhere, jumps into the search.
  useEffect(() => {
    function onKey(event) {
      // A browser's autofill can send a keydown with no key at all.
      const ctrlK = (event.ctrlKey || event.metaKey) && String(event.key ?? '').toLowerCase() === 'k'
      const slash = event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey && !isTyping(event.target)
      if (!ctrlK && !slash) return
      event.preventDefault()
      if (isMobile) setExpanded(true)
      input.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isMobile])

  function type(raw) {
    setText(raw)
    clearTimeout(timer.current)
    const next = raw.trim()
    if (next.length < MIN_PROJECT_CHARS) setQ('')
    else timer.current = setTimeout(() => setQ(next), DELAY_MS)
  }

  function clear() {
    clearTimeout(timer.current)
    setText('')
    setQ('')
    setOpen(false)
  }

  function close() {
    clear()
    setExpanded(false)
  }

  function choose(option) {
    if (!option) return
    navigate(option.to)
    if (isMobile) close()
    else clear()
  }

  const listOpen = open && typed !== ''

  const field = (
    <Autocomplete
      open={listOpen}
      onOpen={() => setOpen(true)}
      onClose={() => setOpen(false)}
      value={null}
      onChange={(_, option) => choose(option)}
      inputValue={text}
      onInputChange={(_, raw) => type(raw)}
      onKeyDown={(event) => {
        // Escape with the list already shut closes the phone's box (the list closes on the first Escape).
        if (event.key === 'Escape' && !listOpen && isMobile) close()
      }}
      options={options}
      // Pages are matched here and projects by the server: nothing to filter again.
      filterOptions={(found) => found}
      groupBy={(option) => option.group}
      getOptionLabel={(option) => option.label}
      getOptionKey={(option) => option.key}
      autoHighlight
      blurOnSelect
      clearOnEscape
      loading={searching}
      loadingText="Searching…"
      noOptionsText="No pages or projects match"
      size="small"
      popupIcon={null}
      forcePopupIcon={false}
      sx={{ width: isMobile ? '100%' : { sm: 240, md: 320 }, ...FIELD_SX }}
      renderOption={({ key, ...props }, option) => {
        const Icon = option.icon
        return (
          <Box component="li" key={key} {...props} sx={{ gap: 1.5 }}>
            <Icon fontSize="small" aria-hidden="true" sx={{ color: 'text.secondary' }} />
            {option.label}
          </Box>
        )
      }}
      renderInput={(params) => (
        <TextField
          {...params}
          inputRef={input}
          placeholder={NAME}
          autoFocus={isMobile}
          onBlur={() => { if (isMobile) close() }}
          slotProps={{
            ...params.slotProps,
            input: {
              ...params.slotProps.input,
              startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>,
            },
            htmlInput: { ...params.slotProps.htmlInput, 'aria-label': NAME, maxLength: MAX_LENGTH },
          }}
        />
      )}
    />
  )

  if (!isMobile) return field

  return (
    <>
      <Tooltip title={NAME}>
        <IconButton color="inherit" aria-label={NAME} onClick={() => setExpanded(true)}>
          <SearchIcon />
        </IconButton>
      </Tooltip>
      {expanded && (
        // Across the whole bar, on the bar's own green, until you choose, close or leave it. Above the
        // bell's count (a badge has z-index 1 and comes later in the bar), so nothing shows through.
        <Box data-testid="search-across-bar" sx={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 3, display: 'flex', alignItems: 'center', gap: 1, px: 1, bgcolor: 'header.main' }}>
          {field}
          <IconButton color="inherit" aria-label="Close search" onMouseDown={(event) => event.preventDefault()} onClick={close}>
            <CloseIcon />
          </IconButton>
        </Box>
      )}
    </>
  )
}
