import AxeBuilder from '@axe-core/playwright';
import { readdirSync } from 'node:fs';
import type { Page, TestInfo } from '@playwright/test';
import { expect, test } from './fixtures.ts';

// The accessibility gate: no serious or critical axe violations against
// WCAG 2.2 A and AA. Minor and moderate ones are attached to the report.
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

const levels = readdirSync('levels')
  .filter((name) => name.endsWith('.json'))
  .map((name) => name.replace(/\.json$/, ''));

async function blockingViolations(page: Page, testInfo: TestInfo, name: string): Promise<string[]> {
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  await testInfo.attach(`axe-violations-${name}.json`, {
    body: JSON.stringify(violations, null, 2),
    contentType: 'application/json',
  });
  return violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${String(v.impact)}: ${v.id} (${v.help}) on ${String(v.nodes.length)} element(s)`);
}

test.describe('accessibility @a11y', () => {
  for (const colorScheme of ['light', 'dark'] as const) {
    for (const id of levels) {
      test(`${id} in the ${colorScheme} theme has no serious or critical violations`, async ({
        page,
      }, testInfo) => {
        await page.emulateMedia({ colorScheme });
        await page.goto(`/?level=${id}`);
        await expect(page.getByRole('heading', { level: 2 })).toBeVisible();
        expect(await blockingViolations(page, testInfo, `${id}-${colorScheme}`)).toEqual([]);
      });
    }
  }

  test.describe('first visit', () => {
    test.use({ firstVisit: true });

    test('the tutorial has no serious or critical violations', async ({ page }, testInfo) => {
      await page.goto('/');
      await expect(page.getByRole('dialog', { name: 'How to play' })).toBeVisible();
      expect(await blockingViolations(page, testInfo, 'tutorial')).toEqual([]);
    });
  });

  test('the unknown-level message has no serious or critical violations', async ({
    page,
  }, testInfo) => {
    await page.goto('/?level=nope');
    await expect(page.getByRole('alert')).toBeVisible();
    expect(await blockingViolations(page, testInfo, 'unknown')).toEqual([]);
  });
});
