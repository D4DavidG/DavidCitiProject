/*
 * Requests for everyone, end to end: an employee (Ana) asks her line manager (Maria) a
 * free-text question, Maria rejects it with a note from To decide, and Ana sees the
 * answer on her phone. Run it LOCALLY only: it writes one rejected request, its CREATE
 * and REJECT audit rows, and bell notifications. Free text plus reject, so nobody's
 * task limit, overtime or projects change.
 *
 * Needs E2E_MANAGER_USERNAME and E2E_EMPLOYEE_USERNAME (tools/test-all.sh looks them up).
 */
import { expect, test } from '@playwright/test'

const DEMO_PASSWORD = 'Demo-pass-2026' // every seeded account's password (tools/demo.py)
const ana = process.env.E2E_EMPLOYEE_USERNAME
const maria = process.env.E2E_MANAGER_USERNAME
const subject = `E2E question ${Date.now()}`

/** A fresh browser signed in as `username`, at `size`, already on the Requests page. */
async function openRequests(browser, username, size = { width: 1440, height: 900 }) {
  const page = await (await browser.newContext({ viewport: size })).newPage()
  await page.goto('/')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Password').fill(DEMO_PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()
  await page.goto('/#/requests')
  await expect(page.getByRole('heading', { name: 'Requests', level: 1 })).toBeVisible()
  return page
}

test.skip(!ana || !maria, 'Set E2E_EMPLOYEE_USERNAME and E2E_MANAGER_USERNAME (seeded Ana and Maria).')
// It writes data, so never against the live demo, even if E2E_BASE_URL is left set from an AWS run.
test.skip(!(process.env.E2E_BASE_URL ?? 'http://localhost').includes('localhost'), 'Writes data: local stack only.')

test('an employee asks, the manager answers, the employee sees it on a phone', async ({ browser }) => {
  const asker = await openRequests(browser, ana)
  await asker.getByRole('button', { name: 'New request' }).click()
  await asker.getByRole('menuitem', { name: 'Something else' }).click()
  await asker.getByLabel('Subject').fill(subject)
  await asker.getByLabel('Why is it needed?').fill('Checked by the browser test')
  await asker.getByRole('button', { name: 'Send request' }).click()
  await expect(asker.getByText('Request sent. Your line manager will answer it.')).toBeVisible()
  await expect(asker.getByRole('row', { name: new RegExp(subject) })).toContainText('Pending')

  const decider = await openRequests(browser, maria)
  await decider.getByRole('tab', { name: 'To decide' }).click()
  await decider.getByRole('button', { name: `Reject ${subject}` }).click()
  await decider.getByLabel('Note to Ana Ruiz').fill('Ask me at our one-to-one')
  await decider.getByRole('button', { name: 'Reject', exact: true }).click()
  await expect(decider.getByText(`Rejected: ${subject}.`)).toBeVisible()

  const phone = await openRequests(browser, ana, { width: 390, height: 844 })
  const card = phone.getByRole('list', { name: 'Requests' }).getByRole('listitem').filter({ hasText: subject })
  await expect(card).toContainText('Rejected')
  await expect(card).toContainText('Ask me at our one-to-one')
})
