/**
 * 320 px viewport check: no overflow, card fits, no runtime errors.
 * Requires the server on http://localhost:12000.
 */
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({
  viewport: { width: 320, height: 568 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto('http://localhost:12000/', { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.HITSTER?.state?.songs?.length > 1000);
await page.waitForTimeout(700);

const info = await page.evaluate(() => ({
  scrollWidth: document.documentElement.scrollWidth,
  innerWidth,
  topbarHeight: document.querySelector('.topbar').getBoundingClientRect().height,
  card: document.querySelector('#card').getBoundingClientRect().toJSON(),
}));
assert.ok(info.scrollWidth <= info.innerWidth + 1, JSON.stringify(info));
assert.ok(info.card.width <= info.innerWidth, JSON.stringify(info));
assert.ok(info.topbarHeight < 100, JSON.stringify(info));
assert.deepEqual(errors, []);
await page.locator('#flipBtn').tap();
await page.waitForTimeout(900);
assert.equal(await page.locator('#card').getAttribute('data-flipped'), 'true');
assert.deepEqual(errors, []);
console.log('✅ 320 px: no overflow, card fits, flip works, no errors');
await browser.close();
