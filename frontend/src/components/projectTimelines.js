/*
 * Week maths for the home pages' project timelines (spec 2026-10-14-redesign-design.md, section 3).
 * Dates are ISO days in Eastern time (todayIso); positions are day counts as percents of the
 * window, through the deliverables timeline's offset and span. No money is touched here.
 */
import { addDays } from '../services/format'
import { isLate, offset, span } from './charts/timeline'

/** Weeks across the timeline, and how far Earlier and Later move it. */
export const WINDOW_WEEKS = 12
export const MOVE_WEEKS = 4

const WORDS = { DONE: 'Done', IN_PROGRESS: 'In progress', NOT_STARTED: 'Not started', BLOCKED: 'Blocked', LATE: 'Late' }

/**
 * The Monday of the week a day falls in. Weeks run Monday to Sunday, as on the Schedule.
 * @param {string} iso
 * @returns {string} ISO date
 */
export function mondayOf(iso) {
  const weekday = new Date(`${iso.slice(0, 10)}T00:00:00Z`).getUTCDay() // 0 is Sunday
  return addDays(iso, -((weekday + 6) % 7))
}

/**
 * The 12 weeks on screen: from the Monday two weeks before this week, moved 4 weeks per step.
 * @param {string} today ISO date
 * @param {number} moves steps from the start: -1 is Earlier once, 1 is Later once
 * @returns {{ weeks: string[], from: string, to: string, days: number }} weeks are Mondays; to is the last Sunday
 */
export function timelineWindow(today, moves = 0) {
  const from = addDays(mondayOf(today), -14 + moves * MOVE_WEEKS * 7)
  const weeks = Array.from({ length: WINDOW_WEEKS }, (_, i) => addDays(from, i * 7))
  return { weeks, from, to: addDays(from, WINDOW_WEEKS * 7 - 1), days: WINDOW_WEEKS * 7 }
}

/**
 * Where a span from start to end (both days included) sits in the window, cut at its edges.
 * @param {{ from: string, to: string, days: number }} axis
 * @param {string} start ISO date
 * @param {string} end ISO date
 * @returns {{ left: number, width: number, before: boolean, after: boolean } | null} percents;
 *   before/after say the span runs on past that edge; null when it misses the window
 */
export function placeSpan(axis, start, end) {
  if (end < axis.from || start > axis.to) return null
  const before = start < axis.from
  const after = end > axis.to
  return { ...span(axis, before ? axis.from : start, after ? axis.to : end), before, after }
}

/**
 * The middle of a day, as a percent of the window, or null when the day is not in it.
 * @param {{ from: string, to: string, days: number }} axis
 * @param {string} iso
 * @returns {number | null}
 */
export function dayCentre(axis, iso) {
  if (iso < axis.from || iso > axis.to) return null
  return offset(axis, iso) + 50 / axis.days
}

/**
 * A deliverable's state for its marker: Late (past due, not signed off) wins over its status.
 * @param {{ status: string, dueDate: string }} deliverable
 * @param {string} today ISO date
 * @returns {{ key: string, word: string }}
 */
export function deliverableState(deliverable, today) {
  const key = isLate(deliverable, today) ? 'LATE' : deliverable.status
  return { key, word: WORDS[key] ?? deliverable.status }
}
