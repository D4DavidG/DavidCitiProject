/*
 * The dashboard's budget chart in a real browser: what jsdom can't measure. The Budget line
 * must sit exactly at 100 of the 125% scale of the bars' own column (desktop and phone), the
 * page must not scroll sideways at 375 px, and the row tooltip opens on hover and on keyboard
 * focus. Read-only. Signs in as Maria (a seeded manager; every seeded password is the same).
 * E2E_MANAGER_USERNAME overrides her username; E2E_TOUR_DIR saves screenshots for review.
 */
import { expect, test } from '@playwright/test'

const PASSWORD = 'Demo-pass-2026'
const USERNAME = process.env.E2E_MANAGER_USERNAME ?? 'ML460428'
const DIR = process.env.E2E_TOUR_DIR

async function openDashboard(page) {
  await page.goto('/')
  await page.getByLabel('Username').fill(USERNAME)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()
  await page.goto('/#/dashboard')
  const chart = page.getByRole('figure', { name: 'Budget by project' })
  await expect(chart).toBeVisible()
  return chart
}

/** Horizontal geometry of the first bar track and the Budget line, in CSS pixels. */
async function geometry(chart) {
  const track = chart.getByTestId('spent').first().locator('..')
  const t = await track.boundingBox()
  const l = await chart.getByTestId('budget-line').boundingBox()
  return { trackLeft: t.x, trackWidth: t.width, lineLeft: l.x }
}

for (const [name, size] of [['desktop', { width: 1440, height: 900 }], ['phone', { width: 375, height: 800 }]]) {
  test(`the Budget line sits at 100 of 125 of the bar column, ${name}`, async ({ page }) => {
    await page.setViewportSize(size)
    const chart = await openDashboard(page)
    const g = await geometry(chart)
    expect(Math.abs(g.lineLeft - (g.trackLeft + g.trackWidth * 0.8))).toBeLessThan(1.5)
    const sideways = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(sideways).toBeLessThanOrEqual(0)
    if (DIR) await chart.screenshot({ path: `${DIR}/budget-${name}.png` })
  })
}

test('a row opens its tooltip on hover and on keyboard focus', async ({ page }) => {
  const chart = await openDashboard(page)
  const row = chart.getByRole('img').first()
  const sentence = await row.getAttribute('aria-label')
  await row.hover()
  await expect(page.getByRole('tooltip')).toHaveText(sentence)
  await page.mouse.move(0, 0)
  await expect(page.getByRole('tooltip')).toHaveCount(0)
  await page.keyboard.press('Tab')
  await row.focus()
  await expect(page.getByRole('tooltip')).toHaveText(sentence)
})
