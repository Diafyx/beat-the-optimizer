import { expect, test } from './fixtures.ts';

test.describe('home page', () => {
  test('shows the title and the placeholder', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle('Beat the Optimizer');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Beat the Optimizer');
    await expect(page.getByText('A daily join-order puzzle.')).toBeVisible();
  });

  test('fits the viewport without horizontal scrolling', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
