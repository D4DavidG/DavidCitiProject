import { alpha, createTheme } from '@mui/material/styles'

/*
 * Forest green and orange, calm and easy to read (redesign spec section 1). Square corners.
 * Orange only highlights (the logo's shine, the Today line, the focus ring), never a status.
 * Every ratio is WCAG contrast against the surface the colour is drawn on; text needs 4.5:1,
 * UI parts 3:1. theme.test.jsx recomputes each one and fails below the line.
 */
const TOKENS = {
  light: {
    page: '#F2F4F1', // light grey page
    gridLine: '#E6EAE5', // graph-paper line, 1.1:1 on the page: faint, and every text colour still passes on it
    paper: '#FFFFFF', // cards stay solid white
    divider: '#DCE2DD',
    text: '#1C2620', // 15.6:1 on white, 12.8:1 on a grid line
    textSecondary: '#4A564F', // 7.7:1 on white, 6.3:1 on a grid line
    primary: '#184429', // dark forest green; 11.1:1 on white, 9.1:1 on a grid line; white text on it 11.1:1
    onPrimary: '#FFFFFF',
    orange: '#D9661F', // 3.6:1 on white, 3.2:1 on the page (UI parts); black text on it 5.9:1
    onOrange: '#000000',
    error: '#C62828', // late, over; 5.6:1 on white, 4.6:1 on a grid line; white text 5.6:1
    warning: '#9A5800', // pending, on hold; 5.6:1 on white, 4.6:1 on a grid line; white text 5.6:1
    success: '#2B7530', // done, approved; 5.7:1 on white, 4.7:1 on a grid line; white text 5.7:1; 16 apart from the primary
    onStatus: '#FFFFFF',
    header: '#184429', // the top bar: forest green, white text 11.1:1
    onHeader: '#FFFFFF',
    button: '#184429', // contained buttons: green, white text 11.1:1
    onButton: '#FFFFFF',
    buttonHover: '#10301D', // white text 14.4:1
  },
  dark: {
    page: '#0F1D15', // dark green page
    gridLine: '#192B20', // 1.2:1 on the page
    paper: '#17291E',
    divider: '#2C3F33',
    text: '#E9EEEA', // 13.0:1 on the card, 12.7:1 on a grid line
    textSecondary: '#B4C2B9', // 8.3:1 on the card, 8.1:1 on a grid line
    primary: '#D5DBD7', // neutral grey accent; 10.9:1 on the card; forest green text on it 7.9:1
    onPrimary: '#184429',
    orange: '#FF9F43', // 7.5:1 on the card; dark text on it 7.6:1
    onOrange: '#1C2620',
    error: '#F28B82', // 6.4:1 on the card, 6.2:1 on a grid line; dark text on it 6.5:1
    warning: '#F2C230', // 9.4:1 on the card; dark text on it 9.3:1; 16 apart from the grey accent
    success: '#6FCB8E', // 7.7:1 on the card; dark text on it 7.9:1; 17 apart from the grey accent
    onStatus: '#1C2620',
    header: '#D5DBD7', // the top bar: light grey, forest green text 7.9:1
    onHeader: '#184429',
    button: '#FFFFFF', // contained buttons: white, forest green text 11.1:1
    onButton: '#184429',
    buttonHover: '#E3E8E4', // forest green text 8.9:1
  },
}

/** The faint graph-paper grid behind the page (cards cover it): one line across and one down every 24 px. */
const graphPaper = (line) => `linear-gradient(${line} 1px, transparent 1px), linear-gradient(90deg, ${line} 1px, transparent 1px)`

/**
 * The MUI theme for one colour mode.
 * @param {'light'|'dark'} mode
 */
export function makeTheme(mode) {
  const t = TOKENS[mode]
  const status = (main) => ({ main, contrastText: t.onStatus })
  return createTheme({
    palette: {
      mode,
      primary: { main: t.primary, contrastText: t.onPrimary },
      secondary: { main: t.orange, contrastText: t.onOrange },
      error: status(t.error),
      warning: status(t.warning),
      success: status(t.success),
      background: { default: t.page, paper: t.paper },
      text: { primary: t.text, secondary: t.textSecondary },
      divider: t.divider,
      gridLine: t.gridLine,
      header: { main: t.header, contrastText: t.onHeader },
      button: { main: t.button, contrastText: t.onButton, hover: t.buttonHover },
    },
    shape: { borderRadius: 0 },
    typography: {
      fontFamily: '"Inter", "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
      h1: { fontSize: '1.75rem', fontWeight: 600 },
      h2: { fontSize: '1.375rem', fontWeight: 600 },
      h3: { fontSize: '1.125rem', fontWeight: 600 },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: { backgroundColor: t.page, backgroundImage: graphPaper(t.gridLine), backgroundSize: '24px 24px' },
          // The keyboard focus ring: orange, outside the control.
          '.MuiButtonBase-root.Mui-focusVisible, a:focus-visible': { outline: `2px solid ${t.orange}`, outlineOffset: 2 },
        },
      },
      MuiCard: { defaultProps: { variant: 'outlined' }, styleOverrides: { root: { borderRadius: 0 } } },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: { textTransform: 'none', fontWeight: 600, borderRadius: 0 },
          // Contained buttons: green with white words in light mode, white with green words in dark.
          contained: ({ ownerState }) => (ownerState.color === 'primary'
            ? { backgroundColor: t.button, color: t.onButton, '&:hover': { backgroundColor: t.buttonHover } }
            : null),
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          // A field in error glows red around a 2 px red border (spec 5a); its message stays under it.
          root: {
            borderRadius: 0,
            '&.Mui-error': { boxShadow: `0 0 0 3px ${alpha(t.error, 0.25)}` },
            '&.Mui-error .MuiOutlinedInput-notchedOutline': { borderColor: t.error, borderWidth: 2 },
          },
        },
      },
      MuiChip: { styleOverrides: { root: { borderRadius: 0 } } },
      MuiAlert: { styleOverrides: { root: { borderRadius: 0 } } },
      MuiDialog: { styleOverrides: { paper: { borderRadius: 0 } } },
      MuiMenu: { styleOverrides: { paper: { borderRadius: 0 } } },
      MuiTooltip: { styleOverrides: { tooltip: { borderRadius: 0 } } },
      MuiPagination: { defaultProps: { shape: 'rounded' } }, // "rounded" follows shape.borderRadius, which is 0
      MuiAppBar: { defaultProps: { elevation: 0 } },
      MuiTab: { styleOverrides: { root: { textTransform: 'none', fontWeight: 600 } } },
    },
  })
}

/** The light theme: what tests and older imports use. */
const theme = makeTheme('light')

export default theme
