import { createElement } from 'react'
import { describe, expect, it } from 'vitest'
import { renderHook } from '@testing-library/react'
import { ThemeProvider } from '@mui/material/styles'
import {
  CHART_COLOURS, MARK, projectColours, useChartColours,
} from './chartColours'
import { makeTheme } from './theme'
import { contrast } from '../test/contrast'

const {
  grid: GRID, ink: INK, state: STATE_COLOURS, surface: SURFACE,
} = CHART_COLOURS.light

describe('projectColours', () => {
  it('colours projects by id, lowest first, whatever order they arrive in', () => {
    const expected = new Map([[3, '#1c5cab'], [7, '#199e70'], [9, '#9085e9']])
    expect(projectColours([7, 3, 9])).toEqual(expected)
    expect(projectColours([9, 3, 7, 3])).toEqual(expected)
  })

  it('takes the colours of the set it is given (dark mode)', () => {
    expect(projectColours([7, 3], CHART_COLOURS.dark)).toEqual(new Map([[3, '#3987e5'], [7, '#199e70']]))
  })

  it('folds the 6th project and later into Other', () => {
    const colours = projectColours([1, 2, 3, 4, 5, 6, 7])
    expect([colours.get(5), colours.get(6), colours.get(7)]).toEqual(['#eda100', '#D1D5DB', '#D1D5DB'])
  })
})


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

describe('the dark set', () => {
  const dark = CHART_COLOURS.dark

  it('is measured against the card it sits on: the theme\'s card colour, in both modes', () => {
    for (const mode of ['light', 'dark']) {
      expect(CHART_COLOURS[mode].surface).toBe(makeTheme(mode).palette.background.paper)
    }
  })

  it('is the project palette the dataviz validator passed on the dark card (14 Oct)', () => {
    expect(dark.project).toEqual(['#3987e5', '#199e70', '#9085e9', '#d55181', '#c98500'])
  })

  it('gives every mark, line and project at least 3:1 on the dark card, tracks quieter than fills, louder than gridlines', () => {
    const marks = [
      ...Object.values(dark.state).map((s) => s.fill), dark.budget.spent, dark.budget.over, dark.over, dark.ink, dark.today, ...dark.project,
    ]
    marks.forEach((colour) => expect(contrast(colour, dark.surface)).toBeGreaterThanOrEqual(3))
    for (const { fill, track } of [...Object.values(dark.state), { fill: dark.budget.spent, track: dark.budget.waiting }]) {
      expect(contrast(track, dark.surface)).toBeLessThan(contrast(fill, dark.surface))
      expect(contrast(track, dark.surface)).toBeGreaterThan(contrast(dark.grid, dark.surface))
    }
  })

  it('has the same keys as the light set, so a chart can take either', () => {
    const shape = (set) => Object.keys(set).sort()
    expect(shape(dark)).toEqual(shape(CHART_COLOURS.light))
    expect(Object.keys(dark.state)).toEqual(Object.keys(CHART_COLOURS.light.state))
  })
})

describe('the light set', () => {
  it('draws the Today line gold, at least 3:1 on the white card', () => {
    expect(contrast(CHART_COLOURS.light.today, SURFACE)).toBeGreaterThanOrEqual(3)
  })
})

describe('useChartColours', () => {
  const inMode = (mode) => ({ wrapper: ({ children }) => createElement(ThemeProvider, { theme: makeTheme(mode) }, children) })

  it('picks the set for the colour mode', () => {
    expect(renderHook(() => useChartColours(), inMode('light')).result.current).toBe(CHART_COLOURS.light)
    expect(renderHook(() => useChartColours(), inMode('dark')).result.current).toBe(CHART_COLOURS.dark)
  })
})

describe('mark sizes', () => {
  it('draws bars square (sharp corners, as the rest of the site)', () => {
    expect(MARK.radius).toBe(0)
  })
})
