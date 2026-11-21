import { expect, test } from './fixtures.ts';

test.describe('running a plan', () => {
  test('shows the cost building up, then the result and the explanation', async ({ page }) => {
    await page.goto('/?level=haystack');
    const run = page.getByRole('button', { name: 'Run your plan' });
    await expect(run).toBeDisabled();
    await page.getByRole('radio', { name: 'Index scan on orders_status_idx (status)' }).click();
    await run.click();
    await expect(page.getByText('Your cost: 280,000')).toBeVisible();
    await expect(page.getByText("PostgreSQL's plan is cheaper.")).toBeVisible();
    const costs = page.getByRole('table', { name: 'Rows touched' }).getByRole('row');
    await expect(costs).toHaveText([
      'Your plan280,0002.8× best',
      "PostgreSQL's plan100,0001× best",
      'Best possible100,0001× best',
    ]);
    await expect(page.getByRole('heading', { name: 'What PostgreSQL did' })).toBeVisible();
    await expect(page.getByText('3 of 4 runs left.')).toBeVisible();
  });

  test('shows the result at once with reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/?level=last-nights-migration');
    await page.getByRole('radio', { name: 'Seq scan' }).click();
    await page.getByRole('button', { name: 'Run your plan' }).click();
    // No animation: the result is there without waiting for timers.
    await expect(
      page.getByText('You beat PostgreSQL! Yours is the best possible plan.'),
    ).toBeVisible({
      timeout: 200,
    });
  });

  test('allows four runs', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/?level=needle');
    await page.getByRole('radio', { name: 'Seq scan' }).click();
    const run = page.getByRole('button', { name: 'Run your plan' });
    for (let i = 0; i < 4; i += 1) await run.click();
    await expect(run).toBeDisabled();
    await expect(page.getByText('No runs left for this puzzle.')).toBeVisible();
  });
});
