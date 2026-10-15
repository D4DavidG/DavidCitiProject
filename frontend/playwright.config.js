import { defineConfig, devices } from '@playwright/test'

/**
 * End-to-end tests: a real browser against the running app and API. Start the local
 * stack first (./bin/start-dev.sh) and seed it (tools/demo.py seed), then:
 *   E2E_ADMIN_PASSWORD=... npm run e2e
 * E2E_BASE_URL / E2E_API point it elsewhere (e.g. the CloudFront URL after a deploy).
 * E2E_VIDEO=1 records every test as a video (tools/e2e.sh --video sets it), with each step
 * named on screen; the HTML report then plays each test's video.
 * tools/e2e.sh wraps all of this (usernames, local or AWS, --show, --video, --ui, --report).
 */
const VIDEO = process.env.E2E_VIDEO === '1'
  ? { mode: 'on', show: { actions: { position: 'top-right' }, test: { level: 'title', position: 'top-left' } } }
  : 'off' // as before: no video unless asked
export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  expect: { timeout: 30_000 }, // a Lambda cold start plus a waking database can take ~15 s
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: VIDEO,
    launchOptions: { slowMo: Number(process.env.E2E_SLOWMO ?? 0) }, // ms between browser steps; tools/e2e.sh --show sets 500
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
