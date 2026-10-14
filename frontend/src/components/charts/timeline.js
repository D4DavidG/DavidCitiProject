/*
 * Date maths for the deliverables timeline (spec 2026-10-14-dashboard-graphs-design.md, section 5).
 * Positions are day counts on ISO dates, as percents of the axis. No money is touched here.
 */
import { addDays, daysBetween } from '../../services/format'

/**
 * A deliverable is late once its due day has passed and it is not signed off. ISO dates compare
 * as strings, so a deliverable due today is not late until tomorrow.
 * @param {{ status: string, dueDate: string }} deliverable
 * @param {string} today ISO date
 * @returns {boolean}
 */
export function isLate(deliverable, today) {
  return deliverable.status !== 'DONE' && deliverable.dueDate < today
}

/**
 * The date axis: from the earliest of the project start and every deliverable start, to the latest
 * of the project end and every due date, so a deliverable outside the project still fits.
 * @param {{ startDate: string, dueDate: string }[]} deliverables
 * @param {string} projectStart ISO date
 * @param {string} projectEnd ISO date
 * @returns {{ from: string, to: string, days: number }} days counts both ends
 */
export function timelineAxis(deliverables, projectStart, projectEnd) {
  const from = [projectStart, ...deliverables.map((d) => d.startDate)].sort()[0]
  const to = [projectEnd, ...deliverables.map((d) => d.dueDate)].sort().at(-1)
  return { from, to, days: daysBetween(from, to) + 1 }
}

/**
 * Where a date sits on the axis, as a percent from the left.
 * @param {{ from: string, days: number }} axis
 * @param {string} iso
 * @returns {number}
 */
export function offset(axis, iso) {
  return daysBetween(axis.from, iso) * 100 / axis.days
}

/**
 * A bar from start to due, in percent of the axis. The width counts the due day too.
 * @param {{ from: string, days: number }} axis
 * @param {string} start ISO date
 * @param {string} due ISO date
 * @returns {{ left: number, width: number }}
 */
export function span(axis, start, due) {
  return { left: offset(axis, start), width: (daysBetween(start, due) + 1) * 100 / axis.days }
}

/**
 * Every first-of-month from `from` to `to` (both included), thinned evenly to at most `max`,
 * keeping the first.
 * @param {string} from ISO date
 * @param {string} to ISO date
 * @param {number} max labels allowed (6 on desktop, 3 on phones)
 * @returns {string[]} ISO dates
 */
export function monthTicks(from, to, max) {
  const firsts = []
  let day = from.slice(8, 10) === '01' ? from.slice(0, 10) : `${addDays(`${from.slice(0, 7)}-28`, 4).slice(0, 7)}-01`
  while (day <= to) {
    firsts.push(day)
    day = `${addDays(`${day.slice(0, 7)}-28`, 4).slice(0, 7)}-01`
  }
  const step = Math.ceil(firsts.length / max)
  return firsts.filter((_, i) => i % step === 0)
}
