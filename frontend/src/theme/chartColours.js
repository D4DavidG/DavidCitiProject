/*
 * Colours and mark sizes for the three dashboard charts (spec 2026-10-14-dashboard-graphs-design.md).
 * Rule: status colours only mean state (green done, red late or over); project colours only mean
 * "which project"; everything else is navy or grey. Contrast ratios are against white (#FFFFFF),
 * the chart card's background. Under 3:1 is relieved by the legend, tooltip and the table on the page.
 */

/** Dark ink: reference lines (Today, Budget, Planned, Capacity). 14.7:1. */
export const INK = '#1F2937'

/** Gridlines, 1 px solid. 1.24:1: a quiet guide, never a data mark. */
export const GRID = '#E5E7EB'

/** Mark sizes in pixels: bar thickness, rounding at the data end, white gap between segments, reference line, one-day bar. */
export const MARK = { bar: 12, radius: 4, gap: 2, line: 2, minDay: 8 }

/** Timeline state colours: the bar's fill and its unfilled track. Blocked means waiting, so it is grey, not red. */
export const STATE_COLOURS = {
  DONE: { fill: '#2E7D32', track: '#B6D2B7' }, // fill 5.1:1; track 35% tint 1.63:1
  IN_PROGRESS: { fill: '#0B3D91', track: '#AABBD8' }, // fill 10.0:1; track 1.94:1
  NOT_STARTED: { fill: '#6B7280', track: '#CBCED3' }, // fill 4.8:1; track 1.58:1
  BLOCKED: { fill: '#6B7280', track: '#CBCED3' }, // same as not started
  LATE: { fill: '#C62828', track: '#EBB4B4' }, // fill 5.6:1; track 1.79:1
}

/** Budget chart colours. */
export const BUDGET_COLOURS = {
  spent: '#0B3D91', // 10.0:1
  waiting: '#AABBD8', // 35% navy, 1.94:1: a lighter step of the same hue
  track: '#EEEEEE', // 1.16:1, as BudgetBar.jsx
  over: '#C62828', // 5.6:1
}

/** Error red: late and over-capacity marks and words. 5.6:1. */
export const OVER = '#C62828'

/** Workload chart: one colour per project, by slot (checked with the data-viz validator, 14 Oct). */
export const PROJECT_COLOURS = [
  '#1c5cab', // blue 6.63:1
  '#199e70', // aqua 3.41:1
  '#9085e9', // violet 3.13:1
  '#e87ba4', // magenta 2.69:1, below 3:1: legend, tooltip and table relieve it
  '#eda100', // yellow 2.17:1, below 3:1: same relief
]

/** The 6th project and later. 1.47:1, deliberately quiet. */
export const OTHER_COLOUR = '#D1D5DB'

/** Darker step of the error red that stripes are drawn in (print and high-contrast only). 10.0:1. */
export const STRIPE = '#7F1D1D'

/**
 * Give each project a colour slot by id, lowest id first, so a project keeps its colour
 * whatever order the rows arrive in. The 6th and later share OTHER_COLOUR.
 * @param {number[]} projectIds ids, in any order, repeats allowed
 * @returns {Map<number, string>}
 */
export function projectColours(projectIds) {
  const sorted = [...new Set(projectIds)].sort((a, b) => a - b)
  return new Map(sorted.map((id, i) => [id, PROJECT_COLOURS[i] ?? OTHER_COLOUR]))
}
