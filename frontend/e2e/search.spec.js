/*
 * The top bar's search, in a real browser and read-only: a manager types a few letters and jumps
 * to a page, then types a project's name and jumps to that project; on a phone the search button
 * opens the box across the bar. Choosing only navigates, so it is safe against the deployed demo.
 *
 * Signs in as Maria Lopez (E2E_MANAGER_USERNAME, ML460428 locally by default), who manages Apollo.
 */
import { expect, test } from '@playwright/test'

const PASSWORD = 'Demo-pass-2026' // every seeded account's password (tools/demo.py)
const MANAGER = process.env.E2E_MANAGER_USERNAME ?? 'ML460428'
const SEARCH = 'Search pages and projects'

async function signIn(page) {
  await page.goto('/')
  await page.getByLabel('Username').fill(MANAGER)
  await page.getByRole('textbox', { name: 'Password', exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible()
}

test('the top-bar search jumps to a page and to a project', async ({ page }) => {
  await signIn(page)
  const box = page.getByRole('combobox', { name: SEARCH })

  // A page: "/" jumps into the box from anywhere outside a field; a few letters find Schedule.
  await page.keyboard.press('/')
  await expect(box).toBeFocused()
  await box.fill('sched')
  await page.getByRole('option', { name: 'Schedule' }).click()
  await expect(page).toHaveURL(/#\/schedule$/)
  await expect(page.getByRole('heading', { name: 'Schedule', level: 1 })).toBeVisible()
  await expect(box).toHaveValue('') // choosing clears the box

  // A project: its name, from GET /projects (250 ms after typing stops), under "Projects".
  await box.fill('Apollo')
  await page.getByRole('option', { name: 'Apollo' }).click()
  await expect(page).toHaveURL(/#\/projects\/\d+$/)
  await expect(page.getByRole('heading', { name: 'Apollo', level: 1 })).toBeVisible()
})

test.describe('on a phone', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  test('the search button opens the box across the bar, and choosing goes there', async ({ page }) => {
    await signIn(page)
    await page.getByRole('button', { name: SEARCH }).click()
    const box = page.getByRole('combobox', { name: SEARCH })
    await expect(box).toBeFocused()
    await box.fill('people')
    await page.getByRole('option', { name: 'People' }).click()
    await expect(page).toHaveURL(/#\/people$/)
    await expect(page.getByRole('heading', { name: 'People', level: 1 })).toBeVisible()
    await expect(box).toHaveCount(0) // the box closes on a phone once you choose
  })
})
