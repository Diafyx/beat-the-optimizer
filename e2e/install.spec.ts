import { chromium } from '@playwright/test';
import { ANALYTICS, addContentSecurityPolicy, expect, test } from './fixtures.ts';

// The site as an installable web app (#96).
test('serves the manifest and its icons', async ({ page }) => {
  await page.goto('/');
  const response = await page.request.get('/manifest.webmanifest');
  expect(response.ok()).toBe(true);
  const manifest = (await response.json()) as { name: string; icons: { src: string }[] };
  expect(manifest.name).toBe('Beat the Optimizer');
  for (const { src } of manifest.icons) {
    const icon = await page.request.get(src);
    expect(icon.headers()['content-type']).toBe('image/png');
  }
});

// Chromium's own check, the one behind its install prompt. Only full Chromium
// runs it, not the headless shell Playwright uses by default, and only in a
// profile that is not private, so this test starts its own Chromium, whatever
// the project.
test('passes Chromium’s installability check', async ({ baseURL }, testInfo) => {
  const context = await chromium.launchPersistentContext(testInfo.outputPath('profile'), {
    channel: 'chromium',
  });
  try {
    await addContentSecurityPolicy(context, String(baseURL));
    // As in every test, no request reaches the analytics hosts.
    await context.route(ANALYTICS, (route) => route.fulfill({ status: 204 }));
    const page = context.pages()[0] ?? (await context.newPage());
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await page.goto(String(baseURL));
    const cdp = await context.newCDPSession(page);
    await expect
      .poll(async () => {
        const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors');
        return installabilityErrors.map(({ errorId }) => errorId);
      })
      .toEqual([]);
    // The manifest loads under the Content-Security-Policy.
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});
