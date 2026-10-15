/*
 * Logged time, end to end: an employee (Ben Okafor) logs 15 minutes on his open task, his line
 * manager (Maria) approves it on Approvals, Ben sees it Approved, and the project's "Spent
 * (approved time)" figure goes up. Run it LOCALLY only: it writes one approved 15-minute entry
 * (about $10 of Apollo's budget), its audit rows and bell notifications. There is no delete, so
 * each run adds one; 15 minutes keeps Ben far below his 40 h week.
 *
 * Needs E2E_MANAGER_USERNAME (the seeded Maria; tools/test-all.sh looks it up). Ben's username is
 * read from the API as Maria, who manages him. Seeded data: Ben holds "Portal UI" on Apollo,
 * not done, and is booked on Apollo today.
 */
import { expect, test } from '@playwright/test'

const DEMO_PASSWORD = 'Demo-pass-2026' // every seeded account's password (tools/demo.py)
const API = process.env.E2E_API ?? 'http://localhost:3001/api/tracker'
const maria = process.env.E2E_MANAGER_USERNAME
const note = `E2E time ${Date.now()}`

test.skip(!maria, 'Set E2E_MANAGER_USERNAME (the seeded Maria Lopez).')
// It writes data, so never against the live demo, even if E2E_BASE_URL is left set from an AWS run.
test.skip(!(process.env.E2E_BASE_URL ?? 'http://localhost').includes('localhost'), 'Writes data: local stack only.')

/** A fresh browser signed in as `username`. */
async function signIn(browser, username) {
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
  await page.goto('/')
  await page.getByLabel('Username').fill(username)
  await page.getByRole('textbox', { name: 'Password', exact: true }).fill(DEMO_PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()
  return page
}

/** The project's "Spent (approved time)" figure in whole dollars, read off its Budget tab. */
async function spentDollars(page, projectId) {
  await page.goto(`/#/projects/${projectId}`)
  await page.getByRole('tab', { name: 'Budget' }).click()
  const figure = page.getByText('Spent (approved time)', { exact: true }).locator('..')
  await expect(figure).toContainText('$')
  return Number((await figure.locator('p').last().innerText()).replace(/[$,]/g, '')) // the label, then the value
}

test('an employee logs time, the manager approves it, and it counts as spent', async ({ browser, request }) => {
  // Ben's username, looked up as his manager (as the People screen would).
  const login = await request.post(`${API}/auth/login`, { data: { username: maria, password: DEMO_PASSWORD } })
  const { token } = await login.json()
  const found = await (await request.get(`${API}/users?search=Okafor`, { headers: { Authorization: `Bearer ${token}` } })).json()
  const ben = found.items.find((u) => u.firstName === 'Ben')
  expect(ben, 'the seeded Ben Okafor').toBeTruthy()

  const manager = await signIn(browser, maria)
  const projects = await (await request.get(`${API}/projects?search=Apollo`, { headers: { Authorization: `Bearer ${token}` } })).json()
  const apollo = projects.items.find((p) => p.name === 'Apollo')
  const spentBefore = await spentDollars(manager, apollo.projectId)

  // Ben logs 15 minutes on his open task.
  const employee = await signIn(browser, ben.username)
  await employee.goto('/#/my-tasks')
  await employee.getByRole('article', { name: 'Portal UI' }).getByRole('button', { name: 'Log time' }).click()
  const dialog = employee.getByRole('dialog', { name: 'Log time on Portal UI' })
  await dialog.getByLabel('Hours').fill('0')
  await dialog.getByLabel('Minutes').fill('15')
  await dialog.getByLabel('Note').fill(note)
  await dialog.getByRole('button', { name: 'Log' }).click()
  await expect(employee.getByText("Logged 15 min on Portal UI. It's waiting for approval.")).toBeVisible()
  // My logged time is a folded section: open it to see the entry.
  await employee.getByRole('button', { name: /^My logged time/ }).click()
  const mine = employee.getByRole('table', { name: 'My logged time' }).getByRole('row').filter({ hasText: note })
  await expect(mine).toContainText('Pending')

  // Maria approves it from Approvals. The Saved pop-up confirms it, and the entry leaves the queue.
  await manager.goto('/#/approvals')
  const row = manager.getByRole('row').filter({ hasText: note })
  await expect(row).toContainText('Ben Okafor')
  await row.getByRole('button', { name: 'Approve 15 min by Ben Okafor' }).click()
  await expect(manager.getByRole('status').filter({ hasText: /^Saved$/ })).toBeVisible()
  await expect(manager.getByRole('row').filter({ hasText: note })).toHaveCount(0)

  // Ben sees it approved (the reload folds My logged time again).
  await employee.reload()
  await employee.getByRole('button', { name: /^My logged time/ }).click()
  await expect(employee.getByRole('table', { name: 'My logged time' }).getByRole('row').filter({ hasText: note }))
    .toContainText('Approved')

  // Only approved time is spent: the figure went up (15 min at Ben's frozen rate, about $10).
  expect(await spentDollars(manager, apollo.projectId)).toBeGreaterThan(spentBefore)
})
