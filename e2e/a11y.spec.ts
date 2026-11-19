import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './fixtures.ts';

// The accessibility gate: no serious or critical axe violations against
// WCAG 2.2 A and AA. Minor and moderate ones are attached to the report.
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

test.describe('accessibility @a11y', () => {
  test('home page has no serious or critical violations', async ({ page }, testInfo) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    await testInfo.attach('axe-violations.json', {
      body: JSON.stringify(violations, null, 2),
      contentType: 'application/json',
    });
    const blocking = violations
      .filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .map(
        (v) => `${String(v.impact)}: ${v.id} (${v.help}) on ${String(v.nodes.length)} element(s)`,
      );
    expect(blocking).toEqual([]);
  });
});
