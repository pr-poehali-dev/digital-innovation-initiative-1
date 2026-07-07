import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for E2E tests of the dept-functions multi-upload flow.
 *
 * IMPORTANT (see e2e/README.md for full context):
 * These specs are prepared/scaffolded but have NOT been executed in a real
 * browser inside the current sandbox — this sandbox has no headless browser
 * binary available (no chromium/playwright browsers installed, no way to
 * `npx playwright install` a real browser here). Do not report these as
 * "passed" until someone runs them with `npx playwright test` in an
 * environment that has browsers installed.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:5173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: process.env.E2E_SKIP_WEBSERVER
    ? undefined
    : {
        command: "npm run dev",
        url: "http://localhost:5173",
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
      },
});
