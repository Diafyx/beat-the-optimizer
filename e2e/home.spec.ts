import { readdirSync } from 'node:fs';
import { LAUNCH_NOON, expect, test } from './fixtures.ts';

const levels = readdirSync('levels')
  .filter((name) => name.endsWith('.json'))
  .map((name) => name.replace(/\.json$/, ''));

test.describe('app shell', () => {
  test('shows today’s puzzle by default', async ({ page }) => {
    await page.clock.setFixedTime(LAUNCH_NOON);
    await page.goto('/');
    await expect(
      page.getByText('Puzzle #1 · Tuesday, December 1, 2026 · Streak: 0 days'),
    ).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Beat the Optimizer');
    await expect(page.getByRole('heading', { level: 2 })).toHaveText('Needle');
    await expect(page).toHaveTitle('Needle · Beat the Optimizer');
    await expect(page.getByRole('heading', { name: 'The query' })).toBeVisible();
  });

  test('shows the level named in the address', async ({ page }) => {
    await page.goto('/?level=signed-copies');
    await expect(page.getByRole('heading', { level: 2 })).toHaveText('Signed copies');
    await expect(page.getByRole('heading', { level: 4 })).toHaveText([
      'customers',
      'orders',
      'order_lines',
    ]);
    await expect(page.getByRole('table', { name: 'Most common values' })).toBeVisible();
  });

  test('says so when there is no such level', async ({ page }) => {
    await page.goto('/?level=nope');
    await expect(page.getByRole('alert')).toContainText('There is no level called “nope”.');
    await page.getByRole('link', { name: 'Play today’s puzzle' }).click();
    await expect(page.getByText(/^Puzzle #\d+ · /)).toBeVisible();
  });

  test('links to the about page, which explains the scoring and links back', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'About' }).click();
    await expect(page).toHaveTitle('About · Beat the Optimizer');
    await expect(
      page.getByRole('heading', { name: "Where the cost model differs from PostgreSQL's" }),
    ).toBeVisible();
    await page.getByRole('link', { name: 'Play today’s puzzle' }).click();
    await expect(page.getByText(/^Puzzle #\d+ · /)).toBeVisible();
  });
});

test.describe('layout at 360 px', () => {
  test.use({ viewport: { width: 360, height: 780 } });

  for (const id of levels) {
    test(`${id} fits without horizontal scrolling`, async ({ page }) => {
      await page.goto(`/?level=${id}`);
      await expect(page.getByRole('heading', { level: 2 })).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }
});
