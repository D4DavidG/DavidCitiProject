import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ThemeProvider } from '@mui/material/styles'
import AcmeLogo from './AcmeLogo'
import { makeTheme } from '../theme/theme'

function draw(props, mode = 'light') {
  const theme = makeTheme(mode)
  render(<ThemeProvider theme={theme}><AcmeLogo {...props} /></ThemeProvider>)
  return { theme, logo: screen.getByRole('img', { name: 'ACME' }) }
}

describe('AcmeLogo', () => {
  it('is one image named ACME, with a title', () => {
    const { logo } = draw()
    expect(logo.tagName).toBe('svg')
    expect(logo.querySelector('title')).toHaveTextContent('ACME')
  })

  it('is as tall as its size, and keeps its shape', () => {
    const { logo } = draw({ size: 96 })
    expect(logo).toHaveAttribute('height', '96')
    expect(Number(logo.getAttribute('width'))).toBeCloseTo((96 * 154) / 58, 0)
  })

  it('makes the A taller than the other letters', () => {
    const { logo } = draw()
    const top = (part) => Math.min(...logo.querySelector(`[data-part="${part}"]`).getAttribute('d').match(/-?\d+(\.\d+)?/g).filter((_, i) => i % 2).map(Number))
    expect(top('a')).toBeLessThan(top('cme'))
  })

  it.each([['light', 'rgb(24, 68, 41)'], ['dark', 'rgb(213, 219, 215)']])(
    'writes ACME in the brand colour for %s mode (forest green, or light grey on dark)',
    (mode, colour) => {
      const { logo } = draw({}, mode)
      expect(logo).toHaveStyle({ color: colour })
      expect(logo.querySelector('[data-part="cme"]')).toHaveAttribute('fill', 'currentColor')
    },
  )

  it('takes the text colour around it in the top bar', () => {
    render(<ThemeProvider theme={makeTheme('light')}><p style={{ color: 'rgb(1, 2, 3)' }}><AcmeLogo tone="inherit" /></p></ThemeProvider>)
    expect(screen.getByRole('img', { name: 'ACME' })).toHaveStyle({ color: 'rgb(1, 2, 3)' })
  })

  it('shines orange at the tip of the A', () => {
    const { theme, logo } = draw()
    for (const part of ['tip', 'spark']) {
      expect(logo.querySelector(`[data-part="${part}"]`)).toHaveAttribute('fill', theme.palette.secondary.main)
    }
  })
})
