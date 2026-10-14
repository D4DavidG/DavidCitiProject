import { describe, expect, it } from 'vitest'
import {
  addDays, centsToDollarsInput, formatCents, formatDate, formatDateTime, formatDay, formatHours, parseDollars, parseDuration, splitMinutes, todayIso,
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

describe('splitMinutes', () => {
  it('splits minutes into the text for the Hours and Minutes boxes', () => {
    expect(splitMinutes(420)).toEqual({ hours: '7', minutes: '0' })
    expect(splitMinutes(150)).toEqual({ hours: '2', minutes: '30' })
    expect(splitMinutes(45)).toEqual({ hours: '0', minutes: '45' })
  })

  it('leaves both boxes empty when there is no value', () => {
    expect(splitMinutes(null)).toEqual({ hours: '', minutes: '' })
    expect(splitMinutes(undefined)).toEqual({ hours: '', minutes: '' })
  })
})

describe('parseDuration', () => {
  it('turns typed hours and minutes into minutes, an empty box counting as 0', () => {
    expect(parseDuration('2', '30', 1440)).toEqual({ minutes: 150 })
    expect(parseDuration('', '45', 1440)).toEqual({ minutes: 45 })
    expect(parseDuration(' 3 ', '', 1440)).toEqual({ minutes: 180 })
    expect(parseDuration('24', '0', 1440)).toEqual({ minutes: 1440 })
    expect(parseDuration('100', '', 60000)).toEqual({ minutes: 6000 })
  })

  it('refuses minutes that are not a whole number from 0 to 59, naming the Minutes box', () => {
    const error = { box: 'minutes', error: 'Minutes must be a whole number from 0 to 59.' }
    expect(parseDuration('1', '75', 1440)).toEqual(error)
    expect(parseDuration('1', '2.5', 1440)).toEqual(error)
    expect(parseDuration('1', '-5', 1440)).toEqual(error)
    expect(parseDuration('1', 'ten', 1440)).toEqual(error)
  })

  it('refuses hours that are not a whole number up to the maximum, naming the Hours box', () => {
    expect(parseDuration('2.5', '', 1440)).toEqual({ box: 'hours', error: 'Hours must be a whole number from 0 to 24.' })
    expect(parseDuration('25', '', 1440)).toEqual({ box: 'hours', error: 'Hours must be a whole number from 0 to 24.' })
    expect(parseDuration('1001', '', 60000)).toEqual({ box: 'hours', error: 'Hours must be a whole number from 0 to 1000.' })
  })

  it('refuses no time at all', () => {
    const error = { box: 'hours', error: 'Enter some time: at least 1 minute.' }
    expect(parseDuration('', '', 1440)).toEqual(error)
    expect(parseDuration('0', '0', 1440)).toEqual(error)
  })

  it('refuses a total over the maximum', () => {
    expect(parseDuration('24', '30', 1440)).toEqual({ box: 'hours', error: 'That is more than 24 h.' })
    expect(parseDuration('1000', '1', 60000)).toEqual({ box: 'hours', error: 'That is more than 1000 h.' })
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
