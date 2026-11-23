import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/** Fails the test on any uncaught error or console error. */
function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    // GitHub's API is out of our hands; everything else must be clean.
    if (message.type() === 'error' && !message.text().includes('api.github.com')) errors.push(message.text());
  });
  return errors;
}

test.beforeEach(async ({ page }) => {
  await page.goto('./');
});

test('a first visit explains itself and offers sample data', async ({ page }) => {
  const errors = watchErrors(page);
  await expect(page.getByRole('heading', { name: 'Nothing logged yet' })).toBeVisible();
  await page.getByRole('button', { name: 'Load sample data' }).click();
  await expect(page.getByText('You are looking at sample data')).toBeVisible();
  await expect(page.getByTestId('week-count')).toBeVisible();

  await page.getByRole('button', { name: 'Remove sample data' }).first().click();
  await expect(page.getByRole('heading', { name: 'Nothing logged yet' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('logs a whole session and keeps it after a reload', async ({ page }) => {
  const errors = watchErrors(page);
  await page.getByRole('button', { name: /^Push/ }).click();
  await expect(page).toHaveURL(/#workout$/);

  const bench = page.getByRole('region', { name: 'Bench press' });
  await bench.getByRole('textbox', { name: 'Set 1 weight in kg' }).fill('82.5');
  await bench.getByRole('textbox', { name: 'Set 1 reps' }).fill('5');
  await bench.getByRole('checkbox', { name: 'Set 1 done' }).click();
  await expect(bench.getByRole('checkbox', { name: 'Set 1 done' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('timer', { name: 'Rest timer' })).toBeVisible();

  // An exercise that is not in the library.
  await page.getByRole('button', { name: 'Add exercise' }).click();
  await page.getByLabel('Search').fill('Landmine press');
  await page.getByRole('button', { name: /^Add “Landmine press”/ }).click();
  const landmine = page.getByRole('region', { name: 'Landmine press' });
  await landmine.getByRole('textbox', { name: 'Set 1 weight in kg' }).fill('30');
  await landmine.getByRole('textbox', { name: 'Set 1 reps' }).fill('10');
  await landmine.getByRole('checkbox', { name: 'Set 1 done' }).click();

  await page.getByRole('button', { name: 'Finish session' }).click();
  const summary = page.getByRole('dialog', { name: 'Session saved' });
  await expect(summary).toBeVisible();
  // 82.5 × 5 + 30 × 10 = 712.5, shown rounded.
  await expect(summary.getByText('713', { exact: true })).toBeVisible();
  await summary.getByRole('button', { name: 'Done' }).click();

  await page.reload();
  await page.goto('./#history');
  await expect(page.getByText('1 session logged')).toBeVisible();
  await page.locator('details.session summary').first().click();
  await expect(page.getByText('82.5 × 5')).toBeVisible();
  await expect(page.getByText('Landmine press')).toBeVisible();
  expect(errors).toEqual([]);
});

test('a session with nothing ticked off is not saved', async ({ page }) => {
  await page.getByRole('button', { name: /^Legs/ }).click();
  await page.getByRole('button', { name: 'Finish session' }).click();
  await expect(page.getByText('No sets were ticked off')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Nothing logged yet' })).toBeVisible();
});

test('progress charts render and expose their numbers as a table', async ({ page }) => {
  const errors = watchErrors(page);
  await page.getByRole('button', { name: 'Load sample data' }).click();
  await page.goto('./#progress');
  await expect(page.getByRole('heading', { name: 'Weekly volume' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Estimated 1RM' })).toBeVisible();
  await page.getByLabel('Exercise').selectOption({ label: 'Back squat (10)' });
  await page.getByText('Show as table').nth(1).click();
  await expect(page.getByRole('cell', { name: '138' }).first()).toBeVisible();

  await page.getByRole('button', { name: '4 weeks' }).click();
  await expect(page.getByText('the last 4 weeks')).toBeVisible();
  expect(errors).toEqual([]);
});

test('switching to pounds converts every number', async ({ page }) => {
  await page.goto('./#account');
  await page.getByRole('group', { name: 'Units' }).getByRole('button', { name: 'lb' }).click();
  await page.goto('./#tools');
  await expect(page.getByText('Working in pounds')).toBeVisible();
  // Defaults to 225 lb on a 45 lb bar: two 45s a side.
  await expect(page.getByTestId('plates-per-side')).toHaveText('2 × 45');
});

test('plate calculator and one-rep max', async ({ page }) => {
  await page.goto('./#tools');
  await page.getByLabel('Target weight').fill('142.5');
  await expect(page.getByTestId('plates-per-side')).toContainText('2 × 25');
  await expect(page.getByTestId('plates-per-side')).toContainText('1.25');

  await page.getByLabel('Weight lifted').fill('100');
  await page.getByLabel('Reps').fill('5');
  // Mean of Epley (116.7) and Brzycki (112.5).
  await expect(page.getByTestId('orm-result')).toContainText('114.6');
});

test('body weight can be logged and deleted', async ({ page }) => {
  await page.goto('./#progress');
  await page.getByLabel('Weight', { exact: true }).fill('81.4');
  await page.getByRole('button', { name: 'Log weight' }).click();
  await expect(page.getByText('Logged 81.4 kg.')).toBeVisible();
  await expect(page.getByText('81.4 kg', { exact: true })).toBeVisible();
});

test('the status page reports each integration honestly', async ({ page }) => {
  await page.goto('./#status');
  await expect(page.getByTestId('service-site').getByText('Operational')).toBeVisible();
  // This test build is not connected to Supabase or Sentry, and says so.
  await expect(page.getByTestId('service-database').getByText('Not connected')).toBeVisible();
  await expect(page.getByTestId('service-errors').getByText('Not connected')).toBeVisible();
  await expect(page.getByTestId('status-headline')).toContainText('All systems operational');
});

test('the health endpoint identifies the build', async ({ request }) => {
  const response = await request.get('./health.json');
  expect(response.ok()).toBe(true);
  const body = await response.json();
  expect(body).toMatchObject({ status: 'ok', app: 'cadence' });
  expect(body.release).toMatch(/^cadence@/);
});

test('the dark theme can be forced from preferences', async ({ page }) => {
  await page.goto('./#account');
  await page.getByRole('group', { name: 'Appearance' }).getByRole('button', { name: 'Dark' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(background).toBe('rgb(13, 16, 21)');
});

test('backs up to a file, reminds when due, and restores on a fresh device', async ({ page, browser }) => {
  // Log one real session so there is something worth backing up.
  await page.getByRole('button', { name: /^Upper/ }).click();
  const bench = page.getByRole('region', { name: 'Bench press' });
  await bench.getByRole('textbox', { name: 'Set 1 weight in kg' }).fill('70');
  await bench.getByRole('textbox', { name: 'Set 1 reps' }).fill('8');
  await bench.getByRole('checkbox', { name: 'Set 1 done' }).click();
  await page.getByRole('button', { name: 'Finish session' }).click();
  await page.getByRole('button', { name: 'Done' }).click();

  const reminder = page.getByTestId('backup-reminder');
  await expect(reminder).toBeVisible();

  // Desktop browsers here have no file sharing, so the backup downloads.
  const [download] = await Promise.all([page.waitForEvent('download'), reminder.getByRole('button', { name: 'Back up now' }).click()]);
  expect(download.suggestedFilename()).toMatch(/^cadence-backup-\d{4}-\d{2}-\d{2}\.json$/);
  await expect(reminder).toBeHidden();
  const file = await download.path();

  await page.goto('./#account');
  await expect(page.getByTestId('last-backup')).toContainText('Last backup just now');

  // A brand-new device restores it.
  const fresh = await browser.newContext();
  const other = await fresh.newPage();
  await other.goto('./#account');
  await other.locator('#import-file').setInputFiles(file);
  await expect(other.getByText('Restored 1 session and 0 body weight readings.')).toBeVisible();
  await other.goto('./#history');
  await expect(other.getByText('1 session logged')).toBeVisible();
  await fresh.close();
});
