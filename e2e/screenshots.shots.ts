// The README screenshots and the link preview, taken the same way each time
// (npm run screenshots, playwright.screenshots.config.ts).
import { test } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import { KEY } from '../src/progress.ts';

test.beforeEach(async ({ page }) => {
  // A returning player, on a fixed day, with no animation to wait for.
  await page.addInitScript((key) => {
    localStorage.setItem(
      key,
      JSON.stringify({ tutorialSeen: true, puzzles: {}, streak: { last: 0, days: 0 } }),
    );
  }, KEY);
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test('the first question, with the Optimizer’s guess', async ({ page }) => {
  // Puzzle #9, Belt and braces: the Optimizer guesses 10 rows; there are 10,000.
  await page.clock.setFixedTime(new Date('2026-12-01T12:00:00'));
  await page.goto('/');
  // Both answers, the guess included, clear of the bar at the bottom.
  await page.evaluate(() => {
    const answers = document.querySelector('.answers')?.getBoundingClientRect();
    window.scrollBy(0, (answers?.bottom ?? 0) - window.innerHeight + 120);
  });
  await page.screenshot({ path: 'docs/images/level.png' });
});

test('the result of a race, with a yellow flag', async ({ page }) => {
  // Puzzle #10, Last night's migration: reading every row is the perfect plan.
  await page.clock.setFixedTime(new Date('2026-12-02T12:00:00'));
  await page.goto('/');
  await page.getByRole('button', { name: /Seq scan/ }).click();
  await page.getByRole('button', { name: /^Race/ }).click();
  await page.locator('.result .costs').waitFor();
  // The bar at the bottom would cover the result in a screenshot of it.
  await page.addStyleTag({ content: '.run-controls { display: none !important; }' });
  await page.locator('.run').screenshot({ path: 'docs/images/result.png' });
});

test('the link preview', async ({ browser }) => {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1,
  });
  await page.goto(pathToFileURL('e2e/og-image.html').href);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: 'public/og-image.png' });
  await page.close();
});
