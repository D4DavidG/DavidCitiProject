/**
 * The only place the website turns raw API values into text.
 *
 * Money arrives as integer cents and is only ever formatted here, never added,
 * multiplied or rounded anywhere else (CLAUDE.md §9). Dates and times use Eastern
 * time, like the server's "today".
 */

const DASH = '—'
const ZONE = 'America/New_York'

const dollars = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const dateOnly = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
const dateTime = new Intl.DateTimeFormat('en-US', {
  month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: ZONE,
})

/** 1250000 -> "$12,500" (whole dollars). */
export function formatCents(cents) {
  if (cents === null || cents === undefined) return DASH
  return dollars.format(cents / 100)
}

/**
 * What someone typed as dollars ("12,500", "$19.99") -> integer cents, or null if it
 * isn't an amount. Done on the digits as text, never with floating-point maths, so
 * "0.1" is exactly 10 cents. This and centsToDollarsInput are the only conversions.
 */
export function parseDollars(text) {
  const cleaned = String(text ?? '').trim().replace(/[$,\s]/g, '')
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(cleaned)
  if (!match) return null
  return Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'))
}

/** Integer cents -> the text to put back in a dollars input: 1250000 -> "12500", 1999 -> "19.99". */
export function centsToDollarsInput(cents) {
  if (cents === null || cents === undefined) return ''
  const whole = Math.floor(cents / 100)
  const rest = cents % 100
  return rest ? `${whole}.${String(rest).padStart(2, '0')}` : String(whole)
}

/**
 * The server's whole-number "budget spent" percentage as text. It rounds down, so a
 * project that has spent something but under 1% would read "0%": show "<1%" instead.
 */
export function spentPercent(consumedPercent, consumedCents) {
  if (consumedPercent === null || consumedPercent === undefined) return DASH
  return consumedPercent === 0 && consumedCents > 0 ? '<1%' : `${consumedPercent}%`
}

/** 90 -> "1 h 30 min", 120 -> "2 h", 45 -> "45 min" (the server's wording). */
export function formatHours(minutes) {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  const parts = [hours ? `${hours} h` : '', rest ? `${rest} min` : ''].filter(Boolean)
  return parts.join(' ') || '0 min'
}

/** 420 -> { hours: '7', minutes: '0' }: the text for the Hours and Minutes boxes when editing. */
export function splitMinutes(minutes) {
  if (minutes === null || minutes === undefined) return { hours: '', minutes: '' }
  return { hours: String(Math.floor(minutes / 60)), minutes: String(minutes % 60) }
}

const WHOLE = /^\d+$/

/**
 * What someone typed in the Hours and Minutes boxes -> { minutes } in total, or
 * { box, error } naming the box ('hours' or 'minutes') the message belongs under.
 * An empty box counts as 0. Whole numbers only, so "2.5" is refused rather than
 * guessed at. maxMinutes is the server's own limit (1440 for logged time).
 */
export function parseDuration(hoursText, minutesText, maxMinutes) {
  const hours = String(hoursText ?? '').trim() || '0'
  const minutes = String(minutesText ?? '').trim() || '0'
  const maxHours = Math.floor(maxMinutes / 60)
  if (!WHOLE.test(hours) || Number(hours) > maxHours) {
    return { box: 'hours', error: `Hours must be a whole number from 0 to ${maxHours}.` }
  }
  if (!WHOLE.test(minutes) || Number(minutes) > 59) {
    return { box: 'minutes', error: 'Minutes must be a whole number from 0 to 59.' }
  }
  const total = Number(hours) * 60 + Number(minutes)
  if (total === 0) return { box: 'hours', error: 'Enter some time: at least 1 minute.' }
  if (total > maxMinutes) return { box: 'hours', error: `That is more than ${formatHours(maxMinutes)}.` }
  return { minutes: total }
}

/** "2026-10-14" -> "Oct 14, 2026". A date has no time zone, so it is read as UTC to keep the day. */
export function formatDate(iso) {
  if (!iso) return DASH
  return dateOnly.format(new Date(`${iso.slice(0, 10)}T00:00:00Z`))
}

const shortDay = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })

/** "2026-10-12" -> "Oct 12" (for column headings). */
export function formatDay(iso) {
  if (!iso) return DASH
  return shortDay.format(new Date(`${iso.slice(0, 10)}T00:00:00Z`))
}

const isoInZone = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: ZONE })

/** Today as "2026-10-14" in Eastern time, the same "today" the server uses. */
export function todayIso(now = new Date()) {
  return isoInZone.format(now)
}

/** "2026-10-12" plus 7 days -> "2026-10-19". Dates only, so it works in UTC. */
export function addDays(iso, days) {
  const date = new Date(`${iso.slice(0, 10)}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

const DAY_MS = 24 * 60 * 60 * 1000

/** Whole days from one date to another: "2026-10-14" to "2026-10-21" -> 7. Dates only, so UTC, like addDays. */
export function daysBetween(fromIso, toIso) {
  const from = Date.parse(`${fromIso.slice(0, 10)}T00:00:00Z`)
  const to = Date.parse(`${toIso.slice(0, 10)}T00:00:00Z`)
  return Math.round((to - from) / DAY_MS)
}

/** A timestamp, shown in Eastern time: "Oct 13, 2026, 9:03 PM". */
export function formatDateTime(iso) {
  if (!iso) return DASH
  return dateTime.format(new Date(iso))
}
