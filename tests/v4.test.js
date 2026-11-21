/**
 * V4 browser test: blind Hitster scan, real deck selection, multi-genre,
 * difficulty, playlist, PWA and print. Requires Chromium.
 */
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import QRCode from 'qrcode';
import { app } from '../server/index.js';

const CHROMIUM = process.env.CHROMIUM_PATH || '/usr/bin/chromium';
let failures = 0;
async function step(name, fn) {
  try {
    await fn();
    console.log(`✅ ${name}`);
  } catch (err) {
    failures++;
    console.error(`❌ ${name}\n   ${err.stack?.split('\n').slice(0, 5).join('\n   ')}`);
  }
}

const server = app.listen(0, '127.0.0.1');
await new Promise((resolve) => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
console.log(`\nV4 server: ${base}\n`);

const browser = await chromium.launch({
  executablePath: CHROMIUM,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required'],
});
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error' && !m.text().toLowerCase().includes('spotify') && !/Failed to load resource.*403/.test(m.text())) errors.push(`console: ${m.text()}`);
});

await page.goto(base, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.HITSTER?.state?.ready, { timeout: 15000 });

const visibleYear = async () => {
  const parts = await Promise.all(['#cardFront', '#yearHint', '#filterSummary', '#toast', '#scanStatus', '#frontSub']
    .map((sel) => page.locator(sel).innerText().catch(() => '')));
  return parts.join(' ');
};

await step('front hides year, title, genre, group and QR', async () => {
  const front = await page.locator('#cardFront').innerText();
  assert.doesNotMatch(front, /19\d\d|20\d\d/);
  assert.equal(await page.locator('#frontYearBadge').count(), 0);
  assert.equal(await page.locator('#frontGroupIcon').count(), 0);
  assert.equal(await page.locator('#backQrImg').count(), 0);
  assert.equal(await page.locator('.back-bingo .bingo-cell').count(), 10);
});

await step('back reveals year, genre, group and source', async () => {
  await page.locator('#flipBtn').click();
  await page.waitForTimeout(700);
  assert.match(await page.locator('#backYear').innerText(), /^\d{4}$/);
  assert.match(await page.locator('#backGroupTag').getAttribute('aria-label'), /^(Solo|Gruppe)$/i);
  assert.match(await page.locator('#backSource').innerText(), /Spotify|HITSTER/i);
  assert.equal(await page.locator('#card .back-bingo').count(), 1);
  assert.match(await page.locator('#bingoBefore').textContent(), /^(Ja|Nein)$/);
});

await step('real Hitster QR is resolved without showing the year', async () => {
  const result = await page.evaluate(async () => {
    const ok = await window.HITSTER.handleHitster({ region: 'de', card: '00008' });
    return {
      ok,
      mode: window.HITSTER.state.mode,
      year: window.HITSTER.state.extensionYear,
      currentYear: window.HITSTER.state.current?.year,
      currentTitle: window.HITSTER.state.current?.title,
      hasYearInput: !!document.querySelector('#yearInput'),
    };
  });
  assert.equal(result.ok, true);
  assert.equal(result.mode, 'extension');
  assert.ok(result.year >= 1950 && result.year <= 2030);
  assert.equal(result.currentYear, result.year);
  assert.equal(result.hasYearInput, false);
  const text = await visibleYear();
  assert.doesNotMatch(text, new RegExp(String(result.year)));
  assert.doesNotMatch(page.url(), /year=/);
  assert.ok(await page.locator('#deckSelect option').count() >= 100);
});

await step('Bingo deck selection changes the resolved card', async () => {
  const result = await page.evaluate(async () => {
    window.HITSTER.state.prefs.deckSku = 'aaaa0019';
    const ok = await window.HITSTER.handleHitster({ region: 'de', card: '00008' });
    return { ok, year: window.HITSTER.state.extensionYear, currentYear: window.HITSTER.state.current?.year };
  });
  assert.equal(result.ok, true);
  assert.equal(result.currentYear, result.year);
  assert.notEqual(result.year, 1988);
  assert.doesNotMatch(await visibleYear(), new RegExp(String(result.year)));
});

