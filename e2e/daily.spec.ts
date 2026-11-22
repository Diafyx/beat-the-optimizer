import { LAUNCH_NOON, expect, test } from './fixtures.ts';

const dayAfter = (days: number): Date => new Date(LAUNCH_NOON.getTime() + days * 86_400_000);

test.describe('daily puzzle', () => {
  test('rotates through the levels by date', async ({ page }) => {
    await page.clock.setFixedTime(dayAfter(2));
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 2 })).toHaveText('Haystack');
    await expect(page.getByText('Puzzle #3 · Thursday, December 3, 2026')).toBeVisible();
  });

  test('keeps the runs and the streak across a reload', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.clock.setFixedTime(LAUNCH_NOON);
    await page.goto('/');
    await page.getByRole('button', { name: /Seq scan/ }).click();
    await page.getByRole('button', { name: /^Race/ }).click();
    await expect(page.getByText('Streak: 1 day')).toBeVisible();
    await page.reload();
    await page.getByRole('button', { name: /Seq scan/ }).click();
    await expect(page.getByText('3 of 4 runs left.')).toBeVisible();
    await expect(page.getByText('Streak: 1 day')).toBeVisible();
  });

  test('practice levels do not count', async ({ page }) => {
    await page.goto('/?level=needle');
    await expect(page.getByText('Practice: this is not today’s puzzle')).toBeVisible();
  });
});

test.describe('first visit', () => {
  test.use({ firstVisit: true });

  test('explains the game once, then from the How it works button', async ({ page }) => {
    await page.goto('/');
    const dialog = page.getByRole('dialog', { name: 'How it works' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading', { name: 'Every query needs a plan' })).toBeVisible();
    await dialog.getByRole('button', { name: 'Next' }).click();
    await expect(dialog.getByRole('heading', { name: 'Meet the Optimizer' })).toBeVisible();
    await dialog.getByRole('button', { name: 'Back' }).click();
    await expect(dialog.getByRole('heading', { name: 'Every query needs a plan' })).toBeVisible();
    await dialog.getByRole('button', { name: 'Next' }).click();
    await dialog.getByRole('button', { name: 'Next' }).click();
    await expect(dialog.getByRole('heading', { name: 'Your turn' })).toBeVisible();
    await dialog.getByRole('button', { name: 'Let’s race' }).click();
    await expect(dialog).toBeHidden();
    await page.reload();
    await expect(page.getByRole('heading', { level: 2 })).toBeVisible();
    await expect(dialog).toBeHidden();
    await page.getByRole('button', { name: 'How it works' }).click();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading', { name: 'Every query needs a plan' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });

  test('works with storage disabled', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', {
        get() {
          throw new DOMException('The operation is insecure.', 'SecurityError');
        },
      });
    });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/?level=haystack');
    await page.getByRole('button', { name: 'Skip' }).click();
    await page.getByRole('button', { name: /Seq scan/ }).click();
    await page.getByRole('button', { name: /^Race/ }).click();
    await expect(page.getByText('A tie.')).toBeVisible();
  });
});
