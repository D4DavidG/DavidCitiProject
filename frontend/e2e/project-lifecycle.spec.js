/*
 * A project's whole life, end to end, as an admin: create it, edit it, archive it (gone from the
 * live list, there with Show archived), reactivate it, then archive it again so it doesn't
 * clutter the demo. Run it LOCALLY only: each run adds one archived project, with its audit rows
 * and the admins' notifications. Nothing is deleted (archive is the D in CRUD here).
 *
 * Needs E2E_ADMIN_PASSWORD: only an admin creates, archives and reactivates projects, and the
 * local admin (AD000001) has a password set at first sign-in that is not in the repo. On the live
 * site it skips itself unless the run was started with ./tools/e2e.sh --aws --allow-writes.
 */
import { expect, test } from '@playwright/test'
import { writesAllowed, WRITES_REFUSED } from './people.js'

const ADMIN = 'AD000001'
const adminPassword = process.env.E2E_ADMIN_PASSWORD
const name = `E2E project ${Date.now()}`

test.skip(!adminPassword, 'Set E2E_ADMIN_PASSWORD (the local AD000001 password): only an admin creates and archives projects.')
// It writes data, so never against the live demo, even if E2E_BASE_URL is left set from an AWS run,
// unless tools/e2e.sh --aws --allow-writes started the run.
test.skip(!writesAllowed, WRITES_REFUSED)

/** An ISO date `days` from today (the browser's date input takes YYYY-MM-DD). */
const isoIn = (days) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10)

/**
 * The projects list, searched for this run's project, with Show archived on or off. The search
 * runs as you type (after a 300 ms pause), so the caller's expect waits for the answer.
 */
async function findInList(page, showArchived) {
  await page.goto('/#/projects')
  const toggle = page.getByLabel('Show archived')
  if ((await toggle.isChecked()) !== showArchived) await toggle.click()
  await page.getByLabel('Search projects').fill(name)
}

/** Archive the open project through its confirmation dialog. */
async function archive(page) {
  await page.getByRole('button', { name: 'Archive project' }).click()
  const dialog = page.getByRole('dialog', { name: `Archive ${name}?` })
  await expect(dialog).toContainText('can be reactivated')
  await dialog.getByRole('button', { name: 'Archive project' }).click()
  await expect(page.getByText('This project is archived')).toBeVisible()
}

test('an admin creates, edits, archives, reactivates and re-archives a project', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  await page.getByLabel('Username').fill(ADMIN)
  await page.getByRole('textbox', { name: 'Password', exact: true }).fill(adminPassword)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()

  // Create.
  await page.goto('/#/projects')
  await page.getByRole('button', { name: 'New project' }).click()
  const create = page.getByRole('dialog', { name: 'New project' })
  await create.getByLabel('Name').fill(name)
  await create.getByLabel('Manager').click()
  await page.getByRole('option', { name: 'Maria Lopez' }).click()
  await create.getByLabel('Start date').fill(isoIn(0))
  await create.getByLabel('End date').fill(isoIn(30))
  await create.getByLabel('Budget ($)').fill('1,000')
  await create.getByRole('button', { name: 'Create' }).click() // the New project dialog's button says Create, not Save
  await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible() // it opens the new project
  await expect(page.getByText('Managed by Maria Lopez')).toBeVisible()

  // Edit.
  await page.getByRole('button', { name: 'Edit project' }).click()
  const edit = page.getByRole('dialog', { name: `Edit ${name}` })
  await edit.getByLabel('Description').fill('Edited by the browser test')
  await edit.getByRole('button', { name: 'Save' }).click()
  await expect(edit).toHaveCount(0)
  await expect(page.getByText('Edited by the browser test')).toBeVisible()
  const projectUrl = page.url()

  // Archive: gone from the live list, there (marked Archived) with Show archived.
  await archive(page)
  await findInList(page, false)
  await expect(page.getByText('No projects match.')).toBeVisible()
  await findInList(page, true)
  const row = page.getByRole('row').filter({ hasText: name })
  await expect(row).toContainText('Archived')

  // Reactivate, then archive again so the demo's lists stay clean.
  await page.goto(projectUrl)
  await page.getByRole('button', { name: 'Reactivate' }).click()
  await expect(page.getByText('This project is archived')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Archive project' })).toBeVisible()
  await archive(page)
})
