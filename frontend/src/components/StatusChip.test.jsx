import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ThemeProvider } from '@mui/material/styles'
import StatusChip from './StatusChip'
import theme, { makeTheme } from '../theme/theme'
import { contrast } from '../test/contrast'

const draw = (status, t = theme) => render(<ThemeProvider theme={t}><StatusChip status={status} /></ThemeProvider>)
const chip = (label) => screen.getByText(label).closest('.MuiChip-root')

/** A computed rgba() colour laid over a #RRGGBB surface, as #RRGGBB: what the eye sees. */
function over(rgba, surface) {
  const [r, g, b, a = 1] = rgba.match(/[\d.]+/g).map(Number)
  const base = [1, 3, 5].map((i) => parseInt(surface.slice(i, i + 2), 16))
  return `#${[r, g, b].map((c, i) => Math.round(a * c + (1 - a) * base[i]).toString(16).padStart(2, '0')).join('')}`
}

describe('StatusChip', () => {
  it.each([
    ['ACTIVE', 'Active', 'PlayCircle', 'Default'],
    ['IN_PROGRESS', 'In progress', 'Timelapse', 'Default'],
    ['ON_HOLD', 'On hold', 'PauseCircle', 'Warning'],
    ['DONE', 'Done', 'CheckCircle', 'Success'],
    ['BLOCKED', 'Blocked', 'Block', 'Error'],
    ['PENDING', 'Pending', 'HourglassEmpty', 'Warning'],
    ['REJECTED', 'Rejected', 'Cancel', 'Error'],
    ['TODO', 'To do', 'RadioButtonUnchecked', 'Default'],
  ])('shows %s as an icon, the word "%s" and a colour', (status, label, icon, colour) => {
    draw(status)
    const shown = chip(label)
    expect(shown.querySelector('svg')).not.toBeNull()
    expect(shown.querySelector('svg')).toHaveAttribute('data-testid', expect.stringContaining(icon))
    expect(shown).toHaveClass(`MuiChip-color${colour}`)
  })

  it('keeps the brand green for buttons: no status is drawn in it', () => {
    for (const status of ['PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETE', 'NOT_STARTED', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'TODO', 'PENDING', 'APPROVED', 'REJECTED']) {
      const { unmount } = draw(status)
      expect(document.querySelector('.MuiChip-root')).not.toHaveClass('MuiChip-colorPrimary')
      unmount()
    }
  })

  it('has no border, only a faint wash of its colour, so it never looks like a button', () => {
    draw('REJECTED')
    const shown = chip('Rejected')
    expect(getComputedStyle(shown).borderColor).toMatch(/^(transparent|rgba\(0, 0, 0, 0\))$/)
    expect(getComputedStyle(shown).backgroundColor).toMatch(/^rgba\(194, 31, 31, 0\.1\)$/) // the error red, faint
  })

  it.each(['light', 'dark'])('reads at 4.5:1, its icon at 3:1, on a panel and on the page (%s)', (mode) => {
    const t = makeTheme(mode)
    for (const [status, label, tone] of [
      ['ACTIVE', 'Active', t.palette.text.secondary], ['ON_HOLD', 'On hold', t.palette.warning.main],
      ['DONE', 'Done', t.palette.success.main], ['REJECTED', 'Rejected', t.palette.error.main],
    ]) {
      const { unmount } = draw(status, t)
      const shown = chip(label)
      expect(shown).toHaveStyle({ color: t.palette.text.primary }) // the word
      expect(shown.querySelector('.MuiChip-icon')).toHaveStyle({ color: tone })
      for (const surface of [t.palette.background.paper, t.palette.background.default]) {
        const wash = over(getComputedStyle(shown).backgroundColor, surface)
        expect(contrast(t.palette.text.primary, wash)).toBeGreaterThanOrEqual(4.5)
        expect(contrast(tone, wash)).toBeGreaterThanOrEqual(3)
      }
      unmount()
    }
  })

  it('shows an unknown status as its own word', () => {
    draw('ARCHIVED')
    expect(screen.getByText('ARCHIVED')).toBeInTheDocument()
  })
})
