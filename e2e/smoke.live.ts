import { type Page, expect, test } from '@playwright/test';
import { KEY } from '../src/progress.ts';
import { ANALYTICS, LAUNCH_NOON } from './fixtures.ts';

// The smoke test against the live site after a deploy
// (playwright.smoke.config.ts). It checks what only the real host shows: the
// headers from dist/_headers, SITE_URL and every page. Analytics requests are
// blocked, so the test is never counted as a visit.

/** Fails the test on a console error, an uncaught error or a CSP violation. */
async function watch(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console.error: ${message.text()}`);
  });
  page.on('pageerror', (error) => errors.push(`uncaught: ${error.message}`));
  await page.addInitScript((key) => {
    document.addEventListener('securitypolicyviolation', (event) => {
      console.error(`CSP: ${event.violatedDirective} blocked ${event.blockedURI}`);
    });
    // The player has seen the tutorial, so its dialog does not cover the page.
    localStorage.setItem(
      key,
      JSON.stringify({ tutorialSeen: true, puzzles: {}, streak: { last: 0, days: 0 } }),
    );
  }, KEY);
  await page.route(ANALYTICS, (route) =>
    new URL(route.request().url()).hostname === 'static.cloudflareinsights.com'
      ? route.fulfill({ contentType: 'text/javascript', body: '' })
      : route.fulfill({ status: 204 }),
  );
  return errors;
}

test('serves the game with its security headers and plays a puzzle', async ({ page, baseURL }) => {
  const errors = await watch(page);
  await page.clock.setFixedTime(LAUNCH_NOON);
  const response = await page.goto('/');
  expect(response?.status()).toBe(200);
  const headers = response?.headers() ?? {};
  expect(headers['content-security-policy']).toContain("default-src 'none'");
  expect(headers['x-content-type-options']).toBe('nosniff');
  // The build had SITE_URL: the canonical URL is this site, not the default.
  const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
  expect(new URL(String(canonical)).host).toBe(new URL(String(baseURL)).host);

  await page.getByRole('button', { name: /Seq scan/ }).click();
  await page.getByRole('button', { name: /^Race/ }).click();
  await expect(page.getByRole('region', { name: 'Share' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('serves the about and privacy pages', async ({ page }) => {
  const errors = await watch(page);
  for (const [path, name] of [
    ['/about', 'About'],
    ['/privacy', 'Privacy'],
  ] as const) {
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
  }
  expect(errors).toEqual([]);
});
