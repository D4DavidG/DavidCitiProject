/*
 * The pull board, end to end: an employee takes a Ready task from the Board tab and puts
 * it back. Run it LOCALLY only. Unlike demo.spec.js and tour.spec.js it writes: a task,
 * CREATE / CLAIM / RELEASE / ARCHIVE audit rows, and bell notifications for Ana's line
 * manager (Maria) and every admin. Against AWS those would show up in the live demo.
 *
 * It makes its own Ready task, so the seeded "Go-live checklist" stays free for the demo.
 * Precondition: Ana holds at most 1 unfinished task (the seed gives her Portal API),
 * because her limit is 2. If someone took "Go-live checklist" as Ana, put it back first.
 *
 * Needs E2E_ADMIN_PASSWORD, or E2E_MANAGER_USERNAME and E2E_EMPLOYEE_USERNAME.
 */
import { expect, test } from '@playwright/test'

const API = process.env.E2E_API ?? 'http://localhost:3001/api/tracker'
const DEMO_PASSWORD = 'Demo-pass-2026' // every seeded account's password (tools/demo.py)

let ana
let maria
let mariaToken
let task
const title = `E2E pull ${Date.now()}`

/** Signs in through the API and returns the bearer token. */
async function login(request, username, password) {
  const res = await request.post(`${API}/auth/login`, { data: { username, password } })
  expect(res.ok(), `login ${username}`).toBeTruthy()
  return (await res.json()).token
}

test.beforeAll(async ({ request }) => {
  ana = process.env.E2E_EMPLOYEE_USERNAME
  maria = process.env.E2E_MANAGER_USERNAME
  if (!ana || !maria) {
    const adminPassword = process.env.E2E_ADMIN_PASSWORD
    test.skip(!adminPassword, 'Set E2E_ADMIN_PASSWORD (or both usernames) for the environment under test.')
    const token = await login(request, 'AD000001', adminPassword)
    const find = async (search, email) => {
      const res = await request.get(`${API}/users?search=${search}`, { headers: { Authorization: `Bearer ${token}` } })
      const found = (await res.json()).items.find((u) => u.email === email)
      expect(found, `seeded user ${email} (run tools/demo.py seed)`).toBeTruthy()
      return found.username
    }
    maria = await find('maria.lopez', 'maria.lopez@acme.test')
    ana = await find('ana.ruiz', 'ana.ruiz@acme.test')
  }
  mariaToken = await login(request, maria, DEMO_PASSWORD)
  const headers = { Authorization: `Bearer ${mariaToken}` }
  const projects = await (await request.get(`${API}/projects?search=Apollo`, { headers })).json()
  const apollo = projects.items.find((p) => p.name === 'Apollo')
  expect(apollo, 'seeded project Apollo').toBeTruthy()
  const milestones = await (await request.get(`${API}/projects/${apollo.projectId}/milestones`, { headers })).json()
  const list = milestones.items
  const launch = list.find((m) => m.name === 'Launch')
  expect(launch, 'Apollo deliverable Launch').toBeTruthy()
  const created = await request.post(`${API}/milestones/${launch.milestoneId}/tasks`, {
    headers, data: { title, estimateMinutes: 60 },
  })
  expect(created.ok(), 'create the Ready task').toBeTruthy()
  task = await created.json()
})

test.afterAll(async ({ request }) => {
  if (task && mariaToken) { // archived tasks never count as held
    await request.post(`${API}/tasks/${task.taskId}/archive`, { headers: { Authorization: `Bearer ${mariaToken}` } })
  }
})

test('an employee takes a Ready task from the board and puts it back', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Username').fill(ana)
  await page.getByRole('textbox', { name: 'Password', exact: true }).fill(DEMO_PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()

  await page.getByRole('navigation', { name: 'Main menu' }).getByRole('link', { name: 'Projects' }).click()
  await page.getByRole('link', { name: 'Apollo' }).click()
  await page.getByRole('tab', { name: 'Board' }).click()

  const card = (column) => page.getByRole('region', { name: column }).getByRole('article', { name: title })
  await card('Ready').getByRole('button', { name: 'Take this' }).click()
  await expect(card('In progress')).toBeVisible()
  await expect(card('In progress').getByText('Ana Ruiz')).toBeVisible()

  await card('In progress').getByRole('button', { name: 'Put back' }).click()
  await expect(card('Ready')).toBeVisible()
  await expect(card('Ready').getByText('Unassigned')).toBeVisible()
})
