import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import {
  Alert, Button, Card, Chip, Dialog, Link, OutlinedInput, Tooltip, Typography,
} from '@mui/material'
import { ThemeProvider } from '@mui/material/styles'
import theme, { makeTheme } from './theme'
import { contrast, distance } from '../test/contrast'

const MODES = ['light', 'dark']

/** A palette path such as 'text.secondary' read from a theme. */
const read = (t, path) => path.split('.').reduce((value, key) => value[key], t.palette)

// Every pair the website draws: [foreground, background]. Text needs 4.5:1 (WCAG AA).
const SURFACES = ['background.default', 'background.paper', 'gridLine']
const TEXT_PAIRS = [
  ...['text.primary', 'text.secondary', 'text.muted', 'primary.main', 'error.main', 'warning.main', 'success.main']
    .flatMap((ink) => SURFACES.map((surface) => [ink, surface])),
  ['primary.contrastText', 'primary.main'],
  ['secondary.contrastText', 'secondary.main'],
  ['error.contrastText', 'error.main'], // filled status chips and the bell's badge
  ['warning.contrastText', 'warning.main'],
  ['success.contrastText', 'success.main'],
  ['header.contrastText', 'header.main'], // the top bar
  ['fill.contrastText', 'fill.main'], // primary buttons, the selected menu item
  ['fill.contrastText', 'fill.hover'],
  ['danger.contrastText', 'danger.main'], // danger buttons, the New label
  ['danger.contrastText', 'danger.hover'],
  ['error.main', 'overWash'], // an over-capacity week on Allocation: red words on a red tint
  ['text.primary', 'overWash'],
]
// UI parts need 3:1: the gold Today line, the green focus ring, a button's edge,
// and a field's resting border, which sits on a dialog, on the page or across a grid line.
const UI_PAIRS = [
  ['secondary.main', 'background.paper'],
  ['secondary.main', 'background.default'],
  ['primary.main', 'background.default'],
  ['buttonEdge', 'background.paper'], // a button's edge: the green itself on light, white on dark
  ['buttonEdge', 'background.default'],
  ...SURFACES.map((surface) => ['fieldLine', surface]),
]

describe.each(MODES)('the %s theme', (mode) => {
  const t = makeTheme(mode)

  it('is that mode', () => {
    expect(t.palette.mode).toBe(mode)
  })

  it.each(TEXT_PAIRS)('gives %s on %s at least 4.5:1', (ink, surface) => {
    expect(contrast(read(t, ink), read(t, surface))).toBeGreaterThanOrEqual(4.5)
  })

  it.each(UI_PAIRS)('gives %s on %s at least 3:1', (ink, surface) => {
    expect(contrast(read(t, ink), read(t, surface))).toBeGreaterThanOrEqual(3)
  })

  it('keeps every status colour distinct from the greens (the accent and the fill)', () => {
    for (const status of ['error', 'warning', 'success']) {
      expect(distance(t.palette[status].main, t.palette.primary.main)).toBeGreaterThanOrEqual(15)
      expect(distance(t.palette[status].main, t.palette.fill.main)).toBeGreaterThanOrEqual(15)
    }
  })

  it('draws the graph-paper grid on the page in 46 px squares, fainter than any text', () => {
    const body = t.components.MuiCssBaseline.styleOverrides.body
    expect(body.backgroundColor).toBe(t.palette.background.default)
    expect(body.backgroundImage.split(t.palette.gridLine)).toHaveLength(3) // two lines: across and down
    expect(body.backgroundSize).toBe('46px 46px')
    expect(contrast(t.palette.gridLine, t.palette.background.default)).toBeLessThan(1.3)
  })

  it('has square corners', () => {
    expect(t.shape.borderRadius).toBe(0)
  })
})

