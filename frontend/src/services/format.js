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

/** 90 -> "1 h 30 min", 120 -> "2 h", 45 -> "45 min" (the server's wording). */
export function formatHours(minutes) {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  const parts = [hours ? `${hours} h` : '', rest ? `${rest} min` : ''].filter(Boolean)
  return parts.join(' ') || '0 min'
}

/** "2026-10-14" -> "Oct 14, 2026". A date has no time zone, so it is read as UTC to keep the day. */
export function formatDate(iso) {
  if (!iso) return DASH
  return dateOnly.format(new Date(`${iso.slice(0, 10)}T00:00:00Z`))
}

/** A timestamp, shown in Eastern time: "Oct 13, 2026, 9:03 PM". */
export function formatDateTime(iso) {
  if (!iso) return DASH
  return dateTime.format(new Date(iso))
}
