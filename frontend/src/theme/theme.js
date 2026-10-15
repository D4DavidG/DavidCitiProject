import { alpha, createTheme } from '@mui/material/styles'

/*
 * One design language (redesign spec 1 and 5c): David's site d4davidg.github.io and SimpleBank.
 * Forest green with gold highlights, square corners, a faint graph-paper page, solid glowing panels.
 * Gold only highlights (the logo's shine, the Today line), never a status and never text on light.
 * Every ratio is WCAG contrast against the surface the colour is drawn on; text needs 4.5:1,
 * UI parts 3:1. theme.test.jsx recomputes each one and fails below the line.
 */
const TOKENS = {
  light: {
    page: '#E4E9E4', // his site's page grey-green
    gridLine: '#E0E5E0', // his rgba(0,0,0,.075) line at layer opacity .22, flattened on the page: 1.04:1
    gridSize: 46,
    paper: '#FFFFFF', // panels: solid white
    divider: 'rgba(0, 0, 0, 0.14)', // his hairline
    text: '#161A16', // 14.3:1 on the page
    textSecondary: '#2C332E', // supporting lines; 10.5:1 on the page
    textMuted: '#4C5450', // the least important text only; 6.1:1 on a grid line
    fieldLine: '#767D78', // a field's resting border: 4.2:1 on a panel, 3.4:1 on the page, 3.3:1 on a grid line
    ink: '#14602C', // green as text (links, outlined buttons, focus ring); 6.0:1 on a grid line, white on it 7.7:1
    onInk: '#FFFFFF',
    fill: '#1F7A3A', // the ONE green fill: top bar, primary buttons, selected menu item; white on it 5.4:1
    onFill: '#FFFFFF',
    fillHover: '#14602C', // white on it 7.7:1
    glow: '#1F7A3A', // panels' and buttons' faint glow
    gold: '#8A6100', // highlight lines (Today); 5.5:1 on white, 4.5:1 on the page; white on it 5.5:1
    goldBright: '#FFD54A', // the logo's shine, edged in the deep gold on light
    onGold: '#FFFFFF',
    error: '#B3261E', // late, over, refused; 5.1:1 on a grid line; white on it 6.5:1
    warning: '#9C4A00', // pending, on hold; 4.9:1 on a grid line; white on it 6.2:1
    success: '#145DB2', // done, approved: blue, so it is never mistaken for the green brand; 5.1:1; white 6.5:1
    onStatus: '#FFFFFF',
    header: '#1F7A3A', // the top bar: the fill green, white words 5.4:1
    onHeader: '#FFFFFF',
  },
  dark: {
    page: '#0F1D15', // dark green page
    gridLine: '#1A2720', // his rgba(255,255,255,.045) line, flattened on the page: 1.12:1
    gridSize: 46,
    paper: '#0B0E0B', // his near-black panels
    divider: 'rgba(255, 255, 255, 0.14)',
    text: '#D7D7D7', // 13.5:1 on a panel, 10.8:1 on a grid line
    textSecondary: '#C3C8C3', // 11.4:1 on a panel, 9.1:1 on a grid line
    textMuted: '#A9B0AA', // 8.8:1 on a panel, 7.0:1 on a grid line
    fieldLine: '#6F7973', // 4.3:1 on a panel, 3.9:1 on the page, 3.4:1 on a grid line
    ink: '#7CC78F', // pale green links and outlined buttons; 9.6:1 on a panel; 16 apart from the grey
    onInk: '#0B0E0B',
    fill: '#FFFFFF', // primary buttons and the selected menu item: white, green words 7.7:1
    onFill: '#14602C',
    fillHover: '#E6E6E6', // green words 6.1:1
    glow: '#D7D7D7', // the neutral grey accent
    gold: '#FFD54A', // 13.7:1 on a panel; dark text on it 12.5:1
    goldBright: '#FFD54A',
    onGold: '#161A16',
    error: '#F28B82', // 8.1:1 on a panel, 6.5:1 on a grid line; dark text on it 8.1:1
    warning: '#FF9E57', // 9.5:1 on a panel; dark text on it 9.5:1
    success: '#8AB4F8', // 9.2:1 on a panel; dark text on it 9.2:1; 18 apart from the green ink
    onStatus: '#0B0E0B',
    header: '#D7D7D7', // the top bar: light grey, green words 5.3:1
    onHeader: '#14602C',
  },
}

/** The faint graph-paper grid behind the page (panels cover it): one line across and one down. */
const graphPaper = (line) => `linear-gradient(${line} 1px, transparent 1px), linear-gradient(90deg, ${line} 1px, transparent 1px)`

/**
 * The MUI theme for one colour mode.
 * @param {'light'|'dark'} mode
 */
