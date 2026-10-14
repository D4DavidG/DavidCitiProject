import PropTypes from 'prop-types'
import { Alert } from '@mui/material'
import PageHeader from './PageHeader'

/** Placeholder for a screen that isn't built yet, so the menu never leads nowhere. */
export default function ComingSoon({ title }) {
  return (
    <>
      <PageHeader title={title} />
      <Alert severity="info">This screen is coming soon. The backend for it is already built and tested.</Alert>
    </>
  )
}

ComingSoon.propTypes = {
  title: PropTypes.string.isRequired,
}
