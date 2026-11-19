import { test as base, expect } from '@playwright/test';

// Every browser test fails if the page logs a console error or throws, the
// browser-side counterpart of tests/setup/fail-on-console.ts.
export const test = base.extend<{ pageErrors: string[] }>({
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
