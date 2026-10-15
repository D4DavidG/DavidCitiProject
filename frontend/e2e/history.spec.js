/*
 * Employee history, end to end and read-only: a manager opens a report's History from the
 * People page and sees what happened but no before/after state (that is admin-only, so a
 * salary never reaches a manager); the employee sees My history on their Account page.
 * Changes no data, so it is safe against the deployed demo.
 *
 * Needs E2E_MANAGER_USERNAME (Maria Lopez) and E2E_EMPLOYEE_USERNAME (Ana Ruiz, her report).
 */
import { expect, test } from '@playwright/test'

const PASSWORD = 'Demo-pass-2026' // the seeded demo accounts (tools/demo.py)
const MANAGER = process.env.E2E_MANAGER_USERNAME
const EMPLOYEE = process.env.E2E_EMPLOYEE_USERNAME

test.skip(!MANAGER || !EMPLOYEE, 'Set E2E_MANAGER_USERNAME and E2E_EMPLOYEE_USERNAME.')

async function signIn(page, username) {
  await page.goto('/')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible() // the app bar: signed in
}

test("a manager reads a report's history, without the before/after state", async ({ page }) => {
  await signIn(page, MANAGER)
  await page.goto('/#/people')
  await page.getByLabel('Search people').fill('ana.ruiz')
  // The search runs as you type (after a 300 ms pause): wait until the list is down to Ana.
  await expect(page.getByRole('button', { name: /^History for / })).toHaveCount(1)
  await page.getByRole('button', { name: 'History for Ana Ruiz' }).click()
  const dialog = page.getByRole('dialog', { name: 'History: Ana Ruiz' })
  await expect(dialog.getByRole('table', { name: 'History' })).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Show changes' })).toHaveCount(0)
})

test('an employee sees My history on their account', async ({ page }) => {
  await signIn(page, EMPLOYEE)
  await page.goto('/#/account')
  await expect(page.getByRole('heading', { name: 'My history' })).toBeVisible()
  await expect(page.getByRole('table', { name: 'History' })).toBeVisible()
})
