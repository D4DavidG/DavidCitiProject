import { createTheme } from '@mui/material/styles'

/*
 * Clean corporate: white cards on light grey, one navy accent (decided 13 Oct).
 * Light theme only; dark mode is out of the MVP.
 * Contrast ratios are against the background each colour is used on (WCAG AA needs 4.5:1).
 */
const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#0B3D91' }, // navy; white text on it 10.0:1
    secondary: { main: '#1565C0' }, // blue; white text on it 5.8:1
    error: { main: '#C62828' }, // at risk, over capacity; white text 5.6:1
    warning: { main: '#A15C00' }, // pending, near capacity; white text 5.2:1
    success: { main: '#2E7D32' }, // on track, done; white text 5.1:1
    background: { default: '#F4F6F8', paper: '#FFFFFF' },
    text: { primary: '#1F2937', secondary: '#4B5563' }, // on #F4F6F8: 13.5:1 and 7.0:1
  },
  shape: { borderRadius: 8 },
  typography: {
    fontFamily: '"Inter", "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    h1: { fontSize: '1.75rem', fontWeight: 600 },
    h2: { fontSize: '1.375rem', fontWeight: 600 },
    h3: { fontSize: '1.125rem', fontWeight: 600 },
  },
  components: {
    MuiCard: { defaultProps: { variant: 'outlined' } },
    MuiButton: { defaultProps: { disableElevation: true }, styleOverrides: { root: { textTransform: 'none' } } },
    MuiAppBar: { defaultProps: { elevation: 0 } },
    MuiTab: { styleOverrides: { root: { textTransform: 'none', fontWeight: 600 } } },
  },
})

export default theme
