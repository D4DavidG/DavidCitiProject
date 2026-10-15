/*
 * The Archive warning, read-only: an admin opens Archive for the employee, whom the seed books
 * on Apollo, and the dialog flags the live projects they are still on before anything happens
 * (it only reads GET /users/{id}/projects), with the button reading "Archive anyway". The test
 * presses Cancel, never the archive button, so nothing changes and it is safe on the live site.
 *
 * Needs E2E_ADMIN_PASSWORD (AD000001's) and E2E_EMPLOYEE_USERNAME (Ana Ruiz locally, Ben Okafor
 * on the live site); the employee's name comes from E2E_EMPLOYEE_NAME or their sign-in (people.js).
 */
import { expect, test } from '@playwright/test'
import { employeeName } from './people.js'

const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD
const EMPLOYEE = process.env.E2E_EMPLOYEE_USERNAME

test.skip(!ADMIN_PASSWORD || !EMPLOYEE, 'Set E2E_ADMIN_PASSWORD and E2E_EMPLOYEE_USERNAME.')

test('archiving someone still on a live project warns first, and Cancel changes nothing', async ({ page, request }) => {
  const name = await employeeName(request, EMPLOYEE)
  await page.goto('/')
  await page.getByLabel('Username').fill('AD000001')
  await page.getByRole('textbox', { name: 'Password', exact: true }).fill(ADMIN_PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()
  await page.goto('/#/people')
  // The search matches usernames, and a username belongs to exactly one person.
  await page.getByLabel('Search people').fill(EMPLOYEE)
  await expect(page.getByRole('button', { name: /^Actions for / })).toHaveCount(1)
  await page.getByRole('button', { name: `Actions for ${name}` }).click()
  await page.getByRole('menuitem', { name: 'Archive', exact: true }).click()

  const dialog = page.getByRole('dialog', { name: `Archive ${name}?` })
  await expect(dialog.getByText(new RegExp(`^${name} is still on \\d+ live projects?$`))).toBeVisible()
  await expect(dialog.getByRole('listitem').filter({ hasText: /^Apollo · / })).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Archive anyway' })).toBeEnabled()

  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByRole('button', { name: `Actions for ${name}` })).toBeVisible() // still there, still live
})