export function makeTheme(mode) {
  const t = TOKENS[mode]
  const status = (main) => ({ main, contrastText: t.onStatus })
  const glow = (strength, blur = 12) => `0 0 ${blur}px ${alpha(t.glow, strength)}`
  const calm = { '@media (prefers-reduced-motion: reduce)': { transition: 'none' } }
  return createTheme({
    palette: {
      mode,
      primary: { main: t.ink, contrastText: t.onInk },
      secondary: { main: t.gold, light: t.goldBright, contrastText: t.onGold },
      error: status(t.error),
      warning: status(t.warning),
      success: status(t.success),
      background: { default: t.page, paper: t.paper },
      text: { primary: t.text, secondary: t.textSecondary, muted: t.textMuted },
      divider: t.divider,
      gridLine: t.gridLine,
      fieldLine: t.fieldLine,
      fill: { main: t.fill, contrastText: t.onFill, hover: t.fillHover },
      header: { main: t.header, contrastText: t.onHeader },
    },
    shape: { borderRadius: 0 },
    typography: {
      fontFamily: '"Inter", system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
      body1: { lineHeight: 1.6 },
      body2: { lineHeight: 1.6 },
      // Titles in capitals with a little tracking; h1 and h2 carry a faint glow of the accent.
      h1: { fontSize: '1.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.012em', textShadow: glow(0.25, 10) },
      h2: { fontSize: '1.375rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.012em', textShadow: glow(0.25, 10) },
      h3: { fontSize: '1.125rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.012em' },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: {
            backgroundColor: t.page,
            backgroundImage: graphPaper(t.gridLine),
            backgroundSize: `${t.gridSize}px ${t.gridSize}px`,
          },
          // The keyboard focus ring on every control: 2 px green ink, just outside it. Besides buttons and
          // links, anything made a Tab stop on purpose (a chart row, a box that scrolls sideways), but not
          // the inside of a select field, which has its own focused border. :where() keeps that part weightless,
          // so a component can still refine its own ring.
          '.MuiButtonBase-root.Mui-focusVisible, a:focus-visible, :where([tabindex="0"]:not(.MuiInputBase-input)):focus-visible': {
            outline: `2px solid ${t.ink}`,
            outlineOffset: 2,
          },
        },
      },
      MuiCard: {
        defaultProps: { variant: 'outlined' },
        styleOverrides: {
          // A panel: an accent hairline and a soft glow that brightens slowly on hover or focus.
          // A card inside a card stays quiet: border only.
          root: {
            borderRadius: 0,
            borderColor: alpha(t.glow, 0.34),
            boxShadow: glow(0.12),
            transition: 'box-shadow .9s ease',
            ...calm,
            '&:hover, &:focus-within': { boxShadow: glow(0.26, 18) },
            '& .MuiCard-root, & .MuiCard-root:hover, & .MuiCard-root:focus-within': { boxShadow: 'none' },
          },
        },
      },
      MuiButton: {
        // Three kinds only: primary (contained), secondary (outlined, the default) and danger (outlined, color="error").
        defaultProps: { variant: 'outlined', disableElevation: true },
        styleOverrides: {
          root: { textTransform: 'none', fontWeight: 600, borderRadius: 0, ...calm },
          contained: ({ ownerState }) => (ownerState.color === 'primary'
            ? {
              backgroundColor: t.fill,
              color: t.onFill,
              fontWeight: 700,
              boxShadow: glow(0.3, 6),
              '&:hover, &.Mui-focusVisible': { backgroundColor: t.fillHover, boxShadow: glow(0.45, 14) },
              '&:active': { transform: 'scale(.97)' },
            }
            : null),
          outlined: ({ ownerState }) => {
            if (ownerState.color === 'inherit') return { borderColor: 'currentColor' }
            const line = ownerState.color === 'error' ? t.error : t.ink
            return {
              borderWidth: 1.5,
              borderColor: line,
              backgroundColor: t.paper,
              '&:hover': { borderColor: line, backgroundColor: t.paper, boxShadow: `0 0 10px ${alpha(line, 0.3)}` },
            }
          },
        },
      },
      // Links only go somewhere: green ink, underlined on hover and on keyboard focus. Weight 600 too, so a
      // link inside a sentence differs from the words around it by more than colour (WCAG 1.4.1).
      MuiLink: {
        defaultProps: { underline: 'hover' },
        styleOverrides: { root: { fontWeight: 600, '&:focus-visible': { textDecoration: 'underline' } } },
      },
      // Dark mode: MUI lightens a raised panel (dialog, menu, phone drawer) with a white overlay; keep it solid.
      MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
      MuiOutlinedInput: {
        styleOverrides: {
          // A field in error glows red around a 2 px red border (spec 5a); its message stays under it.
          root: {
            borderRadius: 0,
            '&.Mui-error': { boxShadow: `0 0 0 3px ${alpha(t.error, 0.25)}` },
            '&.Mui-error .MuiOutlinedInput-notchedOutline': { borderColor: t.error, borderWidth: 2 },
          },
          // At rest, a border that reaches 3:1 (MUI's default is about 1.7:1); hover, focus and error still win.
          notchedOutline: { borderColor: t.fieldLine },
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
