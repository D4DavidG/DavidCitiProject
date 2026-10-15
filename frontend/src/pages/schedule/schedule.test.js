import { describe, expect, it } from 'vitest'
import { OTHER_COLOUR, PROJECT_COLOURS } from '../../theme/chartColours'
import { keepColours, scheduleBars } from './schedule'

const apollo = (hours) => ({ projectId: 1, name: 'Apollo', hours })
const zeus = (hours) => ({ projectId: 2, name: 'Zeus', hours })
const weeks = (...projectLists) => projectLists.map((projects, i) => ({ week: `2026-10-${12 + 7 * i}`, projects }))

describe('scheduleBars', () => {
  it('draws one bar per project across the weeks it has the same hours', () => {
    const bars = scheduleBars(weeks([apollo(25), zeus(20)], [apollo(25), zeus(20)], [apollo(25)]))
    expect(bars).toEqual([
      { projectId: 1, name: 'Apollo', hours: 25, first: 0, last: 2 },
      { projectId: 2, name: 'Zeus', hours: 20, first: 0, last: 1 },
    ])
  })

  it('splits a bar where the hours change', () => {
    const bars = scheduleBars(weeks([apollo(25)], [apollo(25)], [apollo(10)]))
    expect(bars).toEqual([
      { projectId: 1, name: 'Apollo', hours: 25, first: 0, last: 1 },
      { projectId: 1, name: 'Apollo', hours: 10, first: 2, last: 2 },
    ])
  })

  it('splits a bar where a week has no hours for that project', () => {
    const bars = scheduleBars(weeks([apollo(25)], [], [apollo(25)]))
    expect(bars.map((b) => [b.first, b.last])).toEqual([[0, 0], [2, 2]])
  })

  it('has no bars for someone not booked', () => {
    expect(scheduleBars(weeks([], []))).toEqual([])
  })
})

describe('keepColours', () => {
  it('gives new projects the next free colour, lowest id first', () => {
    const colours = keepColours(new Map(), [7, 3])
    expect(colours.get(3)).toBe(PROJECT_COLOURS[0])
    expect(colours.get(7)).toBe(PROJECT_COLOURS[1])
  })

  it('never changes a colour already given, whatever comes later', () => {
    const first = keepColours(new Map(), [7])
    const later = keepColours(first, [3, 7])
    expect(later.get(7)).toBe(PROJECT_COLOURS[0])
    expect(later.get(3)).toBe(PROJECT_COLOURS[1])
  })

  it('gives the grey Other to every project past the last colour', () => {
    const ids = PROJECT_COLOURS.map((_, i) => i + 1)
    const colours = keepColours(new Map(), [...ids, 98, 99])
    expect(colours.get(98)).toBe(OTHER_COLOUR)
    expect(colours.get(99)).toBe(OTHER_COLOUR)
  })

  it('returns the same map when nothing is new, so the screen does not redraw for nothing', () => {
    const known = keepColours(new Map(), [1, 2])
    expect(keepColours(known, [2, 1])).toBe(known)
  })
})
