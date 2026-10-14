/*
 * A read-only tour of every screen a manager and an employee can reach, at desktop and
 * phone width: checks each page renders with no sideways scrolling, saves a screenshot
 * of each for review, and checks that refreshing a deep link works. Changes no data, so
 * it is safe against the deployed demo. Runs only when asked:
 *
 *   E2E_TOUR_DIR=/some/folder E2E_MANAGER_USERNAME=ML662930 E2E_EMPLOYEE_USERNAME=AR553882 \
 *   E2E_BASE_URL=https://<cloudfront> npx playwright test tour
 */
import { expect, test } from '@playwright/test'

const DIR = process.env.E2E_TOUR_DIR
const PASSWORD = 'Demo-pass-2026' // the seeded demo accounts (tools/demo.py)
const VIEWPORTS = { desktop: { width: 1440, height: 900 }, phone: { width: 375, height: 812 } }
const ROLES = {
  manager: {
    username: process.env.E2E_MANAGER_USERNAME,
    screens: ['/dashboard', '/allocation', '/projects', 'PROJECT', 'PROJECT:Board', 'PROJECT:Resources', 'PROJECT:Budget',
      'PROJECT/dependencies', '/approvals', '/people', '/requests', '/notifications', '/account'],
  },
  employee: {
    username: process.env.E2E_EMPLOYEE_USERNAME,
    screens: ['/my-tasks', '/projects', 'PROJECT', 'PROJECT:Board', 'PROJECT/dependencies', '/notifications', '/account'],
  },
}

test.skip(!DIR, 'Set E2E_TOUR_DIR (and the usernames) to run the screen tour.')

async function signIn(page, username) {
  await page.goto('/')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  // Not "a heading": the login page has one too. Signed in means the app bar is there.
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()
}

async function projectId(page) {
  await page.goto('/#/projects')
  await page.getByRole('link', { name: 'Apollo' }).first().click()
  await expect(page.getByRole('heading', { name: 'Apollo', level: 1 })).toBeVisible()
  return page.url().split('/projects/')[1]
}

for (const [role, { username, screens }] of Object.entries(ROLES)) {
  for (const [viewport, size] of Object.entries(VIEWPORTS)) {
    test(`${role} at ${viewport} width: every screen renders without sideways scrolling`, async ({ page }) => {
      test.skip(!username, `Set E2E_${role.toUpperCase()}_USERNAME`)
      await page.setViewportSize(size)
      await signIn(page, username)
      const id = await projectId(page)
      const overflowing = []
      for (const screen of screens) {
        const [route, tab] = screen.replace('PROJECT', `/projects/${id}`).split(':')
        await page.goto(`/#${route}`)
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
        await expect(page.getByRole('progressbar', { name: /loading/i })).toHaveCount(0)
        if (tab) {
          await page.getByRole('tab', { name: tab }).click()
          // A tab loads its own data: wait for that spinner too, or the shot and the overflow check see "Loading".
          await expect(page.getByRole('progressbar', { name: /loading/i })).toHaveCount(0)
        }
        await page.waitForLoadState('networkidle')
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
        if (overflow > 1) overflowing.push(`${screen} (${overflow}px)`)
        const name = screen.replace(/^\//, '').replace(/[/:]/g, '-').toLowerCase() || 'home'
        await page.screenshot({ path: `${DIR}/${role}-${viewport}-${name}.png`, fullPage: true })
      }
      expect(overflowing, 'pages that scroll sideways').toEqual([])
    })
  }
}

test('refreshing a deep link keeps you on that page (checklist step 3.5)', async ({ page }) => {
  test.skip(!ROLES.manager.username, 'Set E2E_MANAGER_USERNAME')
  await signIn(page, ROLES.manager.username)
  const id = await projectId(page)
  await page.goto(`/#/projects/${id}/dependencies`)
  await expect(page.getByRole('heading', { name: /dependencies/i })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: /dependencies/i })).toBeVisible()
  expect(page.url()).toContain(`#/projects/${id}/dependencies`)
})
