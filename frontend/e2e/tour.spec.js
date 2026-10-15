/*
 * A read-only tour of every screen a manager and an employee can reach, at desktop and
 * phone width, in light and in dark mode: checks each page renders with no sideways scrolling,
 * saves a screenshot of each for review (dark ones end in "-dark"), and checks that refreshing
 * a deep link works. Changes no data, so it is safe against the deployed demo. Also runs axe on
 * every screen in both modes: serious or critical WCAG A/AA problems fail the test.
 * Runs only when asked:
 *
 *   E2E_TOUR_DIR=/some/folder E2E_MANAGER_USERNAME=ML662930 E2E_EMPLOYEE_USERNAME=AR553882 \
 *   E2E_BASE_URL=https://<cloudfront> npx playwright test tour
 */
import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const DIR = process.env.E2E_TOUR_DIR
const PASSWORD = 'Demo-pass-2026' // the seeded demo accounts (tools/demo.py)
const VIEWPORTS = { desktop: { width: 1440, height: 900 }, phone: { width: 375, height: 812 } }
const ROLES = {
  manager: {
    username: process.env.E2E_MANAGER_USERNAME,
    screens: ['/dashboard', '/allocation', '/schedule', '/projects', 'PROJECT', 'PROJECT:Board', 'PROJECT:Resources', 'PROJECT:Budget',
      'PROJECT/dependencies', '/approvals', '/people', '/requests', '/notifications', '/account'],
  },
  employee: {
    username: process.env.E2E_EMPLOYEE_USERNAME,
    screens: ['/my-tasks', '/projects', 'PROJECT', 'PROJECT:Board', 'PROJECT/dependencies', '/requests', '/notifications',
      '/account'],
  },
}

// Charts that must be on screen, by screen key. The overflow check below then covers them at both widths.
const FIGURES = {
  '/dashboard': ['Workload this week · all projects', 'Budget by project'],
  '/schedule': ['Bookings, week by week'],
  PROJECT: ['Deliverables timeline'],
}

// The home pages' project timelines (sections named by their titles), by screen key.
const REGIONS = {
  '/dashboard': ['My projects this week'],
  '/my-tasks': ['My projects'],
}

// The colour mode is the site's own remembered choice (frontend/src/theme/colorMode.js, MODE_KEY),
// set before the first page loads. The sun/moon button names the mode you would switch to.
const MODE_KEY = 'acme.colorMode'
const MODES = {
  light: { button: 'Switch to dark mode', suffix: '' },
  dark: { button: 'Switch to light mode', suffix: '-dark' },
}

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] // every WCAG 2.0-2.2 A and AA rule axe has
const FAILING = ['serious', 'critical']

test.skip(!DIR, 'Set E2E_TOUR_DIR (and the usernames) to run the screen tour.')

async function signIn(page, username) {
  await page.goto('/')
  await page.getByLabel('Username').fill(username)
  await page.getByRole('textbox', { name: 'Password', exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  // Not "a heading": the login page has one too. Signed in means the app bar is there.
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()
}

// Runs axe on the page as it is now and adds one line per serious or critical problem.
async function scan(page, where, problems) {
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze()
  for (const v of violations.filter((x) => FAILING.includes(x.impact))) {
    problems.push(`${where}: ${v.id} (${v.impact}, ${v.nodes.length} elements: ${v.nodes[0].target.join(' ')})`)
  }
}

async function projectId(page) {
  await page.goto('/#/projects')
  await page.getByRole('link', { name: 'Apollo' }).first().click()
  await expect(page.getByRole('heading', { name: 'Apollo', level: 1 })).toBeVisible()
  return page.url().split('/projects/')[1]
}

// One test per colour mode, role and width: 2 x 2 x 2 = 8 tests, each ending in "(axe)".
const RUNS = Object.keys(MODES).flatMap((mode) => Object.keys(ROLES).flatMap(
  (role) => Object.keys(VIEWPORTS).map((viewport) => ({ mode, role, viewport })),
))

for (const { mode, role, viewport } of RUNS) {
  const { username, screens } = ROLES[role]
  const size = VIEWPORTS[viewport]
  const { button, suffix } = MODES[mode]
  const where = mode === 'dark' ? `${viewport} width, dark mode` : `${viewport} width`
  test(`${role} at ${where}: every screen renders without sideways scrolling or serious accessibility problems (axe)`, async ({ page }) => {
    test.skip(!username, `Set E2E_${role.toUpperCase()}_USERNAME`)
    await page.addInitScript(([key, value]) => window.localStorage.setItem(key, value), [MODE_KEY, mode])
    await page.setViewportSize(size)
    const problems = []
    await page.goto('/')
    await expect(page.getByLabel('Username')).toBeVisible()
    await expect(page.getByRole('button', { name: button })).toBeVisible() // the mode really is on
    await scan(page, 'sign-in page', problems)
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
      for (const name of FIGURES[screen] ?? []) {
        await expect(page.getByRole('figure', { name })).toBeVisible()
      }
      for (const name of REGIONS[screen] ?? []) {
        await expect(page.getByRole('region', { name, exact: true })).toBeVisible()
      }
      await page.waitForLoadState('networkidle')
      // Park the pointer in a corner: after sign-in it rests where the button was, which can be over a chart row
      // and leaves its tooltip open across the screenshot.
      await page.mouse.move(0, 0)
      await expect(page.getByRole('tooltip')).toHaveCount(0)
      await scan(page, screen, problems)
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      if (overflow > 1) overflowing.push(`${screen} (${overflow}px)`)
      const name = screen.replace(/^\//, '').replace(/[/:]/g, '-').toLowerCase() || 'home'
      await page.screenshot({ path: `${DIR}/${role}-${viewport}-${name}${suffix}.png`, fullPage: true })
    }
    if (viewport === 'phone') {
      // The menu is closed on phones, so open it once and scan it too.
      await page.goto(`/#${screens[0]}`)
      await page.getByRole('button', { name: 'Open menu' }).click()
      await expect(page.getByRole('navigation', { name: 'Main menu' })).toBeVisible()
      await scan(page, 'phone menu', problems)
      await page.keyboard.press('Escape')
    }
    expect(overflowing, 'pages that scroll sideways').toEqual([])
    expect(problems, 'accessibility problems (axe, serious or critical)').toEqual([])
  })
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
