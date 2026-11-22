import { test as base, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { KEY } from '../src/progress.ts';

/** The launch date at noon, when today's puzzle is the first level. */
export const LAUNCH_NOON = new Date('2026-12-01T12:00:00');

/** The analytics hosts. Requests to them never leave the test. */
export const ANALYTICS =
  /^https:\/\/([a-z0-9-]+\.goatcounter\.com|(static\.)?cloudflareinsights\.com)\//;

// The Content-Security-Policy that the build writes for Cloudflare. `vite
// preview` does not read _headers, so the tests add it to every page.
const contentSecurityPolicy = (): string | undefined =>
  /^ {2}Content-Security-Policy: (.+)$/m.exec(readFileSync('dist/_headers', 'utf8'))?.[1];

// Every browser test fails if the page logs a console error, throws or breaks
// the Content-Security-Policy, the browser-side counterpart of
// tests/setup/fail-on-console.ts.
//
// Unless a test sets `firstVisit`, the player has seen the tutorial, so its
// dialog does not cover the page.
//
// `analytics` lists the analytics requests the page made, in order.
export const test = base.extend<{
  pageErrors: string[];
  firstVisit: boolean;
  analytics: URL[];
}>({
  firstVisit: [false, { option: true }],
  page: async ({ page, firstVisit, baseURL }, use) => {
    if (!firstVisit) {
      await page.addInitScript((key) => {
        if (localStorage.getItem(key) === null) {
          localStorage.setItem(
            key,
            JSON.stringify({ tutorialSeen: true, puzzles: {}, streak: { last: 0, days: 0 } }),
          );
        }
      }, KEY);
    }
    await page.addInitScript(() => {
      document.addEventListener('securitypolicyviolation', (event) => {
        console.error(`CSP: ${event.violatedDirective} blocked ${event.blockedURI}`);
      });
    });
    const csp = contentSecurityPolicy();
    expect(csp, 'dist/_headers has a Content-Security-Policy').toBeDefined();
    await page.route(
      (url) => url.origin === new URL(String(baseURL)).origin,
      async (route) => {
        if (route.request().resourceType() !== 'document') {
          await route.fallback();
          return;
        }
        const response = await route.fetch();
        await route.fulfill({
          response,
          headers: { ...response.headers(), 'content-security-policy': String(csp) },
        });
      },
    );
    await use(page);
  },
  analytics: [
    async ({ page }, use) => {
      const requests: URL[] = [];
      await page.route(ANALYTICS, async (route) => {
        const url = new URL(route.request().url());
        requests.push(url);
        await (url.hostname === 'static.cloudflareinsights.com'
          ? route.fulfill({ contentType: 'text/javascript', body: '' })
          : route.fulfill({ status: 204 }));
      });
      await use(requests);
    },
    { auto: true },
  ],
  pageErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(`console.error: ${message.text()}`);
      });
      page.on('pageerror', (error) => errors.push(`uncaught: ${error.message}`));
      await use(errors);
      expect(errors, 'the page logged errors').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
