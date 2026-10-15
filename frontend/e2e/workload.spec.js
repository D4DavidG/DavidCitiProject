/*
 * The dashboard's workload chart in a real browser: what jsdom can't measure or show.
 * - Layout at 1440 px and 375 px: the gridlines sit under their hour labels and span exactly
 *   the bars' column, Ben's capacity line and red segment start at 40 h, the right-hand words
 *   sit beside the bar on desktop and drop under it on phones, and the page never scrolls sideways.
 * - Keyboard: tabbing onto a row opens its tooltip (as hovering does).
 * - Never colour alone: the red "over" segment is striped only in print and in forced colours,
 *   and forced-color-adjust: none keeps the marks' own colours there.
 * - Contrast as drawn: the words against what is really behind them, the red and ink marks too.
 *
 * Read-only. Signs in as Maria (a seeded manager; every seeded password is the same). It expects
 * the seed's week: Ben Okafor booked 45 h of 40 (Apollo 25, Zeus 20), so the hour axis ends at 60.
 * E2E_MANAGER_USERNAME overrides her username; E2E_TOUR_DIR saves screenshots for review.
 */
import { expect, test } from '@playwright/test'

const PASSWORD = 'Demo-pass-2026'
const USERNAME = process.env.E2E_MANAGER_USERNAME ?? 'ML460428'
const DIR = process.env.E2E_TOUR_DIR
const STRIPES = /repeating-linear-gradient/
const AXIS_END = 60 // Ben's 45 h, rounded up to the next 20 h tick
const NEAR = 1.5 // CSS pixels: sub-pixel rounding, never a visible misalignment

async function openDashboard(page) {
  await page.goto('/')
  await page.getByLabel('Username').fill(USERNAME)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()
  await page.goto('/#/dashboard')
  const chart = page.getByRole('figure', { name: 'Workload this week · all projects' })
  await expect(chart).toBeVisible()
  return chart
}

/** Ben's row: the one person over capacity in the seed. */
const ben = (chart) => chart.getByRole('img', { name: /· Ben Okafor$/ })

/** Left and right edges (CSS px) of every gridline, and of the hour label each one belongs to. */
async function gridAndTicks(chart) {
  const lines = await chart.locator('li[aria-hidden="true"] > div').evaluateAll(
    (els) => els.map((el) => { const r = el.getBoundingClientRect(); return { centre: r.left + r.width / 2 } }),
  )
  const labels = await chart.getByTestId('hour-axis').locator('span').evaluateAll(
    (els) => els.map((el) => { const r = el.getBoundingClientRect(); return { text: el.textContent, left: r.left, width: r.width } }),
  )
  return { lines, labels }
}

for (const [name, size] of [['desktop', { width: 1440, height: 900 }], ['phone', { width: 375, height: 800 }]]) {
  test(`gridlines, labels and bars line up, and nothing scrolls sideways, ${name}`, async ({ page }) => {
    await page.setViewportSize(size)
    const chart = await openDashboard(page)
    const row = ben(chart)
    const track = (await row.getByTestId('capacity').locator('..').boundingBox())
    const capacity = await row.getByTestId('capacity').boundingBox()
    const over = await row.getByTestId('over').boundingBox()
    const x = (hours) => track.x + (track.width * hours) / AXIS_END

    // One gridline per label, 0 h to 60 h, each under its own label. A label is shifted left by
    // its own percent (0 h starts at the line, 60 h ends at it), so its anchor is that far in.
    const { lines, labels } = await gridAndTicks(chart)
    expect(labels.map((l) => l.text)).toEqual(['0 h', '20 h', '40 h', '60 h'])
    expect(lines).toHaveLength(labels.length)
    labels.forEach((label, i) => {
      const hours = i * 20
      expect(Math.abs(lines[i].centre - x(hours)), `${label.text} gridline`).toBeLessThan(NEAR)
      expect(Math.abs(label.left + (label.width * hours) / AXIS_END - x(hours)), `${label.text} label`).toBeLessThan(NEAR)
    })

    // Ben's capacity line is centred on 40 h, and his red segment starts there and runs 5 h.
    expect(Math.abs(capacity.x + capacity.width / 2 - x(40))).toBeLessThan(NEAR)
    expect(Math.abs(over.x - x(40))).toBeLessThan(NEAR)
    expect(Math.abs(over.x + over.width - x(45))).toBeLessThan(NEAR)

    // The right-hand words: beside the bar on desktop, under it on phones.
    const words = await row.getByText('45 / 40 h').boundingBox()
    if (name === 'desktop') {
      expect(words.x).toBeGreaterThanOrEqual(track.x + track.width)
      expect(words.y).toBeLessThan(track.y + track.height)
    } else {
      expect(words.y).toBeGreaterThanOrEqual(track.y + track.height)
      expect(words.x + words.width).toBeLessThanOrEqual(size.width)
    }

    const sideways = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(sideways).toBeLessThanOrEqual(0)
    if (DIR) await chart.screenshot({ path: `${DIR}/workload-${name}.png` })
  })
}

