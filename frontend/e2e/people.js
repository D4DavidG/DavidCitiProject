/*
 * Who the browser tests sign in as, and whether they may add data, shared by the specs.
 * tools/e2e.sh fills the E2E_* variables: from the local database (the employee is Ana Ruiz),
 * or with the live site's demo accounts on --aws (the employee is Ben Okafor there, because
 * Ana Ruiz was archived in the 15 Oct demo). Not a test file: Playwright runs only *.spec.js.
 */
import { expect, test } from '@playwright/test'

const API = process.env.E2E_API ?? 'http://localhost:3001/api/tracker'
const DEMO_PASSWORD = 'Demo-pass-2026' // every seeded account's password (tools/demo.py)

/**
 * The employee's name as the website shows it ("First Last"), so a spec never assumes who the
 * employee is. E2E_EMPLOYEE_NAME when it is set (tools/e2e.sh sets it next to the username);
 * otherwise the name the server returns when that person signs in.
 * @param {import('@playwright/test').APIRequestContext} request Playwright's API client.
 * @param {string} username The employee's username (E2E_EMPLOYEE_USERNAME).
 * @returns {Promise<string>} For example "Ana Ruiz" locally, "Ben Okafor" on the live site.
 */
export async function employeeName(request, username) {
  if (process.env.E2E_EMPLOYEE_NAME) return process.env.E2E_EMPLOYEE_NAME
  const res = await request.post(`${API}/auth/login`, { data: { username, password: DEMO_PASSWORD } })
  expect(res.ok(), `sign in as ${username} to read their name`).toBeTruthy()
  const { user } = await res.json()
  return `${user.firstName} ${user.lastName}`
}

/**
 * A browser of its own for one person in a test that signs in several (requests, timelog).
 * Playwright records a video only of the page it opens itself, so with E2E_VIDEO=1
 * (tools/e2e.sh --video) this records the person too: the context goes on `opened`, and
 * closeAndAttach() at the end of the test saves each video and adds it to the HTML report.
 * @param {import('@playwright/test').Browser} browser Playwright's browser.
 * @param {object[]} opened The test's list of contexts; this one is added to it.
 * @param {{width: number, height: number}} viewport The window size.
 * @returns {Promise<import('@playwright/test').Page>} A blank page in the new browser.
 */
export async function newPersonPage(browser, opened, viewport) {
  const video = process.env.E2E_VIDEO === '1' ? { recordVideo: { dir: test.info().outputPath('people'), size: viewport } } : {}
  const context = await browser.newContext({ viewport, ...video })
  opened.push(context)
  return context.newPage()
}

/**
 * Closes the browsers newPersonPage() opened (closing is what saves a video) and attaches each
 * video to the test's HTML report. Call it from test.afterEach, so it runs even when a test fails.
 * @param {object[]} opened The test's list of contexts; emptied.
 * @param {import('@playwright/test').TestInfo} testInfo The test that just ran.
 * @returns {Promise<void>}
 */
export async function closeAndAttach(opened, testInfo) {
  for (const context of opened.splice(0)) {
    const videos = context.pages().map((page) => page.video()).filter(Boolean)
    await context.close()
    for (const video of videos) {
      await testInfo.attach('video', { path: await video.path(), contentType: 'video/webm' })
    }
  }
}

/**
 * True where a test may add data: the local stack, or the live site only when the run was started
 * with tools/e2e.sh --aws --allow-writes (which sets E2E_ALLOW_WRITES=1 after its warning). The
 * files that write skip themselves otherwise, so Playwright's UI mode on the live site can't
 * write by accident.
 */
export const writesAllowed = (process.env.E2E_BASE_URL ?? 'http://localhost').includes('localhost')
  || process.env.E2E_ALLOW_WRITES === '1'

/** Why a file that writes skipped itself. */
export const WRITES_REFUSED = 'Writes data: local stack only, or the live site with ./tools/e2e.sh --aws --allow-writes.'