describe('one kind of button (spec 6.2)', () => {
  it.each([
    ['light', 'rgb(22, 94, 38)', 'rgb(22, 94, 38)'], // the one green, its own edge
    ['dark', 'rgb(22, 94, 38)', 'rgb(255, 255, 255)'], // the same green, a thin white edge
  ])('fills every button green with white words and rounded corners (%s)', (mode, background, edge) => {
    render(<ThemeProvider theme={makeTheme(mode)}><Button>Edit</Button><Button variant="outlined">Later</Button></ThemeProvider>)
    for (const name of ['Edit', 'Later']) {
      expect(screen.getByRole('button', { name })).toHaveStyle({
        backgroundColor: background, color: 'rgb(255, 255, 255)', borderColor: edge, borderRadius: '8px',
      })
    }
  })

  it.each([['light', 'rgb(194, 31, 31)'], ['dark', 'rgb(198, 40, 40)']])('fills the danger kind red with white words (%s)', (mode, red) => {
    render(<ThemeProvider theme={makeTheme(mode)}><Button color="error">Archive</Button></ThemeProvider>)
    expect(screen.getByRole('button', { name: 'Archive' })).toHaveStyle({ backgroundColor: red, color: 'rgb(255, 255, 255)' })
  })

  it('gives a button a small drop shadow, not a glow', () => {
    render(<ThemeProvider theme={makeTheme('light')}><Button>Save</Button></ThemeProvider>)
    expect(getComputedStyle(screen.getByRole('button', { name: 'Save' })).boxShadow).toMatch(/^0 1px 2px rgba/)
  })

  it('keeps a top-bar word bare: color inherit with variant text has no fill and no border', () => {
    render(<ThemeProvider theme={makeTheme('light')}><Button color="inherit" variant="text">Sign out</Button></ThemeProvider>)
    const out = screen.getByRole('button', { name: 'Sign out' })
    expect(getComputedStyle(out).backgroundColor).not.toBe('rgb(22, 94, 38)')
    expect(getComputedStyle(out).borderStyle).not.toBe('solid')
  })

  it('greys a disabled button out with a neutral, not a faded green (SimpleBank lesson)', () => {
    render(<ThemeProvider theme={makeTheme('light')}><Button disabled>Save</Button></ThemeProvider>)
    expect(screen.getByRole('button', { name: 'Save' })).toHaveStyle({ backgroundColor: 'rgb(217, 221, 208)', color: 'rgb(76, 84, 80)' })
  })
})

