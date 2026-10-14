/*
 * The demo, end to end: a manager signs in and walks the seven questions on the
 * seeded data (tools/demo.py seed). Needs E2E_ADMIN_PASSWORD, used only to look up
 * the seeded manager's generated username through the API.
 */
import { expect, test } from '@playwright/test'

const API = process.env.E2E_API ?? 'http://localhost:3001/api/tracker'
const DEMO_PASSWORD = 'Demo-pass-2026' // every seeded account's password (tools/demo.py)

let maria

test.beforeAll(async ({ request }) => {
  if (process.env.E2E_MANAGER_USERNAME) { // e.g. against AWS, where the demo printed the usernames
    maria = process.env.E2E_MANAGER_USERNAME
    return
  }
  const adminPassword = process.env.E2E_ADMIN_PASSWORD
  test.skip(!adminPassword, 'Set E2E_ADMIN_PASSWORD (or E2E_MANAGER_USERNAME) for the environment under test.')
  const login = await request.post(`${API}/auth/login`, { data: { username: 'AD000001', password: adminPassword } })
  expect(login.ok(), 'admin login').toBeTruthy()
  const { token } = await login.json()
  const users = await request.get(`${API}/users?search=maria.lopez`, { headers: { Authorization: `Bearer ${token}` } })
  const found = (await users.json()).items.find((u) => u.email === 'maria.lopez@acme.test')
  expect(found, 'seeded manager Maria Lopez (run tools/demo.py seed)').toBeTruthy()
  maria = found.username
})

async function signIn(page) {
  await page.goto('/')
  await page.getByLabel('Username').fill(maria)
  await page.getByLabel('Password').fill(DEMO_PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
}

test('a manager walks the seven questions', async ({ page }) => {
  await signIn(page)

  // Questions 1, 2 and 7: the dashboard card for Apollo, at risk, with its budget.
  const apollo = page.getByRole('article', { name: 'Apollo' })
  await expect(apollo.getByText('At risk')).toBeVisible()
  await expect(apollo.getByText(/spent of \$150,000/)).toBeVisible()

  // Questions 3 and 5: Ben is over-allocated, and the grid says why.
  await page.getByRole('navigation', { name: 'Main menu' }).getByRole('link', { name: 'Allocation' }).click()
  const ben = page.getByRole('row', { name: /Ben Okafor/ })
  await expect(ben.getByText('Over-allocated')).toBeVisible()
  await expect(ben.getByLabel(/Apollo 25 h, Zeus 20 h/).first()).toBeVisible()

  // Question 4: Apollo's deliverables.
  await page.getByRole('navigation', { name: 'Main menu' }).getByRole('link', { name: 'Projects' }).click()
  await page.getByRole('link', { name: 'Apollo' }).click()
  await expect(page.getByRole('heading', { name: 'Apollo', level: 1 })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Build' })).toBeVisible()

  // Question 6: Launch is blocked until Build is done.
  await page.getByRole('link', { name: 'Dependency view' }).click()
  const launch = page.getByRole('article', { name: 'Launch' })
  await expect(launch.getByText('Blocked')).toBeVisible()
  await expect(launch.getByText(/Waiting for Build/)).toBeVisible()
})

test.describe('on a phone', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  test('the dashboard fits the screen and the menu opens from a button', async ({ page }) => {
    await signIn(page)
    await expect(page.getByRole('article', { name: 'Apollo' })).toBeVisible()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow, 'no sideways scrolling on the page').toBeLessThanOrEqual(1)
    await page.getByRole('button', { name: 'Open menu' }).click()
    await expect(page.getByRole('navigation', { name: 'Main menu' }).getByRole('link', { name: 'Allocation' })).toBeVisible()
  })
})
