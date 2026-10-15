import { describe, expect, it } from 'vitest'
import { CHART_COLOURS, OTHER_COLOUR, PROJECT_COLOURS } from '../../theme/chartColours'
import {
  keepColours, keepSlots, scheduleBars, slotColours,
} from './schedule'

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

describe('keepSlots', () => {
  it('gives new projects the next free colour slot, lowest id first', () => {
    const slots = keepSlots(new Map(), [7, 3])
    expect([slots.get(3), slots.get(7)]).toEqual([0, 1])
  })

  it('never changes a slot already given, whatever comes later', () => {
    const first = keepSlots(new Map(), [7])
    const later = keepSlots(first, [3, 7])
    expect([later.get(7), later.get(3)]).toEqual([0, 1])
  })

  it('returns the same map when nothing is new, so the screen does not redraw for nothing', () => {
    const known = keepSlots(new Map(), [1, 2])
    expect(keepSlots(known, [2, 1])).toBe(known)
  })
})

describe('keepColours (light colours, for ProjectTimelines)', () => {
  it('gives new projects the next free colour, lowest id first, and never changes one already given', () => {
    const first = keepColours(new Map(), [7])
    const later = keepColours(first, [3, 7])
    expect([later.get(7), later.get(3)]).toEqual([PROJECT_COLOURS[0], PROJECT_COLOURS[1]])
  })

  it('gives the grey Other past the last colour, and the same map when nothing is new', () => {
    const ids = PROJECT_COLOURS.map((_, i) => i + 1)
    const colours = keepColours(new Map(), [...ids, 98])
    expect(colours.get(98)).toBe(OTHER_COLOUR)
    expect(keepColours(colours, [98, 1])).toBe(colours)
  })
})

describe('slotColours', () => {
  const ids = PROJECT_COLOURS.map((_, i) => i + 1)
  const slots = keepSlots(new Map(), [...ids, 98, 99])

  it('colours each slot from the set for the mode, so light/dark repaints a project in its own colour', () => {
    expect(slotColours(slots, CHART_COLOURS.light).get(1)).toBe(PROJECT_COLOURS[0])
    expect(slotColours(slots, CHART_COLOURS.dark).get(1)).toBe(CHART_COLOURS.dark.project[0])
  })

  it('gives the grey Other to every project past the last colour', () => {
    const colours = slotColours(slots, CHART_COLOURS.light)
    expect([colours.get(98), colours.get(99)]).toEqual([OTHER_COLOUR, OTHER_COLOUR])
    expect(slotColours(slots, CHART_COLOURS.dark).get(99)).toBe(CHART_COLOURS.dark.other)
  })
})
