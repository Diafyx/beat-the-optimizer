import { readdirSync } from 'node:fs';
import { expect, playToReview, test } from './fixtures.ts';

const levels = readdirSync('levels')
  .filter((name) => name.endsWith('.json'))
  .map((name) => name.replace(/\.json$/, ''));

const summary = (page: import('@playwright/test').Page) =>
  page.locator('.summary').getByRole('listitem');

const title = (page: import('@playwright/test').Page) => page.locator('#builder-title');

test.describe('plan builder', () => {
  test('builds a plan one question at a time', async ({ page }) => {
    await page.goto('/?level=one-customer');
    await expect(title(page)).toHaveText('Which table do you start with?');
    const customers = page.getByRole('button', { name: /^customers/ });
    await expect(customers).toContainText('The Optimizer guesses 1 row match');
    await customers.click();
    await expect(title(page)).toHaveText('How do you read customers?');
    await page.getByRole('button', { name: /Index scan on customers_name_idx/ }).click();
    // orders is the only table left, so the next question is how to join it.
    await expect(title(page)).toHaveText('How do you join orders?');
    await page.getByRole('button', { name: /^Look each one up/ }).click();
    await expect(title(page)).toHaveText('Your plan');
    await expect(summary(page)).toHaveText([
      'Jump into customers by name Index scan on customers_name_idx',
      'Join orders: look each one up Index nested loop through orders_customer_id_idx',
    ]);
    await expect(page.getByRole('button', { name: 'Run your plan' })).toBeVisible();

    await page.getByRole('button', { name: 'Change your plan' }).click();
    await expect(title(page)).toHaveText('How do you join orders?');
    await expect(page.getByRole('button', { name: 'Run your plan' })).toBeHidden();
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(title(page)).toHaveText('How do you read customers?');
  });

  test('builds a plan with the keyboard only', async ({ page, browserName }) => {
    // Safari moves the focus to buttons with Option-Tab.
    const tab = browserName === 'webkit' ? 'Alt+Tab' : 'Tab';
    await page.goto('/?level=in-order');
    await page.getByRole('button', { name: /^orders/ }).focus();
    await page.keyboard.press('Enter');
    // Each new question takes the focus, so a screen reader reads it first.
    await expect(title(page)).toHaveText('How do you read orders?');
    await expect(title(page)).toBeFocused();
    await page.keyboard.press(tab);
    await page.keyboard.press(tab);
    await expect(page.getByRole('button', { name: /^Jump to rows by order_id/ })).toBeFocused();
    await page.keyboard.press('Space');
    await expect(title(page)).toHaveText('How do you join parcels?');
    for (let i = 0; i < 3; i += 1) await page.keyboard.press(tab);
    await expect(page.getByRole('button', { name: /^Sort both sides and zip them/ })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(title(page)).toHaveText('How do you read parcels?');
    await page.keyboard.press(tab);
    await page.keyboard.press('Enter');
    await expect(summary(page)).toHaveText([
      'Jump into orders by order_id Index scan on orders_pkey',
      'Join parcels: sort both sides and zip them Merge join',
      'Read every row of parcels Seq scan',
    ]);
  });

  for (const id of levels) {
    test(`plays ${id} to the review without scrolling sideways`, async ({ page }) => {
      await page.goto(`/?level=${id}`);
      const wide = (): Promise<boolean> =>
        page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      expect(await wide()).toBe(false);
      await playToReview(page);
      expect(await wide()).toBe(false);
    });
  }
});