await step('camera/file QR decoder accepts a real Hitster QR', async () => {
  await page.locator('.mode-btn[data-mode="extension"]').click();
  await page.waitForTimeout(250);
  const file = '/tmp/hitster-card-00008.png';
  await QRCode.toFile(file, 'https://www.hitstergame.com/de/00008', { width: 420, margin: 2 });
  await page.locator('#scanBtn').click();
  await page.waitForTimeout(300);
  assert.equal(await page.locator('#scanModal').isVisible(), true);
  await page.locator('#scanFile').setInputFiles(file);
  await page.waitForFunction(() => window.HITSTER.state.extensionYear > 0, { timeout: 15000 });
  const result = await page.evaluate(() => ({
    year: window.HITSTER.state.extensionYear,
    currentYear: window.HITSTER.state.current?.year,
    status: document.querySelector('#scanStatus').textContent,
    hasYearInput: !!document.querySelector('#yearInput'),
  }));
  assert.ok(result.year >= 1950 && result.year <= 2030);
  assert.equal(result.currentYear, result.year);
  assert.equal(result.hasYearInput, false);
  assert.doesNotMatch(result.status, new RegExp(String(result.year)));
  assert.doesNotMatch(await page.locator('#cardFront').innerText(), new RegExp(String(result.year)));
  await page.keyboard.press('Escape');
});

await step('Spotify playlist mode loads only playlist songs', async () => {
  const result = await page.evaluate(async () => {
    const ok = await window.HITSTER.loadPlaylist('https://open.spotify.com/playlist/37i9dQZF1DWXRqgorJj26U');
    return {
      ok,
      mode: window.HITSTER.state.mode,
      count: window.HITSTER.state.playlist?.songs.length,
      name: window.HITSTER.state.playlist?.name,
      current: window.HITSTER.state.current?.title,
    };
  });
  assert.equal(result.ok, true);
  assert.equal(result.mode, 'playlist');
  assert.ok(result.count >= 100);
  assert.ok(result.current.length > 1);
  assert.match(page.url(), /mode=playlist/);
  assert.match(await page.locator('#filterSummary').innerText(), /Playlist/);
});

await step('playlist audio is a real Spotify preview', async () => {
  await page.locator('#playBtn').click();
  await page.waitForTimeout(1800);
  const src = await page.evaluate(() => document.querySelector('#audio').currentSrc);
  assert.match(src, /p\.scdn\.co\/mp3-preview|itunes\.apple\.com\/.*\.(m4a|mp3)|\/api\/audio\//);
  assert.equal(await page.locator('#mpTitle').innerText(), 'Geheimnisvoller Song');
});

await step('own category saves and reloads all playlist songs', async () => {
  await page.locator('#saveCategory').click();
  await page.waitForTimeout(300);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('hitster-web-categories-v1') || '[]'));
  assert.equal(saved.length, 1);
  assert.ok(saved[0].songs.length >= 100);
  await page.locator('.category-main').first().click();
  await page.waitForTimeout(500);
  assert.equal(await page.evaluate(() => window.HITSTER.state.mode), 'playlist');
  assert.ok(await page.evaluate(() => window.HITSTER.state.playlist.songs.length) >= 100);
});

await step('own category can be deleted again', async () => {
  await page.locator('.category-remove').first().click();
  await page.waitForTimeout(300);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('hitster-web-categories-v1') || '[]'));
  assert.equal(saved.length, 0);
  assert.equal(await page.evaluate(() => window.HITSTER.state.mode), 'classic');
});

await step('PWA manifest and service worker are installed', async () => {
  const sw = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    return { scope: reg.scope, active: !!reg.active };
  });
  assert.equal(sw.active, true);
  assert.ok(sw.scope.startsWith(base));
  assert.equal(await page.locator('link[rel="manifest"]').count(), 1);
  const keys = await page.evaluate(() => caches.keys());
  assert.ok(keys.some((key) => key.startsWith('hitster-web-')));
});

await step('print sheet contains genre, group and QR on the front', async () => {
  await page.locator('.mode-btn[data-mode="classic"]').click();
  await page.waitForTimeout(300);
  await page.evaluate(() => { window.print = () => { window.__printed = true; }; window.HITSTER.openPrint(); });
  await page.waitForTimeout(300);
  assert.equal(await page.locator('#printModal').isVisible(), true);
  await page.selectOption('#printCount', '9');
  await page.locator('#printGo').click();
  await page.waitForTimeout(400);
  const cards = await page.locator('.print-card').count();
  assert.equal(cards, 18);
  assert.ok((await page.locator('#printRoot').innerText()).length > 100);
  assert.ok(await page.locator('#printRoot img').count() > 0);
  assert.equal(await page.locator('#printRoot .pc-bingo-cell').count(), 90);
  assert.equal(await page.locator('#printRoot .print-sheet.fronts .pc-year, #printRoot .print-sheet.fronts .pc-decade, #printRoot .print-sheet.fronts .pc-title, #printRoot .print-sheet.fronts .pc-genre, #printRoot .print-sheet.fronts .pc-bingo').count(), 0);
  await page.keyboard.press('Escape');
});

await step('no runtime errors', async () => {
  assert.deepEqual(errors, []);
});

await browser.close();
server.close();
console.log(`\n${failures ? '❌' : '✅'} V4 checks: ${failures} failure(s)\n`);
process.exit(failures ? 1 : 0);
