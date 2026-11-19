import { defineConfig, devices } from '@playwright/test';

// Browser tests against the production build served by `vite preview`.
// `npm run e2e` runs the e2e/ specs on every project; `npm run a11y` runs the
// @a11y specs (axe) on desktop Chromium and the mobile viewport.
const ci = process.env['CI'] === 'true';
const port = 4173;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: ci,
  // Flaky tests are quarantined with @flaky, never retried silently.
  retries: 0,
  reporter: [
    ['list'],
    ['junit', { outputFile: 'reports/junit-e2e.xml' }],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
  ],
  use: {
    baseURL: `http://localhost:${String(port)}`,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    // Most players arrive on phones.
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: `npx vite build && npx vite preview --port ${String(port)} --strictPort`,
    port,
    reuseExistingServer: !ci,
    timeout: 60_000,
  },
});
