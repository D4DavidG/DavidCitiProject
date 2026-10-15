import { describe, expect, it } from 'vitest'
import { BUILD, DESIGN } from '../../pages/projects/fixtures'
import { isLate, monthTicks, offset, span, timelineAxis } from './timeline'

const MIGRATION = { ...BUILD, milestoneId: 13, name: 'Migration', startDate: '2026-08-14', dueDate: '2026-10-10' }

describe('timeline helpers', () => {
  it('is late once the due day has passed and it is not signed off', () => {
    expect(isLate(MIGRATION, '2026-10-14')).toBe(true)
    expect(isLate({ ...DESIGN, dueDate: '2026-10-06' }, '2026-10-14')).toBe(false) // DONE
  })

  it('is not late on its due day', () => {
    expect(isLate({ ...BUILD, dueDate: '2026-10-14' }, '2026-10-14')).toBe(false)
  })

  it('stretches the axis to every deliverable and counts the last day', () => {
    const axis = timelineAxis([BUILD, MIGRATION], '2026-10-01', '2026-12-31')
    expect(axis).toEqual({ from: '2026-08-14', to: '2026-12-31', days: 140 })
    expect(span(axis, '2026-08-14', '2026-10-10')).toEqual({ left: 0, width: 58 * 100 / 140 })
    expect(offset(axis, '2026-10-14')).toBe(61 * 100 / 140)
  })

  it('labels the first of each month, skipping evenly down to the maximum', () => {
    expect(monthTicks('2026-08-14', '2026-12-31', 6)).toEqual(['2026-09-01', '2026-10-01', '2026-11-01', '2026-12-01'])
    expect(monthTicks('2026-08-14', '2026-12-31', 3)).toEqual(['2026-09-01', '2026-11-01'])
  })
})
