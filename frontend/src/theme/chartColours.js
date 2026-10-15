import { useTheme } from '@mui/material/styles'

/*
 * Colours and mark sizes for the charts (spec 2026-10-14-dashboard-graphs-design.md), one set per
 * colour mode. Rule: status colours only mean state (green done, red late or over); project colours
 * only mean "which project"; the Today line is gold; everything else is blue or grey. Contrast
 * ratios are against the chart card each set sits on. Under 3:1 is relieved by the legend, tooltip
 * and the table on the page.
 */

/** Light mode: the chart card is white. */
const LIGHT = {
  /** The chart card: what every ratio is measured against, and the backing behind text a line crosses. */
  surface: '#FFFFFF',
  /** Dark ink: reference lines (Budget, Planned, Capacity). 14.7:1. */
  ink: '#1F2937',
  /** Gridlines, 1 px solid. 1.24:1: a quiet guide, never a data mark. */
  grid: '#E5E7EB',
  /** The Today line: the deep gold highlight. 5.5:1. */
  today: '#8A6100',
  /** Timeline states: the bar's fill and its unfilled track. Blocked means waiting, so it is grey, not red. */
  state: {
    DONE: { fill: '#2E7D32', track: '#B6D2B7' }, // fill 5.1:1; track 35% tint 1.63:1
    IN_PROGRESS: { fill: '#0B3D91', track: '#AABBD8' }, // fill 10.0:1; track 1.94:1
    NOT_STARTED: { fill: '#6B7280', track: '#CBCED3' }, // fill 4.8:1; track 1.58:1
    BLOCKED: { fill: '#6B7280', track: '#CBCED3' }, // same as not started
    LATE: { fill: '#C62828', track: '#EBB4B4' }, // fill 5.6:1; track 1.79:1
  },
  budget: {
    spent: '#0B3D91', // 10.0:1
    waiting: '#AABBD8', // 35% of spent, 1.94:1: a lighter step of the same hue
    track: '#EEEEEE', // 1.16:1
    over: '#C62828', // 5.6:1
  },
  /** Late and over-capacity marks. 5.6:1. */
  over: '#C62828',
  /** One colour per project, by slot (checked with the dataviz validator, 14 Oct). */
  project: [
    '#1c5cab', // blue 6.63:1
    '#199e70', // aqua 3.41:1
    '#9085e9', // violet 3.13:1
    '#e87ba4', // magenta 2.69:1, below 3:1: legend, tooltip and table relieve it
    '#eda100', // yellow 2.17:1, below 3:1: same relief
  ],
  /** The 6th project and later. 1.47:1, deliberately quiet. */
  other: '#D1D5DB',
  /** Darker red that stripes are drawn in (print and high-contrast only). 10.0:1. */
  stripe: '#7F1D1D',
}

/** Dark mode: the chart card is the theme's near-black panel. Its own steps, not a flip of light. */
const DARK = {
  surface: '#0B0E0B',
  ink: '#D7D7D7', // 13.5:1
  grid: '#2A2F2A', // 1.42:1
  today: '#FFD54A', // bright gold, 13.7:1
  state: {
    DONE: { fill: '#6FCB8E', track: '#2E5039' }, // fill 9.8:1; track 35% tint 2.15:1
    IN_PROGRESS: { fill: '#6DA7EC', track: '#2D445A' }, // fill 7.8:1; track 1.93:1
    NOT_STARTED: { fill: '#9AA59E', track: '#3D433E' }, // fill 7.6:1; track 1.91:1
    BLOCKED: { fill: '#9AA59E', track: '#3D433E' },
    LATE: { fill: '#F28B82', track: '#5C3A35' }, // fill 8.1:1; track 1.95:1
  },
  budget: {
    spent: '#6DA7EC', // 7.8:1
    waiting: '#2D445A', // 35% of spent, 1.93:1
    track: '#1C221C', // 1.20:1
    over: '#F28B82', // 8.1:1
  },
  over: '#F28B82',
  /** The validator's dark steps of the same five hues: every check passes on #0B0E0B, all at least 3:1 (15 Oct). */
  project: ['#3987e5', '#199e70', '#9085e9', '#d55181', '#c98500'],
  other: '#4A524B', // 2.40:1, deliberately quiet
  stripe: '#7F1D1D',
}

/** Both sets, by colour mode. */
export const CHART_COLOURS = { light: LIGHT, dark: DARK }

/** The chart colours for the current colour mode (light or dark). */
export function useChartColours() {
  return CHART_COLOURS[useTheme().palette.mode] ?? LIGHT
}

/** Mark sizes in pixels: bar thickness, corner rounding (none: sharp corners), gap between segments, reference line, one-day bar. */
export const MARK = { bar: 12, radius: 0, gap: 2, line: 2, minDay: 8 }

// Two light colours under their first names: only ProjectTimelines.test.jsx still reads them.
// Once it reads CHART_COLOURS.light, delete both. Code reads useChartColours(), which follows the mode.
export const PROJECT_COLOURS = LIGHT.project
export const OTHER_COLOUR = LIGHT.other

/**
 * Give each project a colour slot by id, lowest id first, so a project keeps its colour
 * whatever order the rows arrive in. The 6th and later share the set's Other.
 * @param {number[]} projectIds ids, in any order, repeats allowed
 * @param {object} [colours] the set to colour from (useChartColours()); light by default
 * @returns {Map<number, string>}
 */
export function projectColours(projectIds, colours = LIGHT) {
  const sorted = [...new Set(projectIds)].sort((a, b) => a - b)
  return new Map(sorted.map((id, i) => [id, colours.project[i] ?? colours.other]))
}
