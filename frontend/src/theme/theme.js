import { alpha, createTheme } from '@mui/material/styles'

/*
 * The look (redesign spec section 6, David's tweaks of 15 Oct): welcoming rather than military.
 * One forest green for everything green, a warm matcha page, square boxes, filled rounded buttons,
 * soft drop shadows and no glows (the logo's peak is the one exception, in AcmeLogo).
 * Gold only highlights (the logo, the Today line), never a status and never text on light.
 * Every ratio is WCAG contrast against the surface the colour is drawn on; text needs 4.5:1,
 * UI parts 3:1. theme.test.jsx recomputes each one and fails below the line.
 */
const TOKENS = {
  light: {
    page: '#E2EBD5', // a warm matcha toward white, a touch greener since 15 Oct; plain, no grid
    paper: '#FAFBF5', // cards: a warm white
    divider: 'rgba(22, 26, 22, 0.14)',
    cardBorder: 'rgba(22, 26, 22, 0.12)',
    cardShadow: '0 1px 2px rgba(22, 26, 22, 0.08), 0 2px 8px rgba(22, 26, 22, 0.06)',
    text: '#161A16', // 14.3:1 on the page
    textSecondary: '#2C332E', // 10.5:1 on the page
    textMuted: '#4C5450', // 6.3:1 on the page
    fieldLine: '#767D78', // a field's resting border: 3.4:1 on the page, 4.1:1 on a card
    green: '#165E26', // THE green: top bar, buttons, links, selected menu item; 6.4:1 on the page; white on it 7.9:1
    greenText: '#165E26', // green as words: the same green in light mode
    greenHover: '#0E4A1B', // white on it 10.4:1
    onGreen: '#FFFFFF',
    buttonEdge: '#165E26', // a button's edge: 6.4:1 on the page
    buttonShadow: '0 1px 2px rgba(22, 26, 22, 0.22)',
    buttonShadowHover: '0 2px 6px rgba(22, 26, 22, 0.24)',
    gold: '#8A6100', // highlight lines (Today); 4.5:1 on the page; white on it 5.5:1
    goldBright: '#FFD54A', // the logo's sparkles and the glow on its peak
    onGold: '#FFFFFF',
    error: '#C21F1F', // a true red for words and marks; 4.9:1 on the page
    overWash: '#F4E5E0', // a red tint behind an over-capacity week (10% of the red on a card): red words 4.9:1
    danger: '#C21F1F', // danger buttons and the New label: white on it 6.0:1
    dangerHover: '#9A1818', // white on it 8.3:1
    warning: '#9C4A00', // pending, on hold; 5.0:1 on the page; white on it 6.2:1
    success: '#145DB2', // done, approved: blue, so it is never mistaken for the green; 5.3:1 on the page; white 6.5:1
    onStatus: '#FFFFFF',
    disabledFill: '#D9DDD0', // a neutral, not a faded green (SimpleBank lesson)
    disabledText: '#4C5450', // 5.7:1 on the disabled fill
  },
  dark: {
    page: '#18221A', // a warm dark green, not mint; plain, no grid
    paper: '#212D23', // cards
    divider: 'rgba(255, 255, 255, 0.12)',
    cardBorder: 'rgba(255, 255, 255, 0.10)',
    cardShadow: '0 1px 3px rgba(0, 0, 0, 0.45)',
    text: '#ECEEE6', // a warm off-white; 12.3:1 on a card
    textSecondary: '#CDD3C7', // 9.4:1 on a card
    textMuted: '#AFB6A9', // 6.9:1 on a card
    fieldLine: '#7C877E', // 3.8:1 on a card, 4.4:1 on the page
    green: '#165E26', // the same green fills the top bar, buttons and the selected menu item; white on it 7.9:1
    greenText: '#8FD3A0', // green as words needs to be lighter on a dark card: 8.2:1
    greenHover: '#1E7A34', // white on it 5.4:1
    onGreen: '#FFFFFF',
    buttonEdge: '#FFFFFF', // dark-mode buttons wear a thin white outline: 14.3:1 on a card
    buttonShadow: '0 1px 2px rgba(0, 0, 0, 0.5)',
    buttonShadowHover: '0 2px 6px rgba(0, 0, 0, 0.55)',
    gold: '#FFD54A', // 10.2:1 on a card; dark words on it 12.5:1
    goldBright: '#FFD54A',
    onGold: '#161A16',
    error: '#FF5A5A', // a true red that reads on a dark card: 4.7:1
    // A darker red tint behind an over-capacity week: red words 5.3:1. Not a see-through wash of the red,
    // which lightens the card and dropped the red words to 4.2:1 (axe, 15 Oct).
    overWash: '#2B1D1D',
    danger: '#C62828', // danger buttons and the New label: white on it 5.6:1
    dangerHover: '#A61F1F', // white on it 7.4:1
    warning: '#FFA05C', // 7.1:1 on a card; dark words on it
    success: '#8AB4F8', // 6.8:1 on a card; dark words on it
    onStatus: '#161A16',
    disabledFill: '#3A463C',
    disabledText: '#CDD3C7', // 6.5:1 on the disabled fill
  },
}

/** Titles: a softer, thicker face than the body text, in normal case. */
const HEADINGS = '"Poppins", "Inter", system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'

/**
 * The MUI theme for one colour mode.
 * @param {'light'|'dark'} mode
 */