/**
 * The open tooltip that says exactly `sentence`. Found by its words, not as "the only tooltip":
 * tabbing passes the home timeline's rows first, and the last one's tooltip is still fading out
 * for a moment when Ben's opens.
 */
const tooltip = (page, sentence) => page.getByRole('tooltip', { name: sentence, exact: true })

test('tabbing onto a row opens its tooltip, as hovering does', async ({ page }) => {
  const chart = await openDashboard(page)
  const row = ben(chart)
  const sentence = '45 h booked, capacity 40 h, +5 h over · Apollo 25 h, Zeus 20 h · Ben Okafor'
  await expect(row).toHaveAttribute('aria-label', sentence)

  await row.hover()
  await expect(tooltip(page, sentence)).toBeVisible()
  await page.mouse.move(0, 0)
  await expect(page.getByRole('tooltip')).toHaveCount(0)

  // Real Tab presses from the top of the page until focus lands on Ben's row.
  await page.locator('body').click({ position: { x: 1, y: 1 } })
  let reached = false
  for (let i = 0; i < 60 && !reached; i += 1) {
    await page.keyboard.press('Tab')
    reached = await row.evaluate((el) => el === document.activeElement)
  }
  expect(reached, 'Tab reaches the row').toBe(true)
  await expect(tooltip(page, sentence)).toBeVisible()
  await expect(page.getByRole('tooltip')).toHaveCount(1) // the faded one has gone; only Ben's is left
  if (DIR) await page.screenshot({ path: `${DIR}/workload-focus.png` })
})

test('the over segment is striped only in print and forced colours, keeping its own red', async ({ page }) => {
  const chart = await openDashboard(page)
  const over = ben(chart).getByTestId('over')
  await expect(over).toHaveAttribute('data-state', 'over')
  const style = () => over.evaluate((el) => {
    const s = getComputedStyle(el)
    return { image: s.backgroundImage, colour: s.backgroundColor, adjust: s.forcedColorAdjust }
  })

  const screen = await style()
  expect(screen.image, 'on screen: colour, word and icon only').toBe('none')
  expect(screen.colour).toBe('rgb(198, 40, 40)') // OVER, #C62828
  expect(screen.adjust).toBe('none')

  await page.emulateMedia({ media: 'print' })
  expect((await style()).image).toMatch(STRIPES)

  await page.emulateMedia({ media: 'screen', forcedColors: 'active' })
  const forced = await style()
  expect(forced.image).toMatch(STRIPES)
  expect(forced.colour).toBe('rgb(198, 40, 40)')
  // Every other mark keeps its colour too: the project segments and the ink capacity line.
  const capacity = await ben(chart).getByTestId('capacity').evaluate((el) => getComputedStyle(el).backgroundColor)
  expect(capacity).toBe('rgb(31, 41, 55)') // INK, #1F2937
  const segments = await ben(chart).getByTestId('segment').evaluateAll((els) => els.map((el) => getComputedStyle(el).backgroundColor))
  expect(segments).toEqual(['rgb(28, 92, 171)', 'rgb(25, 158, 112)']) // Apollo #1c5cab, Zeus #199e70
})

test('words and the red and ink marks clear contrast against what is really behind them', async ({ page }) => {
  const chart = await openDashboard(page)
  const row = ben(chart)

  /** WCAG contrast of an element's colour against the first opaque background behind it. */
  const contrast = (locator, property) => locator.evaluate((el, prop) => {
    const rgb = (c) => c.match(/[\d.]+/g).map(Number)
    const lum = ([r, g, b]) => [r, g, b].map((v) => v / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
      .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0)
    let back = el.parentElement
    while (back && (rgb(getComputedStyle(back).backgroundColor)[3] ?? 1) === 0) back = back.parentElement
    const [a, b] = [lum(rgb(getComputedStyle(el)[prop])), lum(rgb(getComputedStyle(back).backgroundColor))]
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
  }, property)

  expect(await contrast(row.getByText('Ben Okafor'), 'color')).toBeGreaterThanOrEqual(4.5)
  expect(await contrast(row.getByText('+5 h over'), 'color')).toBeGreaterThanOrEqual(4.5)
  expect(await contrast(row.getByText('45 / 40 h'), 'color')).toBeGreaterThanOrEqual(4.5)
  // Every unbooked person's row says "Not booked" in the same colour; the live site has several, so check the first.
  expect(await contrast(chart.getByText('Not booked').first(), 'color')).toBeGreaterThanOrEqual(4.5)
  expect(await contrast(chart.getByTestId('hour-axis').getByText('40 h'), 'color')).toBeGreaterThanOrEqual(4.5)
  expect(await contrast(row.getByTestId('over'), 'backgroundColor')).toBeGreaterThanOrEqual(3)
  expect(await contrast(row.getByTestId('capacity'), 'backgroundColor')).toBeGreaterThanOrEqual(3)
})
