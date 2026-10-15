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

/** Booked hours a week (a whole number): 25 -> "25 h/wk"; spoken (for aria-labels) -> "25 hours a week". */
export function formatPerWeek(hours, { spoken = false } = {}) {
  if (!spoken) return `${hours} h/wk`
  return `${hours} ${hours === 1 ? 'hour' : 'hours'} a week`
}

/** 420 -> { hours: '7', minutes: '0' }: the text for the Hours and Minutes boxes when editing. */
export function splitMinutes(minutes) {
  if (minutes === null || minutes === undefined) return { hours: '', minutes: '' }
  return { hours: String(Math.floor(minutes / 60)), minutes: String(minutes % 60) }
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

const weekdayDay = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })

/** "2026-10-12" -> "Mon, Oct 12": a day with its weekday. A date only, so read as UTC, like formatDay. */
export function formatWeekdayDay(iso) {
  if (!iso) return DASH
  return weekdayDay.format(new Date(`${iso.slice(0, 10)}T00:00:00Z`))
}

/**
 * Why a deliverable is late, from its due date and today (both ISO days, Eastern):
 * "was due Mon, Oct 12 · today is Thu, Oct 15 · 3 days late"; spoken (aria-labels), the same with commas.
 */
export function formatLateness(dueIso, today, { spoken = false } = {}) {
  const days = daysBetween(dueIso, today)
  const parts = [`was due ${formatWeekdayDay(dueIso)}`, `today is ${formatWeekdayDay(today)}`, `${days} ${days === 1 ? 'day' : 'days'} late`]
  return parts.join(spoken ? ', ' : ' · ')
}

/** A timestamp, shown in Eastern time: "Oct 13, 2026, 9:03 PM". */
export function formatDateTime(iso) {
  if (!iso) return DASH
  return dateTime.format(new Date(iso))
}

const dayInZone = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: ZONE })

/** A project's latest change (a timestamp) as its day in Eastern time: "Updated Oct 13, 2026". */
export function formatUpdated(iso) {
  return `Updated ${iso ? dayInZone.format(new Date(iso)) : DASH}`
}

/** 1 -> "1 live project", 3 -> "3 live projects". */
export function formatLiveProjects(count) {
  return `${count} live ${count === 1 ? 'project' : 'projects'}`
}

/**
 * One project a person is still on, as a line of the archive warning:
 * "Apollo · 20 hours a week until Dec 31, 2026 · 2 open tasks". A part that is 0 or
 * missing is left out; a booking that only starts later reads "booked until <date>".
 */
export function formatInvolvement({ name, hoursPerWeek, bookingEndDate, openTaskCount }) {
  const parts = [name]
  if (hoursPerWeek > 0) parts.push(`${formatPerWeek(hoursPerWeek, { spoken: true })}${bookingEndDate ? ` until ${formatDate(bookingEndDate)}` : ''}`)
  else if (bookingEndDate) parts.push(`booked until ${formatDate(bookingEndDate)}`)
  if (openTaskCount > 0) parts.push(`${openTaskCount} open ${openTaskCount === 1 ? 'task' : 'tasks'}`)
  return parts.join(' · ')
}
