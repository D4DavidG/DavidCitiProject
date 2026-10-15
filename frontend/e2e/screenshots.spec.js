/*
 * Screenshots of the demo screens for the README (docs/screenshots/). Not a test of
 * behaviour; it only runs when asked:
 *   E2E_SCREENSHOTS=1 E2E_ADMIN_PASSWORD=... npx playwright test screenshots
 */
import { expect, test } from '@playwright/test'

const API = process.env.E2E_API ?? 'http://localhost:3001/api/tracker'
const OUT = '../docs/screenshots'

test.skip(!process.env.E2E_SCREENSHOTS, 'Set E2E_SCREENSHOTS=1 to refresh the README screenshots.')

test('README screenshots', async ({ page, request }) => {
  const login = await request.post(`${API}/auth/login`, { data: { username: 'AD000001', password: process.env.E2E_ADMIN_PASSWORD } })
  const { token } = await login.json()
  const users = await request.get(`${API}/users?search=maria.lopez`, { headers: { Authorization: `Bearer ${token}` } })
  const maria = (await users.json()).items[0].username

  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  await page.getByLabel('Username').fill(maria)
  await page.getByLabel('Password', { exact: true }).fill('Demo-pass-2026')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('article', { name: 'Apollo' })).toBeVisible()
  await page.screenshot({ path: `${OUT}/dashboard.png` })

  await page.getByRole('navigation', { name: 'Main menu' }).getByRole('link', { name: 'Allocation' }).click()
  await expect(page.getByRole('row', { name: /Ben Okafor/ })).toBeVisible()
  await page.getByRole('row', { name: /Ben Okafor/ }).getByText('45 / 40 h').first().hover()
  await expect(page.getByRole('tooltip')).toBeVisible()
  await page.screenshot({ path: `${OUT}/allocation.png` })

  await page.getByRole('navigation', { name: 'Main menu' }).getByRole('link', { name: 'Projects' }).click()
  await page.getByRole('link', { name: 'Apollo' }).click()
  await page.getByRole('region', { name: 'Build' }).getByRole('button', { name: 'Show tasks' }).click()
  await expect(page.getByText('Portal UI')).toBeVisible()
  await page.screenshot({ path: `${OUT}/project.png`, fullPage: true })

  await page.getByRole('link', { name: 'Dependency view' }).click()
  await expect(page.getByRole('article', { name: 'Launch' })).toBeVisible()
  await page.screenshot({ path: `${OUT}/dependencies.png` })

  await page.setViewportSize({ width: 375, height: 812 })
  await page.getByRole('button', { name: 'Open menu' }).click()
  await page.getByRole('navigation', { name: 'Main menu' }).getByRole('link', { name: 'Dashboard' }).click()
  await expect(page.getByRole('article', { name: 'Apollo' })).toBeVisible()
  await page.screenshot({ path: `${OUT}/phone-dashboard.png` })
})
