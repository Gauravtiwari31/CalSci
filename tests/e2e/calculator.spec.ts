import { expect, test, type Page } from '@playwright/test';

const press = async (page: Page, ...keys: string[]) => {
  for (const k of keys) await page.locator(`.keypad >> nth=0 >> [data-key="${k}"]`).click();
};
const lastEntry = (page: Page) => page.getByTestId('tape-entry').last();
const typeLatex = async (page: Page, latex: string) => {
  await page.getByTestId('mathfield').evaluate((el: any, l) => {
    el.setValue(l);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, latex);
};

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Tap a result to reuse it.', { exact: false })).toBeVisible();
});

test('key sequence produces a tape entry and live preview', async ({ page }) => {
  await press(page, 'd1', 'd2', 'mul', 'd3');
  await expect(page.locator('.preview')).toContainText('36');
  await press(page, 'eq');
  await expect(lastEntry(page).locator('.entry__result')).toContainText('36');
  await expect(page.getByTestId('tape-entry')).toHaveCount(1);
});

test('Ans chains results', async ({ page }) => {
  await press(page, 'd7', 'add', 'd3', 'eq');
  await press(page, 'ans', 'mul', 'd2', 'eq');
  await expect(lastEntry(page).locator('.entry__result')).toContainText('20');
});

test('exact form first, approximate beneath', async ({ page }) => {
  await typeLatex(page, '\\frac{\\sqrt{2}}{2}');
  await press(page, 'eq');
  await expect(lastEntry(page).locator('.entry__approx')).toContainText('0.707106781187');
});

test('angle mode toggles', async ({ page }) => {
  await expect(page.getByTestId('angle-mode')).toContainText('DEG');
  await typeLatex(page, '\\sin(30)');
  await press(page, 'eq');
  await expect(lastEntry(page).locator('.entry__approx')).toContainText('0.5');
  await page.getByTestId('angle-mode').click();
  await expect(page.getByTestId('angle-mode')).toContainText('RAD');
});

test('errors say what happened and keep the input', async ({ page }) => {
  await typeLatex(page, '\\frac{1}{0}');
  await press(page, 'eq');
  await expect(page.getByRole('alert')).toHaveText("Can't divide by zero");
  await expect(page.getByTestId('tape-entry')).toHaveCount(0);
});

test('history survives a reload (IndexedDB)', async ({ page }) => {
  await press(page, 'd4', 'd2', 'eq');
  await expect(lastEntry(page)).toContainText('42');
  await page.reload();
  await expect(lastEntry(page)).toContainText('42');
});

test('unit and currency conversion', async ({ page }) => {
  await typeLatex(page, '5\\,\\mathrm{km}\\operatorname{to}\\mathrm{mi}');
  await press(page, 'eq');
  await expect(lastEntry(page)).toContainText('3.10685596119');
  await typeLatex(page, '2500\\,\\mathrm{INR}\\operatorname{to}\\mathrm{USD}');
  await press(page, 'eq');
  await expect(lastEntry(page)).toContainText('Rates');
});

test('finance form puts its result on the tape', async ({ page }) => {
  await page.getByRole('tab', { name: 'Finance' }).click();
  await press(page, 'tvm');
  await page.getByRole('button', { name: 'Calculate' }).click();
  await expect(lastEntry(page)).toContainText('1,798.65');
});

test('symbolic integral loads SymPy once, then works offline', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'service worker offline check runs on Chromium');
  // Make sure the service worker controls the page so Pyodide is cached on first use.
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

  await typeLatex(page, '\\int x^2\\sin(x)\\,\\mathrm{d}x');
  await press(page, 'eq');
  await expect(lastEntry(page).locator('.entry__result')).toContainText('cos', { timeout: 60_000 });

  await context.setOffline(true);
  await page.reload();
  await typeLatex(page, '\\lim_{x\\to0}\\frac{\\sin x}{x}');
  await press(page, 'eq');
  await expect(lastEntry(page).locator('.entry__result')).toHaveText(/^\s*1\s*$/, { timeout: 60_000 });
  await typeLatex(page, '2x+3=7');
  await press(page, 'eq');
  await expect(lastEntry(page).locator('.entry__result')).toContainText('x=2');
  await context.setOffline(false);
});

test('every key has an accessible name', async ({ page }) => {
  const unnamed = await page
    .locator('.key')
    .evaluateAll((keys) => keys.filter((k) => !k.getAttribute('aria-label')).length);
  expect(unnamed).toBe(0);
});

test('converter panel: units, swap and currency', async ({ page }) => {
  await page.getByRole('tab', { name: 'Convert' }).click();
  await page.getByTestId('convert-amount').fill('5');
  await expect(page.getByTestId('convert-result')).toContainText('3.10685596119');
  await page.getByRole('button', { name: 'Swap units' }).click();
  await expect(page.getByTestId('convert-result')).toContainText('8.04672');
  await page.getByRole('tab', { name: 'Temperature' }).click();
  await page.getByTestId('convert-amount').fill('100');
  await expect(page.getByTestId('convert-result')).toContainText('212');

  await page.getByRole('button', { name: 'Currency' }).click();
  await page.getByTestId('convert-amount').fill('2500');
  await page.getByTestId('convert-from').selectOption('INR');
  await page.getByTestId('convert-to').selectOption('USD');
  await expect(page.getByTestId('convert-result')).toContainText(/\d+\.\d\dUSD/);
  await page.getByRole('button', { name: /Save to history/ }).click();
  await expect(lastEntry(page)).toContainText('Rates');
  await expect(lastEntry(page)).toContainText('USD');
});

test('conversion typed with the keypad keys (MathLive serialization)', async ({ page }) => {
  await press(page, 'd5');
  await page.getByRole('tab', { name: 'Convert' }).click();
  await page.getByRole('button', { name: 'Use in expression' }).click();
  // "Use in expression" fills 1 km → mi; replace with keypad typing to exercise real serialization.
  await page.getByTestId('mathfield').evaluate((el: any) => {
    el.setValue('5');
    el.executeCommand('moveToMathfieldEnd');
    el.insert('\\,{\\mathrm{km}}', { format: 'latex', selectionMode: 'after' });
    el.insert('\\operatorname{to}', { format: 'latex', selectionMode: 'after' });
    el.insert('\\,{\\mathrm{mi}}', { format: 'latex', selectionMode: 'after' });
  });
  await press(page, 'eq');
  await expect(lastEntry(page).locator('.entry__result')).toContainText('3.10685596119');
});
