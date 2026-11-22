import { defineConfig, devices } from '@playwright/test';

// The README screenshots and the link preview (npm run screenshots): only
// e2e/*.shots.ts files run here, and the e2e config never runs them. They
// write docs/images/level.png, docs/images/result.png and public/og-image.png.
const port = 4174;

export default defineConfig({
  testDir: 'e2e',
  testMatch: '*.shots.ts',
  forbidOnly: true,
  retries: 0,
  reporter: [['list']],
  use: { baseURL: `http://localhost:${String(port)}` },
  // A phone, at twice the pixels, so the README shows it sharp at 820 px wide.
  projects: [
    {
      name: 'phone',
      use: { ...devices['Pixel 7'], viewport: { width: 410, height: 820 }, deviceScaleFactor: 2 },
    },
  ],
  webServer: {
    // No analytics settings: nothing is counted while the screenshots are taken.
    command: `npx vite build && npx vite preview --port ${String(port)} --strictPort`,
    port,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
