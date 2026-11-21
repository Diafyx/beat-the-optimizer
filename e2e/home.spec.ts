import { readdirSync } from 'node:fs';
import { expect, test } from './fixtures.ts';

const levels = readdirSync('levels')
  .filter((name) => name.endsWith('.json'))
  .map((name) => name.replace(/\.json$/, ''));

test.describe('app shell', () => {
  test('shows the first level by default', async ({ page }) => {
    await page.goto('/');
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
    await page.getByRole('link', { name: 'Play the first level' }).click();
    await expect(page.getByRole('heading', { level: 2 })).toHaveText('Needle');
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