export function makeTheme(mode) {
  const t = TOKENS[mode]
  const status = (main) => ({ main, contrastText: t.onStatus })
  const calm = { '@media (prefers-reduced-motion: reduce)': { transition: 'none', transform: 'none' } }
  const heading = (fontSize, fontWeight) => ({ fontFamily: HEADINGS, fontSize, fontWeight, lineHeight: 1.3 })
  return createTheme({
    palette: {
      mode,
      primary: { main: t.greenText, contrastText: mode === 'light' ? t.onGreen : t.onStatus },
      secondary: { main: t.gold, light: t.goldBright, contrastText: t.onGold },
      error: status(t.error),
      overWash: t.overWash,
      warning: status(t.warning),
      success: status(t.success),
      background: { default: t.page, paper: t.paper },
      text: { primary: t.text, secondary: t.textSecondary, muted: t.textMuted },
      divider: t.divider,
      fieldLine: t.fieldLine,
      fill: { main: t.green, contrastText: t.onGreen, hover: t.greenHover },
      danger: { main: t.danger, contrastText: '#FFFFFF', hover: t.dangerHover },
      header: { main: t.green, contrastText: t.onGreen },
      buttonEdge: t.buttonEdge,
    },
    shape: { borderRadius: 0 },
    typography: {
      fontFamily: '"Inter", system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
      // Body text a little heavier than usual: easier to read.
      fontWeightRegular: 500,
      fontWeightMedium: 600,
      fontWeightBold: 700,
      body1: { lineHeight: 1.6 },
      body2: { lineHeight: 1.6 },
      h1: heading('1.75rem', 700),
      h2: heading('1.3rem', 600),
      h3: heading('1.1rem', 600),
      h4: heading('1rem', 600),
      h5: heading('1rem', 600),
      h6: heading('1rem', 600),
      button: { textTransform: 'none', fontWeight: 600 },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          // A plain page: the graph-paper grid was removed on 15 Oct at David's request.
          body: { backgroundColor: t.page, backgroundImage: 'none' },
          // The keyboard focus ring on every control: 2 px green, just outside it. Besides buttons and
          // links, anything made a Tab stop on purpose (a chart row, a box that scrolls sideways), but not
          // the inside of a select field, which has its own focused border. :where() keeps that part weightless,
          // so a component can still refine its own ring.
          '.MuiButtonBase-root.Mui-focusVisible, a:focus-visible, :where([tabindex="0"]:not(.MuiInputBase-input)):focus-visible': {
            outline: `2px solid ${t.greenText}`,
            outlineOffset: 2,
          },
        },
      },
      MuiCard: {
        defaultProps: { variant: 'outlined' },
        // A box: square corners, a thin border and a soft drop shadow. A card inside a card stays flat.
        styleOverrides: {
          root: {
            borderRadius: 0,
            borderColor: t.cardBorder,
            boxShadow: t.cardShadow,
            '& .MuiCard-root': { boxShadow: 'none' },
          },
        },
      },
      MuiButton: {
        // One kind of button, filled: green with white words, rounded, a small shadow. color="error" is the
        // danger kind, filled red. The only exception is color="inherit" with variant="text": a bare word
        // you can press, used in the top bar.
        defaultProps: { variant: 'contained', disableElevation: true },
        styleOverrides: {
          root: ({ ownerState }) => {
            if (ownerState.color === 'inherit' && ownerState.variant === 'text') {
              return {
                borderRadius: 8,
                color: 'inherit',
                '&:hover': { backgroundColor: alpha('#FFFFFF', 0.14), textDecoration: 'underline' },
              }
            }
            const danger = ownerState.color === 'error'
            const fill = danger ? t.danger : t.green
            const hover = danger ? t.dangerHover : t.greenHover
            const edge = mode === 'dark' ? t.buttonEdge : fill
            return {
              borderRadius: 8,
              border: `1px solid ${edge}`,
              backgroundColor: fill,
              color: t.onGreen,
              boxShadow: t.buttonShadow,
              transition: 'background-color .15s ease, box-shadow .15s ease, transform .1s ease',
              '&:hover': { backgroundColor: hover, borderColor: mode === 'dark' ? edge : hover, boxShadow: t.buttonShadowHover },
              '&:active': { transform: 'translateY(1px)' },
              '&.Mui-disabled': { backgroundColor: t.disabledFill, borderColor: t.disabledFill, color: t.disabledText, boxShadow: 'none' },
              ...calm,
            }
          },
        },
      },
      // Links only go somewhere: green, underlined on hover and on keyboard focus. Bold too, so a
      // link inside a sentence (weight 500) differs from the words around it by more than colour (WCAG 1.4.1).
      MuiLink: {
        defaultProps: { underline: 'hover' },
        styleOverrides: { root: { fontWeight: 700, '&:focus-visible': { textDecoration: 'underline' } } },
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
      MuiChip: {
        styleOverrides: {
          root: { borderRadius: 6, fontWeight: 600 },
          // A filled red label (New) is the danger red with white words in both modes.
          filled: ({ ownerState }) => (ownerState.color === 'error' ? { backgroundColor: t.danger, color: '#FFFFFF' } : null),
        },
      },
      MuiAlert: { styleOverrides: { root: { borderRadius: 0 } } },
      MuiDialog: { styleOverrides: { paper: { borderRadius: 0 } } },
      MuiMenu: { styleOverrides: { paper: { borderRadius: 0 } } },
      MuiTooltip: { styleOverrides: { tooltip: { borderRadius: 4 } } },
      MuiPagination: { defaultProps: { shape: 'rounded' } },
      MuiAppBar: { defaultProps: { elevation: 0 } },
      MuiTab: { styleOverrides: { root: { textTransform: 'none', fontWeight: 600 } } },
    },
  })
}

/** The light theme: what tests and older imports use. */
const theme = makeTheme('light')

export default theme
