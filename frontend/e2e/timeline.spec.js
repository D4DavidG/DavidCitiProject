/*
 * The deliverables timeline in a real browser: what jsdom can't show. The row's tooltip
 * opens on mouse hover and on a finger tap, and a late bar gets its stripes only in print
 * and in Windows high-contrast (forced colours) mode, never on screen by default.
 *
 * Read-only, so it is safe against the deployed demo. It signs in as Sam, who manages Zeus,
 * because Zeus's "Migration" is the seed's one late deliverable (Apollo has none).
 *
 * Needs E2E_ZEUS_MANAGER_USERNAME (Sam's username, from `tools/demo.py demo`), or
 * E2E_ADMIN_PASSWORD to look it up. E2E_TOUR_DIR, if set, also saves a screenshot of the
 * chart at desktop and phone width for review.
 */
import { expect, test } from '@playwright/test'

const API = process.env.E2E_API ?? 'http://localhost:3001/api/tracker'
const PASSWORD = 'Demo-pass-2026' // every seeded account's password (tools/demo.py)
const DIR = process.env.E2E_TOUR_DIR
const STRIPES = /repeating-linear-gradient/

let sam

test.beforeAll(async ({ request }) => {
  sam = process.env.E2E_ZEUS_MANAGER_USERNAME
  if (sam) return
  const adminPassword = process.env.E2E_ADMIN_PASSWORD
  test.skip(!adminPassword, 'Set E2E_ZEUS_MANAGER_USERNAME (or E2E_ADMIN_PASSWORD) for the environment under test.')
  const login = await request.post(`${API}/auth/login`, { data: { username: 'AD000001', password: adminPassword } })
  const { token } = await login.json()
  const res = await request.get(`${API}/users?search=sam.patel`, { headers: { Authorization: `Bearer ${token}` } })
  const found = (await res.json()).items.find((u) => u.email === 'sam.patel@acme.test')
  expect(found, 'seeded user sam.patel@acme.test (run tools/demo.py seed)').toBeTruthy()
  sam = found.username
})

/** Signs in as Sam and opens Zeus; the Deliverables tab is the first tab, so the chart is there. */
async function openZeus(page) {
  await page.goto('/')
  await page.getByLabel('Username').fill(sam)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()
  await page.goto('/#/projects')
  await page.getByRole('link', { name: 'Zeus' }).first().click()
  const chart = page.getByRole('figure', { name: 'Deliverables timeline' })
  await expect(chart).toBeVisible()
  return chart
}

/** The Migration row: the late one. */
const migration = (chart) => chart.getByRole('img', { name: / · Migration · .* · Late/ })

/** The computed background-image of the late bar and of its fill. */
const backgrounds = (row) => Promise.all(['bar', 'fill'].map((id) => row.getByTestId(id)
  .evaluate((el) => getComputedStyle(el).backgroundImage)))

/**
 * A finger tap that stays down for `ms`, like a person's (about 100 ms). Playwright's own
 * tap() lifts the finger in the same instant, before MUI's zero-delay touch timer can fire,
 * so MUI cancels it (Tooltip.js handleTouchEnd -> stopTouchInteraction). No finger does that.
 */
async function fingerTap(page, locator, ms = 120) {
  const box = await locator.boundingBox()
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] })
  await page.waitForTimeout(ms)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
}

test('a late row says Late with the icon, and its tooltip opens on hover', async ({ page }) => {
  const chart = await openZeus(page)
  const row = migration(chart)
  await expect(row).toContainText('Late, 0%')
  await expect(row.getByTestId('WarningAmberRoundedIcon')).toBeVisible()
  await expect(row.getByText('Late, 0%')).toHaveCSS('color', 'rgb(198, 40, 40)') // error.main, #C62828
  await expect(page.getByRole('tooltip')).toHaveCount(0)
  await row.hover()
  await expect(page.getByRole('tooltip')).toHaveText(/^0% done · Migration · Aug \d+ – Oct \d+, 2026 · Late$/)
  if (DIR) await page.screenshot({ path: `${DIR}/timeline-desktop-zeus.png`, fullPage: true })
})

test.describe('on a phone', () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true })

  test('a tap opens the tooltip, and nothing scrolls sideways', async ({ page }) => {
    const chart = await openZeus(page)
    await fingerTap(page, migration(chart))
    await expect(page.getByRole('tooltip')).toHaveText(/ · Migration · .* · Late$/)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow).toBeLessThanOrEqual(1)
    if (DIR) await page.screenshot({ path: `${DIR}/timeline-phone-zeus.png`, fullPage: true })
  })
})

test('the late bar and fill are striped only in print and forced colours', async ({ page }) => {
  const row = migration(await openZeus(page))
  expect(await backgrounds(row), 'on screen: colour, word and icon only').toEqual(['none', 'none'])

  await page.emulateMedia({ media: 'print' })
  const printed = await backgrounds(row)
  expect(printed[0]).toMatch(STRIPES)
  expect(printed[1]).toMatch(STRIPES)

  await page.emulateMedia({ media: 'screen', forcedColors: 'active' })
  const forced = await backgrounds(row)
  expect(forced[0]).toMatch(STRIPES)
  expect(forced[1]).toMatch(STRIPES)
  // forced-color-adjust: none keeps the bar's own red track instead of a system colour.
  expect(await row.getByTestId('bar').evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(235, 180, 180)')
})

test("Apollo's timeline reads Design Done, Build In progress 0%, Launch Blocked, as the runbook says", async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Username').fill(process.env.E2E_MANAGER_USERNAME ?? 'ML460428') // Maria manages Apollo
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()
  await page.goto('/#/projects')
  await page.getByRole('link', { name: 'Apollo' }).first().click()
  const chart = page.getByRole('figure', { name: 'Deliverables timeline' })
  await expect(chart).toBeVisible()
  await expect(chart.getByRole('img', { name: / · Design · / })).toContainText('Done')
  await expect(chart.getByRole('img', { name: / · Build · / })).toContainText('In progress 0%')
  await expect(chart.getByRole('img', { name: / · Launch · / })).toContainText('Blocked')
})
