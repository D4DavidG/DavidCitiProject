/*
 * The Schedule screen in a real browser: what jsdom can't measure.
 * - Desktop (1440 px) and phone (390 px): Ben Okafor's row has an Apollo bar and a "+N h over"
 *   week with its red outline, and the page itself never scrolls sideways. On the phone the weeks
 *   scroll inside the card instead, and Ben's name stays on screen while they do.
 * - Keyboard: tabbing onto a bar opens its tooltip, and Enter opens the project.
 *
 * Read-only. Signs in as Maria (a seeded manager; every seeded password is the same). It expects
 * the seed: Ben booked on Apollo (25 h) and Zeus (20 h) this week, 5 h past his 40 h.
 * E2E_MANAGER_USERNAME overrides her username; E2E_TOUR_DIR saves screenshots for review.
 */
import { expect, test } from '@playwright/test'

const PASSWORD = 'Demo-pass-2026'
const USERNAME = process.env.E2E_MANAGER_USERNAME ?? 'ML460428'
const DIR = process.env.E2E_TOUR_DIR

async function openSchedule(page) {
  await page.goto('/')
  await page.getByLabel('Username').fill(USERNAME)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()
  await page.goto('/#/schedule')
  const chart = page.getByRole('figure', { name: 'Bookings, week by week' })
  await expect(chart).toBeVisible()
  return chart
}

const apolloBar = (chart) => chart.getByRole('link', { name: /^Ben Okafor, Apollo, 25 hours a week, / }).first()

for (const [name, size] of [['desktop', { width: 1440, height: 900 }], ['phone', { width: 390, height: 844 }]]) {
  test(`Ben has an Apollo bar and an over week, and the page never scrolls sideways, ${name}`, async ({ page }) => {
    await page.setViewportSize(size)
    const chart = await openSchedule(page)
    const ben = chart.locator('li').filter({ hasText: 'Ben Okafor' })

    await expect(apolloBar(chart)).toBeVisible()
    await expect(apolloBar(chart)).toContainText('Apollo · 25 h/wk')
    await expect(ben.getByText(/^\+\d+ h over$/).first()).toBeVisible()
    expect(await ben.locator('[data-state="over"]').count()).toBeGreaterThan(0)
    const outline = await ben.locator('[data-state="over"]').first().evaluate((el) => getComputedStyle(el).borderTopColor)
    expect(outline).toBe('rgb(198, 40, 40)') // OVER, #C62828

    const sideways = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(sideways, 'the page itself never scrolls sideways').toBeLessThanOrEqual(0)

    if (name === 'phone') {
      // The weeks scroll inside the card; the name column stays put while they do.
      const box = chart.getByRole('list').filter({ hasText: 'Ben Okafor' }).locator('..')
      const scroll = await box.evaluate((el) => ({ width: el.scrollWidth, shown: el.clientWidth }))
      expect(scroll.width, 'the weeks are wider than the phone').toBeGreaterThan(scroll.shown)
      await box.evaluate((el) => { el.scrollLeft = el.scrollWidth })
      const nameBox = await ben.getByText('Ben Okafor', { exact: true }).boundingBox()
      expect(nameBox.x).toBeGreaterThanOrEqual(0)
      expect(nameBox.x + nameBox.width).toBeLessThanOrEqual(size.width)
      await box.evaluate((el) => { el.scrollLeft = 0 })
    }
    if (DIR) await page.screenshot({ path: `${DIR}/schedule-${name}.png`, fullPage: true })
  })
}

test('on a phone, a first-week bar brought into view by focus is not hidden under the names', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const chart = await openSchedule(page)
  const ben = chart.locator('li').filter({ hasText: 'Ben Okafor' })
  const box = chart.getByRole('list').filter({ hasText: 'Ben Okafor' }).locator('..')
  await box.evaluate((el) => { el.scrollLeft = el.scrollWidth })
  // Zeus runs only in the first weeks, so after scrolling right it is wholly out of view (Apollo
  // spans every week and stays partly in view, so focusing it would not scroll at all).
  const bar = chart.getByRole('link', { name: /^Ben Okafor, Zeus, / }).first()
  await expect(bar).not.toBeInViewport()
  await bar.focus() // the browser scrolls the box to bring the bar into view
  const names = await ben.getByText('Ben Okafor', { exact: true }).locator('..').boundingBox()
  const shown = await bar.boundingBox()
  expect(shown.x, 'the bar starts right of the sticky name column').toBeGreaterThanOrEqual(names.x + names.width - 1)
})

test('tabbing onto a bar opens its tooltip, and Enter opens the project', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const chart = await openSchedule(page)
  const bar = apolloBar(chart)

  await page.locator('body').click({ position: { x: 1, y: 1 } })
  let reached = false
  for (let i = 0; i < 80 && !reached; i += 1) {
    await page.keyboard.press('Tab')
    reached = await bar.evaluate((el) => el === document.activeElement)
  }
  expect(reached, 'Tab reaches the bar').toBe(true)
  await expect(page.getByRole('tooltip')).toHaveText(/^Apollo · 25 h\/wk · \w{3} \d+ – \w{3} \d+$/)

  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/#\/projects\/\d+$/)
  await expect(page.getByRole('heading', { name: 'Apollo' })).toBeVisible()
})
