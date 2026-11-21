import { expect, test } from './fixtures.ts';

const summary = (page: import('@playwright/test').Page) =>
  page.locator('.summary').getByRole('listitem');

test.describe('plan builder', () => {
  test('builds a plan by tapping the options', async ({ page }) => {
    await page.goto('/?level=one-customer');
    const builder = page.getByRole('region', { name: 'Your plan' });
    await builder.getByRole('radio', { name: 'customers', exact: true }).click();
    await builder.getByRole('radio', { name: 'Index scan on customers_name_idx (name)' }).click();
    // orders is the only table left, so it is chosen already.
    const next = builder.getByRole('group', { name: 'Which table do you join to it?' });
    await expect(next.getByRole('radio', { name: 'orders', exact: true })).toBeChecked();
    await builder
      .getByRole('radio', { name: 'Index nested loop through orders_customer_id_idx' })
      .click();
    await expect(summary(page)).toHaveText([
      'Read customers through customers_name_idx.',
      'Join orders with an index nested loop through orders_customer_id_idx.',
    ]);
  });

  test('builds a plan with the keyboard only', async ({ page, browserName }) => {
    // Safari moves the focus to radio buttons with Option-Tab.
    const tab = browserName === 'webkit' ? 'Alt+Tab' : 'Tab';
    await page.goto('/?level=in-order');
    await expect(page.getByRole('heading', { name: 'Your plan' })).toBeVisible();
    // The practice banner's link and the How to play button come first.
    await page.keyboard.press(tab);
    await expect(page.getByRole('link', { name: 'Play today’s puzzle' })).toBeFocused();
    await page.keyboard.press(tab);
    await expect(page.getByRole('button', { name: 'How to play' })).toBeFocused();
    await page.keyboard.press(tab);
    await expect(page.getByRole('radio', { name: 'orders', exact: true })).toBeFocused();
    await page.keyboard.press('Space');
    await page.keyboard.press(tab);
    await expect(page.getByRole('radio', { name: 'Seq scan' })).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(
      page.getByRole('radio', { name: 'Index scan on orders_pkey (order_id)' }),
    ).toBeChecked();
    await page.keyboard.press(tab); // the only next table, parcels, is checked
    await page.keyboard.press(tab);
    await expect(page.getByRole('radio', { name: 'Hash join' })).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('radio', { name: 'Merge join' })).toBeChecked();
    await page.keyboard.press(tab);
    await page.keyboard.press('Space');
    await expect(summary(page)).toHaveText([
      'Read orders through orders_pkey.',
      'Join parcels with a merge join, reading it with a seq scan.',
    ]);
  });
});