describe('links', () => {
  it('are green ink with no underline, underlined on hover and on keyboard focus', () => {
    const t = makeTheme('light')
    render(<ThemeProvider theme={t}><Link href="#/projects/1">Apollo</Link></ThemeProvider>)
    const link = screen.getByRole('link', { name: 'Apollo' })
    expect(link).toHaveClass('MuiLink-underlineHover')
    expect(link).toHaveStyle({ color: 'rgb(22, 94, 38)', textDecoration: 'none' })
    const css = [...document.querySelectorAll('style')].map((tag) => tag.textContent).join('')
    expect(css).toMatch(/MuiLink-root:focus-visible\{(-webkit-)?text-decoration:underline/)
  })

  // Green against body text is under the 3:1 WCAG 1.4.1 asks of a link that differs by colour alone;
  // axe's link-in-text-block rule accepts a change of weight: bold links in 500-weight text.
  it('stand out from the sentence around them by weight, not by colour alone', () => {
    render(<ThemeProvider theme={makeTheme('light')}><Typography>See the <Link href="#/spec">spec</Link> for more.</Typography></ThemeProvider>)
    const link = screen.getByRole('link', { name: 'spec' })
    // The link's rule says font: inherit, then font-weight: 600, which a browser applies in that order
    // (jsdom lets the shorthand win, so the rule is read rather than the computed weight).
    const scope = [...link.classList].find((name) => name.startsWith('css-'))
    const css = [...document.querySelectorAll('style')].map((tag) => tag.textContent).join('')
    expect(css).toMatch(new RegExp(`\\.${scope}\\{[^}]*font:inherit;[^}]*font-weight:700;`))
    expect(screen.getByText(/See the/)).toHaveStyle({ fontWeight: '500' })
  })
})

describe('the keyboard focus ring', () => {
  /** The page-wide rule that draws the ring: [selector, style]. */
  const ring = (t) => Object.entries(t.components.MuiCssBaseline.styleOverrides).find(([, style]) => style.outline)
  // jsdom reports :focus-visible only on the first Tab of a whole test file, so rather than tab to each
  // control, ask whether the ring's selector takes it in once it has keyboard focus.
  const ringed = (element) => element.matches(ring(theme)[0].replaceAll(':focus-visible', '').replaceAll('.Mui-focusVisible', ''))

  it.each(MODES)('is 2 px green, just outside the control (%s)', (mode) => {
    const t = makeTheme(mode)
    expect(ring(t)[1]).toEqual({ outline: `2px solid ${t.palette.primary.main}`, outlineOffset: 2 })
  })

  it('takes in buttons, links and anything made a Tab stop on purpose: a chart row, a box that scrolls sideways', () => {
    render(
      <ThemeProvider theme={theme}>
        <Button>Edit</Button>
        <a href="#/projects/1">Apollo</a>
        <div role="img" aria-label="Apollo, 40 h" tabIndex={0} />
        <div role="region" aria-label="Weeks, scrolls sideways" tabIndex={0} />
      </ThemeProvider>,
    )
    const controls = [
      screen.getByRole('button', { name: 'Edit' }), screen.getByRole('link', { name: 'Apollo' }),
      screen.getByRole('img', { name: 'Apollo, 40 h' }), screen.getByRole('region', { name: 'Weeks, scrolls sideways' }),
    ]
    controls.forEach((control) => expect(ringed(control)).toBe(true))
  })

  it('leaves out the inside of a select field (the field draws its own focused border) and what only code focuses (a dialog)', () => {
    render(
      <ThemeProvider theme={theme}>
        <div className="MuiInputBase-input" role="combobox" aria-label="Action" aria-expanded="false" tabIndex={0} />
        <div role="dialog" aria-label="Edit project" tabIndex={-1} />
      </ThemeProvider>,
    )
    expect(ringed(screen.getByRole('combobox', { name: 'Action' }))).toBe(false)
    expect(ringed(screen.getByRole('dialog', { name: 'Edit project' }))).toBe(false)
  })
})

describe('motion', () => {
  it.each(MODES)('switches off the button transitions under prefers-reduced-motion (%s)', (mode) => {
    render(<ThemeProvider theme={makeTheme(mode)}><Button>Save</Button></ThemeProvider>)
    const css = [...document.querySelectorAll('style')].map((tag) => tag.textContent).join('')
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)\{[^}]*transition:none/)
  })
})

describe('raised panels in dark mode', () => {
  it('are the solid card colour: no white overlay on dialogs, menus or the phone drawer', () => {
    render(<ThemeProvider theme={makeTheme('dark')}><Dialog open aria-label="Dialog"><p>body</p></Dialog></ThemeProvider>)
    const paper = screen.getByRole('dialog')
    expect(getComputedStyle(paper).backgroundImage).toBe('none')
    expect(paper).toHaveStyle({ backgroundColor: 'rgb(33, 45, 35)' })
  })
})

describe('boxes and titles (spec 6.1)', () => {
  it('gives a card a soft drop shadow (no glow), and a card inside it none', () => {
    render(<ThemeProvider theme={makeTheme('light')}><Card data-testid="outer"><Card data-testid="inner">x</Card></Card></ThemeProvider>)
    expect(getComputedStyle(screen.getByTestId('outer')).boxShadow).toMatch(/^0 1px 2px rgba/)
    expect(getComputedStyle(screen.getByTestId('inner')).boxShadow).toBe('none')
  })

  it.each(MODES)('writes titles in Poppins, in normal case, with no glow (%s)', (mode) => {
    render(<ThemeProvider theme={makeTheme(mode)}><Typography variant="h1">Dashboard</Typography></ThemeProvider>)
    const title = screen.getByRole('heading', { name: 'Dashboard' })
    expect(getComputedStyle(title).fontFamily).toMatch(/^"Poppins"/)
    expect(getComputedStyle(title).textTransform).not.toBe('uppercase')
    expect(getComputedStyle(title).textShadow).not.toMatch(/\dpx/) // no glow
  })
})

