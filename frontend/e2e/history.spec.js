/*
 * Employee history, end to end and read-only: a manager opens a report's History from the
 * People page and sees what happened but no before/after state (that is admin-only, so a
 * salary never reaches a manager); the employee sees My history on their Account page.
 * Changes no data, so it is safe against the deployed demo.
 *
 * Needs E2E_MANAGER_USERNAME (Maria Lopez) and E2E_EMPLOYEE_USERNAME (one of her reports: Ana
 * Ruiz locally, Ben Okafor on the live site). The employee's name comes from E2E_EMPLOYEE_NAME
 * or their sign-in (people.js), so the spec works with either.
 */
import { expect, test } from '@playwright/test'
import { employeeName } from './people.js'

const PASSWORD = 'Demo-pass-2026' // the seeded demo accounts (tools/demo.py)
const MANAGER = process.env.E2E_MANAGER_USERNAME
const EMPLOYEE = process.env.E2E_EMPLOYEE_USERNAME

test.skip(!MANAGER || !EMPLOYEE, 'Set E2E_MANAGER_USERNAME and E2E_EMPLOYEE_USERNAME.')

async function signIn(page, username) {
  await page.goto('/')
  await page.getByLabel('Username').fill(username)
  await page.getByRole('textbox', { name: 'Password', exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible() // the app bar: signed in
}

test("a manager reads a report's history, without the before/after state", async ({ page, request }) => {
  const name = await employeeName(request, EMPLOYEE)
  await signIn(page, MANAGER)
  await page.goto('/#/people')
  // The search matches usernames too, and a username belongs to exactly one person.
  await page.getByLabel('Search people').fill(EMPLOYEE)
  // The search runs as you type (after a 300 ms pause): wait until the list is down to one person.
  // Each row's actions sit in one "Actions for <name>" menu (15 Oct); History is one of its items.
  await expect(page.getByRole('button', { name: /^Actions for / })).toHaveCount(1)
  await page.getByRole('button', { name: `Actions for ${name}` }).click()
  await page.getByRole('menuitem', { name: 'History' }).click()
  const dialog = page.getByRole('dialog', { name: `History: ${name}` })
  await expect(dialog.getByRole('table', { name: 'History' })).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Show changes' })).toHaveCount(0)
})

test('an employee sees My history on their account', async ({ page }) => {
  await signIn(page, EMPLOYEE)
  await page.goto('/#/account')
  await expect(page.getByRole('heading', { name: 'My history' })).toBeVisible()
  await expect(page.getByRole('table', { name: 'History' })).toBeVisible()
})
