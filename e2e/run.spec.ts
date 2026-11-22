import { expect, test } from './fixtures.ts';

test.describe('running a plan', () => {
  test('races the two plans, then shows the result and why', async ({ page }) => {
    await page.goto('/?level=haystack');
    const run = page.getByRole('button', { name: /^Race/ });
    // The run bar shows once the plan is complete.
    await expect(run).toBeHidden();
    await page.getByRole('button', { name: /Index scan on orders_status_idx/ }).click();
    await run.click();
    await expect(page.locator('.lights')).toBeVisible();
    await expect(page.getByText('The Optimizer wins.')).toBeVisible();
    const costs = page.getByRole('table', { name: 'Points: the rows each plan touches' });
    await expect(costs.getByRole('row')).toHaveText([
      'You280,0002.8× best',
      'The Optimizer100,0001× best',
      'Perfect plan100,0001× best',
    ]);
    // Why? folds away until the player opens it.
    const why = page.getByRole('heading', { name: 'What the Optimizer did' });
    await expect(why).toBeHidden();
    await page.getByText('Why?').click();
    await expect(why).toBeVisible();
    await expect(page.getByText('3 of 4 runs left.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Race again' })).toBeEnabled();
  });

  test('shows the result at once with reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/?level=last-nights-migration');
    await page.getByRole('button', { name: /Seq scan/ }).click();
    await page.getByRole('button', { name: /^Race/ }).click();
    // No animation: the result is there without waiting for timers.
    await expect(page.getByText('You beat the Optimizer! Yours is the perfect plan.')).toBeVisible({
      timeout: 200,
    });
    // The Optimizer guessed 149 rows from orders; there were 60,333.
    await expect(page.locator('.result .flag')).toHaveText(
      'Yellow flag. The Optimizer expected 149 rows from orders. It got 60,333: 405× more.',
    );
  });

  test('allows four runs', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/?level=needle');
    await page.getByRole('button', { name: /Seq scan/ }).click();
    const run = page.getByRole('button', { name: /^Race/ });
    for (let i = 0; i < 4; i += 1) await run.click();
    await expect(run).toBeDisabled();
    await expect(page.getByText('No runs left for this puzzle.')).toBeVisible();
    // The Optimizer's estimates were right here, so there is no yellow flag.
    await expect(page.locator('.result .flag')).toHaveCount(0);
  });
});
