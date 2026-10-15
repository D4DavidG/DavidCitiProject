import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import {
  Alert, Button, Card, Chip, Dialog, OutlinedInput, Tooltip,
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
  ...['text.primary', 'text.secondary', 'primary.main', 'error.main', 'warning.main', 'success.main']
    .flatMap((ink) => SURFACES.map((surface) => [ink, surface])),
  ['primary.contrastText', 'primary.main'], // the active menu item, filled chips
  ['secondary.contrastText', 'secondary.main'],
  ['error.contrastText', 'error.main'], // filled status chips and the bell's badge
  ['warning.contrastText', 'warning.main'],
  ['success.contrastText', 'success.main'],
  ['header.contrastText', 'header.main'], // the top bar
  ['button.contrastText', 'button.main'], // contained buttons
  ['button.contrastText', 'button.hover'],
]
// UI parts need 3:1: the orange (the Today line, the focus ring) and a contained button's edge.
const UI_PAIRS = [
  ['secondary.main', 'background.paper'],
  ['secondary.main', 'background.default'],
  ['button.main', 'background.paper'],
  ['button.main', 'background.default'],
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

  it('keeps every status colour distinct from the green primary', () => {
    for (const status of ['error', 'warning', 'success']) {
      expect(distance(t.palette[status].main, t.palette.primary.main)).toBeGreaterThanOrEqual(15)
    }
  })

  it('draws the graph-paper grid on the page in 24 px squares, fainter than any text', () => {
    const body = t.components.MuiCssBaseline.styleOverrides.body
    expect(body.backgroundColor).toBe(t.palette.background.default)
    expect(body.backgroundImage.split(t.palette.gridLine)).toHaveLength(3) // two lines: across and down
    expect(body.backgroundSize).toBe('24px 24px')
    expect(contrast(t.palette.gridLine, t.palette.background.default)).toBeLessThan(1.3)
  })

  it('has square corners', () => {
    expect(t.shape.borderRadius).toBe(0)
  })
})

describe('contained buttons', () => {
  it.each([
    ['light', 'rgb(24, 68, 41)', 'rgb(255, 255, 255)'], // forest green, white words
    ['dark', 'rgb(255, 255, 255)', 'rgb(24, 68, 41)'], // white, forest green words
  ])('are drawn per mode (%s)', (mode, background, color) => {
    render(<ThemeProvider theme={makeTheme(mode)}><Button variant="contained">Save</Button></ThemeProvider>)
    expect(screen.getByRole('button', { name: 'Save' })).toHaveStyle({ backgroundColor: background, color })
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
