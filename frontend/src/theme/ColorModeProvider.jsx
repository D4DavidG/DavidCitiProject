import { useMemo, useState } from 'react'
import PropTypes from 'prop-types'
import { ThemeProvider } from '@mui/material/styles'
import { ColorModeContext, initialMode, saveMode } from './colorMode'
import { makeTheme } from './theme'

/**
 * Light or dark for the whole app. A first visit follows the system setting; after
 * that, the person's own choice (the sun/moon button) is remembered in this browser.
 */
export default function ColorModeProvider({ children }) {
  const [mode, setMode] = useState(initialMode)
  const value = useMemo(() => ({
    mode,
    toggleMode: () => {
      const next = mode === 'dark' ? 'light' : 'dark'
      saveMode(next)
      setMode(next)
    },
  }), [mode])
  const theme = useMemo(() => makeTheme(mode), [mode])
  return (
    <ColorModeContext.Provider value={value}>
      <ThemeProvider theme={theme}>{children}</ThemeProvider>
    </ColorModeContext.Provider>
  )
}

ColorModeProvider.propTypes = {
  children: PropTypes.node.isRequired,
}
