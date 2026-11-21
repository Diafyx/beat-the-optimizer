import { test as base, expect } from '@playwright/test';
import { KEY } from '../src/progress.ts';

/** The launch date at noon, when today's puzzle is the first level. */
export const LAUNCH_NOON = new Date('2026-12-01T12:00:00');

// Every browser test fails if the page logs a console error or throws, the
// browser-side counterpart of tests/setup/fail-on-console.ts.
//
// Unless a test sets `firstVisit`, the player has seen the tutorial, so its
// dialog does not cover the page.
export const test = base.extend<{ pageErrors: string[]; firstVisit: boolean }>({
  firstVisit: [false, { option: true }],
  page: async ({ page, firstVisit }, use) => {
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
    await use(page);
  },
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
