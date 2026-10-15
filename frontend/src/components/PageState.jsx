import PropTypes from 'prop-types'
import { Alert, Box, Button, CircularProgress, Pagination, Typography } from '@mui/material'

/**
 * The three states every screen has besides "here is your data": loading, failed
 * (with Retry) and empty. The first request after a quiet spell can take ~15 s while
 * the database wakes up, so the loading text says so.
 */
export default function PageState({ loading, error, onRetry, empty, children }) {
  if (loading) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 6, justifyContent: 'center' }}>
        <CircularProgress size={28} />
        <Typography color="text.secondary">Loading… the first request after a quiet spell can take up to 15 seconds.</Typography>
      </Box>
    )
  }
  if (error) {
    return (
      <Alert
        severity="error"
        sx={{ my: 2 }}
        action={onRetry && <Button color="inherit" size="small" onClick={onRetry}>Retry</Button>}
      >
        {typeof error === 'string' ? error : error.message}
      </Alert>
    )
  }
  if (empty) {
    return (
      <Box sx={{ py: 6, textAlign: 'center' }}>
        <Typography color="text.secondary">{empty}</Typography>
      </Box>
    )
  }
  return children ?? null
}

PageState.propTypes = {
  /** Show the spinner instead of the content. */
  loading: PropTypes.bool,
  /** An ApiError or a message: shows an error with Retry. */
  error: PropTypes.oneOfType([PropTypes.string, PropTypes.shape({ message: PropTypes.string })]),
  /** Called by the Retry button. */
  onRetry: PropTypes.func,
  /** When set, the empty-state message to show instead of the content. */
  empty: PropTypes.node,
  children: PropTypes.node,
}

/** Shown instead of a page whose code couldn't be downloaded; lazyPage uses it. */
export function PageLoadFailed() {
  return (
    <Alert severity="warning" action={<Button color="inherit" onClick={() => window.location.reload()}>Reload</Button>}>
      This page couldn&apos;t load. The website may have been updated since you opened it.
    </Alert>
  )
}

/** Page numbers under a list; nothing when there is one page or none. onChange gets the new page number. */
export function Pager({ page, totalPages, onChange }) {
  if (!(totalPages > 1)) return null
  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
      <Pagination count={totalPages} page={page} onChange={(_, value) => onChange(value)} />
    </Box>
  )
}

Pager.propTypes = {
  /** The page shown now, from 1. */
  page: PropTypes.number.isRequired,
  /** The list's totalPages; may be missing while it loads. */
  totalPages: PropTypes.number,
  /** Called with the chosen page number. */
  onChange: PropTypes.func.isRequired,
}
