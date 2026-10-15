import { describe, expect, it } from 'vitest'
import { deliverableState, dayCentre, mondayOf, placeSpan, timelineWindow } from './projectTimelines'

describe('mondayOf', () => {
  it('gives the Monday of the week a date falls in (weeks run Monday to Sunday)', () => {
    expect(mondayOf('2026-10-14')).toBe('2026-10-12') // a Wednesday
    expect(mondayOf('2026-10-12')).toBe('2026-10-12') // a Monday is its own
    expect(mondayOf('2026-10-18')).toBe('2026-10-12') // a Sunday ends the week
  })
})

describe('timelineWindow', () => {
  it('shows 12 weeks from the Monday two weeks before this week', () => {
    const axis = timelineWindow('2026-10-14')
    expect(axis.weeks).toHaveLength(12)
    expect(axis.weeks[0]).toBe('2026-09-28')
    expect(axis.weeks[2]).toBe('2026-10-12') // this week is the third column
    expect(axis.weeks[11]).toBe('2026-12-14')
    expect(axis).toMatchObject({ from: '2026-09-28', to: '2026-12-20', days: 84 })
  })

  it('moves 4 weeks a step, earlier or later', () => {
    expect(timelineWindow('2026-10-14', -1).from).toBe('2026-08-31')
    expect(timelineWindow('2026-10-14', 1).from).toBe('2026-10-26')
    expect(timelineWindow('2026-10-14', 2)).toMatchObject({ from: '2026-11-23', to: '2027-02-14' })
  })
})

describe('placeSpan', () => {
  const axis = timelineWindow('2026-10-14') // Sep 28 to Dec 20, 84 days

  it('places a span inside the window by its days, counting the last day', () => {
    // Oct 5 is day 7; Oct 18 is day 20, so 14 days wide.
    expect(placeSpan(axis, '2026-10-05', '2026-10-18')).toEqual({ left: 700 / 84, width: 1400 / 84, before: false, after: false })
  })

  it('cuts a span at the window edges and says which ends run on', () => {
    expect(placeSpan(axis, '2026-09-01', '2026-10-04')).toEqual({ left: 0, width: 700 / 84, before: true, after: false })
    expect(placeSpan(axis, '2026-12-14', '2027-03-01')).toEqual({ left: 7700 / 84, width: 700 / 84, before: false, after: true })
    expect(placeSpan(axis, '2026-01-01', '2027-12-31')).toEqual({ left: 0, width: 100, before: true, after: true })
  })

  it('places nothing for a span wholly outside the window', () => {
    expect(placeSpan(axis, '2026-08-01', '2026-09-27')).toBeNull()
    expect(placeSpan(axis, '2026-12-21', '2027-01-31')).toBeNull()
  })
})

describe('dayCentre', () => {
  const axis = timelineWindow('2026-10-14')

  it('gives the middle of a day, as a percent of the window', () => {
    expect(dayCentre(axis, '2026-09-28')).toBeCloseTo(50 / 84)
    expect(dayCentre(axis, '2026-10-14')).toBeCloseTo(1650 / 84) // day 16, half way through it
    expect(dayCentre(axis, '2026-12-20')).toBeCloseTo(8350 / 84)
  })

  it('gives null for a day outside the window', () => {
    expect(dayCentre(axis, '2026-09-27')).toBeNull()
    expect(dayCentre(axis, '2026-12-21')).toBeNull()
  })
})

describe('deliverableState', () => {
  const due = (status, dueDate) => ({ status, dueDate })

  it('says Late once the due day has passed without sign-off, otherwise the status', () => {
    expect(deliverableState(due('IN_PROGRESS', '2026-10-13'), '2026-10-14')).toEqual({ key: 'LATE', word: 'Late' })
    expect(deliverableState(due('IN_PROGRESS', '2026-10-14'), '2026-10-14')).toEqual({ key: 'IN_PROGRESS', word: 'In progress' })
    expect(deliverableState(due('DONE', '2026-10-01'), '2026-10-14')).toEqual({ key: 'DONE', word: 'Done' })
    expect(deliverableState(due('NOT_STARTED', '2026-11-01'), '2026-10-14')).toEqual({ key: 'NOT_STARTED', word: 'Not started' })
    expect(deliverableState(due('BLOCKED', '2026-11-01'), '2026-10-14')).toEqual({ key: 'BLOCKED', word: 'Blocked' })
  })
})