describe('a field in error', () => {
  it.each(MODES)('glows red around a red border in %s mode', (mode) => {
    const t = makeTheme(mode)
    render(<ThemeProvider theme={t}><OutlinedInput error inputProps={{ 'aria-label': 'Minutes' }} /></ThemeProvider>)
    const field = screen.getByRole('textbox', { name: 'Minutes' }).parentElement
    expect(getComputedStyle(field).boxShadow).toMatch(/^0 0 0 3px rgba/)
    expect(field.querySelector('fieldset')).toHaveStyle({ borderColor: t.palette.error.main, borderWidth: '2px' })
  })

  it('stays plain when there is no error', () => {
    render(<ThemeProvider theme={theme}><OutlinedInput inputProps={{ 'aria-label': 'Minutes' }} /></ThemeProvider>)
    expect(getComputedStyle(screen.getByRole('textbox', { name: 'Minutes' }).parentElement).boxShadow).toBe('')
  })
})

describe('a field at rest', () => {
  it.each([['light', 'rgb(118, 125, 120)'], ['dark', 'rgb(124, 135, 126)']])(
    'has a border that reaches 3:1 on any surface, not MUI\'s faint default (%s)',
    (mode, line) => {
      render(<ThemeProvider theme={makeTheme(mode)}><OutlinedInput inputProps={{ 'aria-label': 'Name' }} /></ThemeProvider>)
      expect(screen.getByRole('textbox', { name: 'Name' }).parentElement.querySelector('fieldset')).toHaveStyle({ borderColor: line })
    },
  )
})

describe('the default export', () => {
  it('is the light theme, so existing imports keep working', () => {
    expect(theme.palette.mode).toBe('light')
    expect(theme.palette.primary.main).toBe(makeTheme('light').palette.primary.main)
  })
})

describe('square boxes, rounded buttons (spec 6.1, 6.2)', () => {
  const square = (element) => expect(getComputedStyle(element).borderRadius).toMatch(/^0(px)?$/)

  it.each(MODES)('draws cards, fields and alerts square in %s mode', (mode) => {
    render(
      <ThemeProvider theme={makeTheme(mode)}>
        <Card data-testid="card">card</Card>
        <OutlinedInput inputProps={{ 'aria-label': 'Name' }} />
        <Alert severity="error">Refused</Alert>
      </ThemeProvider>,
    )
    square(screen.getByTestId('card'))
    square(screen.getByRole('textbox', { name: 'Name' }).parentElement)
    square(screen.getByRole('alert'))
  })

  it.each(MODES)('draws dialogs square in %s mode', (mode) => {
    render(<ThemeProvider theme={makeTheme(mode)}><Dialog open aria-label="Dialog"><p>body</p></Dialog></ThemeProvider>)
    square(screen.getByRole('dialog'))
  })

  it('rounds buttons (8 px) and chips (6 px) a little, to feel less stiff', () => {
    render(<ThemeProvider theme={theme}><Button>Save</Button><Chip label="Active" /></ThemeProvider>)
    expect(screen.getByRole('button', { name: 'Save' })).toHaveStyle({ borderRadius: '8px' })
    expect(screen.getByText('Active').parentElement).toHaveStyle({ borderRadius: '6px' })
  })

  it('fills a red chip (the New label) with the danger red and white words', () => {
    render(<ThemeProvider theme={theme}><Chip label="New" color="error" /></ThemeProvider>)
    expect(screen.getByText('New').parentElement).toHaveStyle({ backgroundColor: 'rgb(194, 31, 31)', color: 'rgb(255, 255, 255)' })
  })
})
