/*
 * The Schedule screen's small rules (bars and colour slots), kept apart from the drawing so they can be tested alone.
 * Both work only on what GET /dashboard/allocation already sent: per person, per week, the
 * hours each project has.
 */
import { CHART_COLOURS } from '../../theme/chartColours'

/**
 * Turn one person's weeks into bars: one bar per project per run of consecutive weeks with the
 * same hours. A change of hours, or a week without that project, starts a new bar.
 * @param {object[]} weeks the person's weeks, in date order, each with projects: [{ projectId, name, hours }]
 * @returns {object[]} bars: { projectId, name, hours, first, last } (first and last are week indexes)
 */
export function scheduleBars(weeks) {
  const bars = []
  let running = new Map() // projectId -> the bar that reached last week
  weeks.forEach((week, index) => {
    const next = new Map()
    week.projects.forEach(({ projectId, name, hours }) => {
      const bar = running.get(projectId)
      if (bar && bar.hours === hours) {
        bar.last = index
        next.set(projectId, bar)
      } else {
        const started = { projectId, name, hours, first: index, last: index }
        bars.push(started)
        next.set(projectId, started)
      }
    })
    running = next
  })
  return bars
}

/**
 * Give each project a colour slot once and keep it: projects not seen before take the next
 * slot, lowest id first. A slot already given never changes, so paging, filtering or moving
 * the weeks never repaints a project.
 * @param {Map<number, number>} known the slots given so far
 * @param {number[]} projectIds the projects on screen now
 * @returns {Map<number, number>} `known` itself when nothing is new, otherwise a new map
 */
export function keepSlots(known, projectIds) {
  const fresh = [...new Set(projectIds)].filter((id) => !known.has(id)).sort((a, b) => a - b)
  if (fresh.length === 0) return known
  const slots = new Map(known)
  fresh.forEach((id) => slots.set(id, slots.size))
  return slots
}

/**
 * The light-mode form of keepSlots, kept for ProjectTimelines: a Map of id to light colour.
 * keepSlots with slotColours follows dark mode too.
 * @param {Map<number, string>} known the colours given so far
 * @param {number[]} projectIds the projects on screen now
 * @returns {Map<number, string>} `known` itself when nothing is new, otherwise a new map
 */
export function keepColours(known, projectIds) {
  const fresh = [...new Set(projectIds)].filter((id) => !known.has(id)).sort((a, b) => a - b)
  if (fresh.length === 0) return known
  const colours = new Map(known)
  fresh.forEach((id) => colours.set(id, CHART_COLOURS.light.project[colours.size] ?? CHART_COLOURS.light.other))
  return colours
}

/**
 * Each slot's colour in the given set (light or dark); slots past the last colour share the grey Other.
 * @param {Map<number, number>} slots from keepSlots
 * @param {object} colours the chart colours for the mode (useChartColours())
 * @returns {Map<number, string>}
 */
export function slotColours(slots, colours) {
  return new Map([...slots].map(([id, slot]) => [id, colours.project[slot] ?? colours.other]))
}
