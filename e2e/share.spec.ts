import { LAUNCH_NOON, expect, test } from './fixtures.ts';

declare global {
  interface Window {
    shared?: ShareData;
  }
}

test.describe('share card', () => {
  test('shares the result without the plan', async ({ page }) => {
    // A stand-in for the system share sheet, which a test cannot press.
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'share', {
        value: (data: ShareData) => {
          window.shared = data;
          return Promise.resolve();
        },
      });
    });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.clock.setFixedTime(LAUNCH_NOON);
    await page.goto('/');
    await expect(page.getByRole('region', { name: 'Share' })).toBeHidden();
    await page.getByRole('button', { name: /Seq scan/ }).click();
    await page.getByRole('button', { name: 'Run your plan' }).click();
    await page.getByRole('button', { name: 'Share your result' }).click();
    const shared = await page.evaluate(() => window.shared?.text);
    expect(shared).toBe(
      [
        'Beat the Optimizer #1',
        '🟥',
        '🐘 PostgreSQL won',
        'Me: 100,000× best · PostgreSQL: 1× best',
        new URL('/', page.url()).href,
      ].join('\n'),
    );
    await expect(page.getByRole('region', { name: 'Share' }).locator('pre')).toHaveText(
      shared ?? '',
    );
  });

  test('has link preview tags and image', async ({ page, request }) => {
    await page.goto('/');
    const image = await page.locator('meta[property="og:image"]').getAttribute('content');
    expect(image).toBe('https://beat-the-optimizer.invalid/og-image.png');
    const response = await request.get('/og-image.png');
    expect(response.ok()).toBe(true);
    expect(response.headers()['content-type']).toBe('image/png');
  });
});
