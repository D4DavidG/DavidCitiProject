import { describe, expect, it } from 'vitest'
import { formatCents, formatDate, formatDateTime, formatHours } from './format'

describe('formatCents', () => {
  it('shows whole dollars with separators', () => {
    expect(formatCents(1_250_000)).toBe('$12,500')
    expect(formatCents(137_049)).toBe('$1,370')
    expect(formatCents(0)).toBe('$0')
  })

  it('shows a dash when there is no amount', () => {
    expect(formatCents(null)).toBe('—')
    expect(formatCents(undefined)).toBe('—')
  })
})

describe('formatHours', () => {
  it('matches the server wording', () => {
    expect(formatHours(90)).toBe('1 h 30 min')
    expect(formatHours(120)).toBe('2 h')
    expect(formatHours(45)).toBe('45 min')
    expect(formatHours(0)).toBe('0 min')
  })
})

describe('formatDate', () => {
  it('formats a date-only value without shifting the day', () => {
    expect(formatDate('2026-10-14')).toBe('Oct 14, 2026')
    expect(formatDate('2026-01-01')).toBe('Jan 1, 2026')
  })

  it('shows a dash for nothing', () => {
    expect(formatDate(null)).toBe('—')
  })
})

describe('formatDateTime', () => {
  it('formats a timestamp in Eastern time, like the server', () => {
    expect(formatDateTime('2026-10-14T01:03:25+00:00')).toBe('Oct 13, 2026, 9:03 PM')
  })
})
