import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import {
  Alert, Button, Card, Chip, Dialog, OutlinedInput, Tooltip, Typography,
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
]
// UI parts need 3:1: the gold Today line, the green-ink focus ring and button borders, a primary button's edge.
const UI_PAIRS = [
  ['secondary.main', 'background.paper'],
  ['secondary.main', 'background.default'],
  ['primary.main', 'background.default'],
  ['fill.main', 'background.paper'],
  ['fill.main', 'background.default'],
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

describe('contained buttons', () => {
  it.each([
    ['light', 'rgb(31, 122, 58)', 'rgb(255, 255, 255)'], // the fill green, white words
    ['dark', 'rgb(255, 255, 255)', 'rgb(20, 96, 44)'], // white, green words
  ])('are drawn per mode (%s)', (mode, background, color) => {
    render(<ThemeProvider theme={makeTheme(mode)}><Button variant="contained">Save</Button></ThemeProvider>)
    expect(screen.getByRole('button', { name: 'Save' })).toHaveStyle({ backgroundColor: background, color })
  })
})

describe('the three kinds of button (spec 5c)', () => {
  it('makes a plain Button the secondary kind: outlined in green ink on the panel', () => {
    const t = makeTheme('light')
    render(<ThemeProvider theme={t}><Button>Edit</Button></ThemeProvider>)
    const edit = screen.getByRole('button', { name: 'Edit' })
    expect(edit).toHaveClass('MuiButton-outlined')
    expect(edit).toHaveStyle({ borderColor: 'rgb(20, 96, 44)', backgroundColor: 'rgb(255, 255, 255)' })
    expect(getComputedStyle(edit).getPropertyValue('--variant-outlinedColor')).toBe(t.palette.primary.main) // the label (a CSS variable)
  })

  it('draws the danger kind outlined in red, never filled', () => {
    render(<ThemeProvider theme={makeTheme('light')}><Button color="error">Archive</Button></ThemeProvider>)
    const archive = screen.getByRole('button', { name: 'Archive' })
    expect(archive).toHaveClass('MuiButton-outlined')
    expect(archive).toHaveStyle({ borderColor: 'rgb(179, 38, 30)', backgroundColor: 'rgb(255, 255, 255)' })
  })

  it('gives the primary kind a glow at rest', () => {
    render(<ThemeProvider theme={makeTheme('light')}><Button variant="contained">Save</Button></ThemeProvider>)
    expect(getComputedStyle(screen.getByRole('button', { name: 'Save' })).boxShadow).toMatch(/^0 0 6px rgba\(31, 122, 58/)
  })
})

describe('panels and titles (spec 5c)', () => {
  it('gives a card a soft glow, and a card inside it none', () => {
    render(<ThemeProvider theme={makeTheme('light')}><Card data-testid="outer"><Card data-testid="inner">x</Card></Card></ThemeProvider>)
    expect(getComputedStyle(screen.getByTestId('outer')).boxShadow).toMatch(/^0 0 12px rgba/)
    expect(getComputedStyle(screen.getByTestId('inner')).boxShadow).toBe('none')
  })

  it.each(MODES)('writes page titles in capitals with a little tracking (%s)', (mode) => {
    render(<ThemeProvider theme={makeTheme(mode)}><Typography variant="h1">Dashboard</Typography></ThemeProvider>)
    // 0.012em of the 28 px title is 0.336 px.
    expect(screen.getByRole('heading', { name: 'Dashboard' })).toHaveStyle({ textTransform: 'uppercase', letterSpacing: '0.336px' })
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

describe('the default export', () => {
  it('is the light theme, so existing imports keep working', () => {
    expect(theme.palette.mode).toBe('light')
    expect(theme.palette.primary.main).toBe(makeTheme('light').palette.primary.main)
  })
})

describe('square corners on screen', () => {
  const square = (element) => expect(getComputedStyle(element).borderRadius).toMatch(/^0(px)?$/)

  it.each(MODES)('draws cards, buttons, fields, chips, alerts and tooltips square in %s mode', async (mode) => {
    render(
      <ThemeProvider theme={makeTheme(mode)}>
        <Card data-testid="card">card</Card>
        <Button variant="contained">Save</Button>
        <OutlinedInput inputProps={{ 'aria-label': 'Name' }} />
        <Chip label="Active" color="primary" />
        <Alert severity="error">Refused</Alert>
        <Tooltip title="Tip" open><span>hover me</span></Tooltip>
      </ThemeProvider>,
    )
    square(screen.getByTestId('card'))
    square(screen.getByRole('button', { name: 'Save' }))
    square(screen.getByRole('textbox', { name: 'Name' }).parentElement)
    square(screen.getByText('Active').parentElement)
    square(screen.getByRole('alert'))
    square((await screen.findByRole('tooltip')).firstChild)
  })

  it.each(MODES)('draws dialogs square in %s mode', (mode) => {
    render(<ThemeProvider theme={makeTheme(mode)}><Dialog open aria-label="Dialog"><p>body</p></Dialog></ThemeProvider>)
    square(screen.getByRole('dialog'))
  })
})
