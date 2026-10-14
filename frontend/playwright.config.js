import { defineConfig, devices } from '@playwright/test'

/**
 * End-to-end tests: a real browser against the running app and API. Start the local
 * stack first (./bin/start-dev.sh) and seed it (tools/demo.py seed), then:
 *   E2E_ADMIN_PASSWORD=... npm run e2e
 * E2E_BASE_URL / E2E_API point it elsewhere (e.g. the CloudFront URL after a deploy).
 */
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
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
