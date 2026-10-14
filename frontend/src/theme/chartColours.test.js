import { describe, expect, it } from 'vitest'
import { GRID, INK, STATE_COLOURS, SURFACE, projectColours } from './chartColours'

describe('projectColours', () => {
  it('colours projects by id, lowest first, whatever order they arrive in', () => {
    const expected = new Map([[3, '#1c5cab'], [7, '#199e70'], [9, '#9085e9']])
    expect(projectColours([7, 3, 9])).toEqual(expected)
    expect(projectColours([9, 3, 7, 3])).toEqual(expected)
  })

  it('folds the 6th project and later into Other', () => {
    const colours = projectColours([1, 2, 3, 4, 5, 6, 7])
    expect([colours.get(5), colours.get(6), colours.get(7)]).toEqual(['#eda100', '#D1D5DB', '#D1D5DB'])
  })
})

/** WCAG 2 contrast ratio between two #RRGGBB colours. */
function contrast(a, b) {
  const lum = (hex) => {
    const [r, g, bl] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl
  }
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

describe('timeline state colours', () => {
  it('are spec section 5\'s table, word for word', () => {
    expect(STATE_COLOURS).toEqual({
      DONE: { fill: '#2E7D32', track: '#B6D2B7' },
      IN_PROGRESS: { fill: '#0B3D91', track: '#AABBD8' },
      NOT_STARTED: { fill: '#6B7280', track: '#CBCED3' },
      BLOCKED: { fill: '#6B7280', track: '#CBCED3' },
      LATE: { fill: '#C62828', track: '#EBB4B4' },
    })
    expect([INK, GRID, SURFACE]).toEqual(['#1F2937', '#E5E7EB', '#FFFFFF'])
  })

  it('give every fill and the Today line at least 3:1 on the card, and keep tracks quieter than their fill', () => {
    for (const { fill, track } of Object.values(STATE_COLOURS)) {
      expect(contrast(fill, SURFACE)).toBeGreaterThanOrEqual(3)
      expect(contrast(track, SURFACE)).toBeLessThan(contrast(fill, SURFACE))
      expect(contrast(track, SURFACE)).toBeGreaterThan(contrast(GRID, SURFACE)) // a track never looks like a gridline
    }
    expect(contrast(INK, SURFACE)).toBeGreaterThanOrEqual(3)
  })
})
