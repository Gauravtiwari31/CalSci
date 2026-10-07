// Captures Play Store phone screenshots (1080×1920, 9:16) from the built app.
// Run after `npm run build`: node scripts/store-screenshots.mjs
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'store', 'screenshots');
await mkdir(out, { recursive: true });

const server = spawn('npx', ['vite', 'preview', '--port', '4180', '--strictPort'], { cwd: root, shell: true });
for (let i = 0; i < 60; i++) {
  const up = await fetch('http://localhost:4180/').then(
    (r) => r.ok,
    () => false,
  );
  if (up) break;
  await new Promise((r) => setTimeout(r, 500));
}

const browser = await chromium.launch();
// 360×720 CSS px at DPR 3 = 1080×2160 (1:2, Play's maximum aspect ratio).
const ctx = await browser.newContext({ viewport: { width: 360, height: 720 }, deviceScaleFactor: 3, hasTouch: true });
const page = await ctx.newPage();
await page.goto('http://localhost:4180/');
await page.evaluate(() => globalThis.indexedDB.deleteDatabase('calsci'));
await page.reload();
await page.waitForTimeout(2500);

const key = (id) => page.locator(`.keypad >> nth=0 >> [data-key="${id}"]`).click();
const run = async (latex, wait = 700) => {
  await page.getByTestId('mathfield').evaluate((el, l) => {
    el.setValue(l);
    el.dispatchEvent(new Event('input'));
  }, latex);
  await page.waitForTimeout(150);
  await key('eq');
  await page.waitForTimeout(wait);
};
const shot = async (name) => {
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(out, name) });
  console.log(`store/screenshots/${name}`);
};

await run('\\frac{\\sqrt{2}}{2}+\\frac{1}{3}');
await run('\\sin(30)');
await key('d1');
await key('d2');
await key('mul');
await key('d3');
await key('d5');
await shot('1-calculator.png');

await page.getByTestId('mathfield').evaluate((el) => el.setValue(''));
await run('\\int x^2\\sin(x)\\,\\mathrm{d}x', 15000);
await run('2x+3=7', 1500);
await page.getByTestId('mathfield').evaluate((el) => el.setValue('\\lim_{x\\to0}\\frac{\\sin x}{x}'));
await shot('2-symbolic.png');

await page.getByRole('tab', { name: 'Convert' }).click();
await page.getByTestId('convert-amount').fill('42');
await shot('3-converter.png');

await page.getByRole('tab', { name: 'Basic' }).click();
await run('\\operatorname{bscall}(100,100,1,0.05,0.2)');
await page.getByRole('tab', { name: 'Finance' }).click();
await shot('4-finance.png');

await page.emulateMedia({ colorScheme: 'dark' });
await page.getByRole('tab', { name: 'Basic' }).click();
await run('\\begin{pmatrix}2&1\\\\1&3\\end{pmatrix}^{-1}');
await page.getByRole('tab', { name: 'Functions' }).click();
await shot('5-dark.png');

await browser.close();
server.kill();
process.exit(0);
