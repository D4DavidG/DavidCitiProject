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

/** The x, y points of a path's d attribute. */
const points = (path) => {
  const numbers = path.getAttribute('d').match(/-?\d+(\.\d+)?/g).map(Number)
  return numbers.reduce((list, n, i) => (i % 2 ? [...list.slice(0, -1), [list.at(-1)[0], n]] : [...list, [n]]), [])
}
const top = (path) => Math.min(...points(path).map(([, y]) => y))
const centre = (path) => {
  const ps = points(path)
  return [(Math.min(...ps.map(([x]) => x)) + Math.max(...ps.map(([x]) => x))) / 2, (top(path) + Math.max(...ps.map(([, y]) => y))) / 2]
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
    expect(Number(logo.getAttribute('width'))).toBeCloseTo((96 * 152) / 62, 0)
  })

  it('writes CME in Poppins bold, a softer face that still reads as a logo (spec 6.3)', () => {
    const { logo } = draw()
    const cme = logo.querySelector('[data-part="cme"]')
    expect(cme).toHaveTextContent('CME')
    expect(cme.getAttribute('font-family')).toMatch(/^Poppins/)
    expect(cme).toHaveAttribute('font-weight', '700')
  })

  it('makes the A taller than the other letters', () => {
    const { logo } = draw()
    const cme = logo.querySelector('[data-part="cme"]')
    const capTop = Number(cme.getAttribute('y')) - 0.7 * Number(cme.getAttribute('font-size'))
    expect(top(logo.querySelector('[data-part="tip"]'))).toBeLessThan(capTop)
  })

  it('ends the A in one sharp point, not a flat-topped rhombus', () => {
    const { logo } = draw()
    const tip = logo.querySelector('[data-part="tip"]')
    expect(points(tip)).toHaveLength(3) // a triangle
    expect(points(tip).filter(([, y]) => y === top(tip))).toHaveLength(1) // one point at the top
  })

  it('has three gold sparkles: one above the tip, one to its left, one to its right', () => {
    const { logo } = draw()
    const tip = logo.querySelector('[data-part="tip"]')
    const [tipX] = centre(tip)
    const sparks = [...logo.querySelectorAll('[data-part="spark"]')]
    expect(sparks).toHaveLength(3)
    sparks.forEach((spark) => expect(spark).toHaveAttribute('fill', '#FFD54A'))
    const [above, left, right] = sparks.map(centre)
    expect(above[0]).toBeCloseTo(tipX, 0)
    expect(above[1]).toBeLessThan(top(tip))
    expect(left[0]).toBeLessThan(tipX)
    expect(right[0]).toBeGreaterThan(tipX)
  })

  it('lets the peak glow softly in gold: the one glow on the site (spec 6.3)', () => {
    const { logo } = draw()
    const glow = logo.querySelector('[data-part="glow"]')
    expect(glow).toHaveAttribute('fill', '#FFD54A')
    const filterId = glow.getAttribute('filter').match(/url\(#(.+)\)/)[1]
    expect(logo.querySelector(`[id="${filterId}"] feGaussianBlur`)).not.toBeNull()
  })

  it.each([['light', 'rgb(22, 94, 38)'], ['dark', 'rgb(236, 238, 230)']])(
    'draws the letters in the brand colour for %s mode (the forest green, or the warm off-white on dark)',
    (mode, colour) => {
      const { logo } = draw({}, mode)
      expect(logo).toHaveStyle({ color: colour })
      expect(logo.querySelector('[data-part="a"]')).toHaveAttribute('fill', 'currentColor')
      expect(logo.querySelector('[data-part="cme"]')).toHaveAttribute('fill', 'currentColor')
    },
  )

  it('takes the text colour around it in the top bar', () => {
    render(<ThemeProvider theme={makeTheme('light')}><p style={{ color: 'rgb(1, 2, 3)' }}><AcmeLogo tone="inherit" /></p></ThemeProvider>)
    expect(screen.getByRole('img', { name: 'ACME' })).toHaveStyle({ color: 'rgb(1, 2, 3)' })
  })

  it('edges the gold in deep gold on the light page, where bright gold alone is too faint', () => {
    const { logo } = draw()
    for (const part of [logo.querySelector('[data-part="tip"]'), ...logo.querySelectorAll('[data-part="spark"]')]) {
      expect(part).toHaveAttribute('stroke', '#8A6100')
    }
  })

  it('needs no edge on the green top bar, where the gold already stands out', () => {
    const { logo } = draw({ tone: 'inherit' })
    expect(logo.querySelector('[data-part="tip"]')).not.toHaveAttribute('stroke')
  })
})
