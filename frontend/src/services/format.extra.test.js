import { describe, expect, it } from 'vitest'
import { formatInvolvement, formatLiveProjects, formatUpdated } from './format'

describe('formatUpdated', () => {
  it("gives a timestamp's day in Eastern time, not UTC", () => {
    expect(formatUpdated('2026-10-14T15:00:00Z')).toBe('Updated Oct 14, 2026')
    expect(formatUpdated('2026-10-15T02:30:00Z')).toBe('Updated Oct 14, 2026') // 10:30 PM on the 14th in New York
  })

  it('says a dash when there is no time', () => {
    expect(formatUpdated(null)).toBe('Updated —')
  })
})

describe('formatLiveProjects', () => {
  it('says project for one and projects for more', () => {
    expect(formatLiveProjects(1)).toBe('1 live project')
    expect(formatLiveProjects(3)).toBe('3 live projects')
  })
})

describe('formatInvolvement', () => {
  it('gives the project, its hours a week until the booking ends, and the open tasks', () => {
    expect(formatInvolvement({ name: 'Apollo', hoursPerWeek: 20, bookingEndDate: '2026-12-31', openTaskCount: 2 }))
      .toBe('Apollo · 20 hours a week until Dec 31, 2026 · 2 open tasks')
  })

  it('leaves out the parts that are 0 or missing', () => {
    expect(formatInvolvement({ name: 'Zeus', hoursPerWeek: 0, bookingEndDate: null, openTaskCount: 1 })).toBe('Zeus · 1 open task')
    expect(formatInvolvement({ name: 'Hermes', hoursPerWeek: 1, bookingEndDate: '2026-11-30', openTaskCount: 0 })).toBe('Hermes · 1 hour a week until Nov 30, 2026')
  })

  it('says "booked until" for a booking that only starts later (0 hours this week)', () => {
    expect(formatInvolvement({ name: 'Ares', hoursPerWeek: 0, bookingEndDate: '2027-01-31', openTaskCount: 0 })).toBe('Ares · booked until Jan 31, 2027')
  })
})
