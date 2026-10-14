/*
 * The Schedule screen's two small rules, kept apart from the drawing so they can be tested alone.
 * Both work only on what GET /dashboard/allocation already sent: per person, per week, the
 * hours each project has.
 */
import { OTHER_COLOUR, PROJECT_COLOURS } from '../../theme/chartColours'

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
 * Give each project a colour once and keep it: projects not seen before take the next free
 * colour, lowest id first, and the grey Other once the colours run out. A colour already given
 * never changes, so paging, filtering or moving the weeks never repaints a project.
 * @param {Map<number, string>} known the colours given so far
 * @param {number[]} projectIds the projects on screen now
 * @returns {Map<number, string>} `known` itself when nothing is new, otherwise a new map
 */
export function keepColours(known, projectIds) {
  const fresh = [...new Set(projectIds)].filter((id) => !known.has(id)).sort((a, b) => a - b)
  if (fresh.length === 0) return known
  const colours = new Map(known)
  fresh.forEach((id) => colours.set(id, PROJECT_COLOURS[colours.size] ?? OTHER_COLOUR))
  return colours
}
