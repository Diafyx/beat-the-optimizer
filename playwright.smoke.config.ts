import { defineConfig, devices } from '@playwright/test';

// The smoke test against the live site after a production deploy
// (.github/workflows/deploy.yml). SMOKE_URL is the site's address. Only
// e2e/*.live.ts files run here, and the e2e config never runs them.
const url = process.env['SMOKE_URL'];
if (url === undefined || url === '') throw new Error('SMOKE_URL is not set');

export default defineConfig({
  testDir: 'e2e',
  testMatch: '*.live.ts',
  forbidOnly: true,
  // As in playwright.config.ts: never retried silently.
  retries: 0,
  reporter: [
    ['list'],
    ['junit', { outputFile: 'reports/junit-smoke.xml' }],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
  ],
  use: { baseURL: url, trace: 'retain-on-failure' },
  projects: [{ name: 'mobile', use: { ...devices['Pixel 7'] } }],
});
