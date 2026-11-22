import type { Page } from '@playwright/test';
import { KEY } from '../src/progress.ts';
import { LAUNCH_NOON, expect, test } from './fixtures.ts';

// e2e/fixtures.ts blocks every analytics request and lists it in `analytics`.
// The e2e build has the GoatCounter code `e2e-test` and a Cloudflare token
// (playwright.config.ts).

/** What a GoatCounter request counts: a path, or an event's name. */
const counted = (urls: readonly URL[]): string[] =>
  urls
    .filter((url) => url.hostname === 'e2e-test.goatcounter.com')
    .map(
      (url) =>
        `${url.searchParams.get('e') === 'true' ? 'event' : 'visit'} ${url.searchParams.get('p') ?? ''}`,
    );

async function play(page: Page): Promise<void> {
  await page.getByRole('button', { name: /Seq scan/ }).click();
  await page.getByRole('button', { name: /^Race/ }).click();
  await expect(page.getByRole('region', { name: 'Share' })).toBeVisible();
}

/** Progress where the first daily puzzle was finished on `date`. */
async function finishedOn(page: Page, date: string): Promise<void> {
  await page.addInitScript(
    ({ key, firstFinish }) => {
      // Once per tab, so a reload keeps what the page saved.
      if (sessionStorage.getItem('seeded') !== null) return;
      sessionStorage.setItem('seeded', 'yes');
      localStorage.setItem(
        key,
        JSON.stringify({
          tutorialSeen: true,
          puzzles: {},
          streak: { last: 0, days: 0 },
          firstFinish,
          sent: ['first_finish'],
        }),
      );
    },
    { key: KEY, firstFinish: date },
  );
}

test.describe('analytics', () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.clock.setFixedTime(LAUNCH_NOON);
  });

  test('counts the visit and the first finish, once, without cookies', async ({
    page,
    analytics,
  }) => {
    await page.goto('/?level=needle');
    await expect(page.getByRole('heading', { level: 2 })).toBeVisible();
    await page.goto('/');
    await play(page);
    await page.reload();
    await play(page);
    await expect
      .poll(() => counted(analytics))
      .toEqual(['visit /', 'visit /', 'event first_finish', 'visit /']);
    // The visit has the path only: never the practised level.
    expect(analytics.map((url) => url.search).join(' ')).not.toContain('needle');
    expect(
      analytics.filter((url) => url.hostname === 'static.cloudflareinsights.com'),
    ).toHaveLength(3);
    expect(await page.context().cookies()).toEqual([]);
    expect(await page.evaluate(() => document.cookie)).toBe('');
  });

  test('counts a return the next day, once', async ({ page, analytics }) => {
    await finishedOn(page, '2026-11-30');
    await page.goto('/');
    await page.reload();
    await expect.poll(() => counted(analytics)).toEqual(['visit /', 'event return_d1', 'visit /']);
  });

  test('counts a return later in the first week', async ({ page, analytics }) => {
    await finishedOn(page, '2026-11-26');
    await page.goto('/');
    await expect.poll(() => counted(analytics)).toEqual(['visit /', 'event return_d2_7']);
  });

  test('sends and stores nothing with Global Privacy Control on', async ({ page, analytics }) => {
    await page.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, 'globalPrivacyControl', { get: () => true });
    });
    await page.goto('/');
    await play(page);
    await page.reload();
    await expect(page.getByRole('region', { name: 'Share' })).toBeVisible();
    expect(analytics).toEqual([]);
    const saved = await page.evaluate((key) => localStorage.getItem(key), KEY);
    expect(JSON.parse(saved ?? '{}')).toMatchObject({ firstFinish: null, sent: [] });
    expect(await page.locator('script[src*="cloudflareinsights"]').count()).toBe(0);
  });

  test('links to the privacy page, which loads under the same policy', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Privacy' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Privacy' })).toBeVisible();
    await expect(page.getByText('return_d1', { exact: true })).toBeVisible();
  });
});
