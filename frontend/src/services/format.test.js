import { describe, expect, it } from 'vitest'
import {
  addDays, centsToDollarsInput, formatCents, formatDate, formatDateTime, formatDay, formatHours, parseDollars, todayIso,
} from './format'

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

describe('parseDollars', () => {
  it('turns typed dollars into integer cents without floating-point maths', () => {
    expect(parseDollars('12,500')).toBe(1_250_000)
    expect(parseDollars('$150000')).toBe(15_000_000)
    expect(parseDollars('19.99')).toBe(1999)
    expect(parseDollars('0.1')).toBe(10)
    expect(parseDollars(' 7 ')).toBe(700)
  })

  it('refuses anything that is not an amount', () => {
    expect(parseDollars('')).toBeNull()
    expect(parseDollars('abc')).toBeNull()
    expect(parseDollars('1.234')).toBeNull()
    expect(parseDollars('-5')).toBeNull()
  })
})

describe('centsToDollarsInput', () => {
  it('shows cents as an editable dollar amount', () => {
    expect(centsToDollarsInput(1_250_000)).toBe('12500')
    expect(centsToDollarsInput(1999)).toBe('19.99')
    expect(centsToDollarsInput(10)).toBe('0.10')
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

describe('formatDay and addDays', () => {
  it('shows a short day without the year', () => {
    expect(formatDay('2026-10-12')).toBe('Oct 12')
  })

  it('moves a date by whole days, across month ends', () => {
    expect(addDays('2026-10-12', 7)).toBe('2026-10-19')
    expect(addDays('2026-10-26', 7)).toBe('2026-11-02')
    expect(addDays('2026-10-12', -7)).toBe('2026-10-05')
  })
})

describe('todayIso', () => {
  it("is today's date in Eastern time, like the server", () => {
    expect(todayIso(new Date('2026-10-14T03:30:00Z'))).toBe('2026-10-13') // 11:30 pm the day before in New York
    expect(todayIso(new Date('2026-10-14T15:00:00Z'))).toBe('2026-10-14')
  })
})

describe('formatDateTime', () => {
  it('formats a timestamp in Eastern time, like the server', () => {
    expect(formatDateTime('2026-10-14T01:03:25+00:00')).toBe('Oct 13, 2026, 9:03 PM')
  })
})
