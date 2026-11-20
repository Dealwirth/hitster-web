/**
 * End-to-end browser test for HITSTER Web.
 * Run with: node tests/e2e.test.js
 * Requires Chromium. Set CHROMIUM_PATH if it is not /usr/bin/chromium.
 */
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { app } from '../server/index.js';

const CHROMIUM = process.env.CHROMIUM_PATH || '/usr/bin/chromium';
const results = [];
let failures = 0;

function step(name, fn) {
  return (async () => {
    try {
      await fn();
      results.push(`✅ ${name}`);
      console.log(`✅ ${name}`);
    } catch (err) {
      failures++;
      results.push(`❌ ${name}: ${err.message}`);
      console.error(`❌ ${name}\n   ${err.stack?.split('\n').slice(0, 4).join('\n   ')}`);
    }
  })();
}

const server = app.listen(0, '127.0.0.1');
await new Promise((resolve) => server.once('listening', resolve));
const port = server.address().port;
const base = `http://127.0.0.1:${port}`;
console.log(`\nE2E server: ${base}\n`);

const browser = await chromium.launch({
  executablePath: CHROMIUM,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required'],
});

const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const errors = [];
const audioRequests = [];
page.on('request', (r) => { if (r.url().includes('/api/audio/')) audioRequests.push(r.url()); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error' && !m.text().toLowerCase().includes('spotify')) errors.push(`console: ${m.text()}`);
});
page.on('requestfailed', (r) => {
  if (!r.url().includes('spotify') && !r.url().includes('/api/audio/') && r.failure()?.errorText !== 'net::ERR_ABORTED') errors.push(`requestfailed: ${r.url()}`);
});

await page.goto(base, { waitUntil: 'networkidle' });
await page.waitForFunction(() => document.querySelector('#catalogPill')?.textContent?.includes('Karten'), { timeout: 15000 });
await page.waitForTimeout(600);

await step('catalog loads with more than 1000 cards', async () => {
  const text = await page.locator('#catalogPill').innerText();
  const count = Number(text.replace(/\D/g, ''));
  assert.ok(count >= 1000, text);
});

await step('card shows all ten Bingo categories', async () => {
  assert.equal(await page.locator('.mini-chip').count(), 10);
  assert.equal(await page.locator('#answersA li').count(), 5);
  assert.equal(await page.locator('#answersB li').count(), 5);
  assert.equal(await page.locator('.bingo-cell').count(), 25);
});

await step('front card shows genre, number and play prompt', async () => {
  assert.ok((await page.locator('#frontGenre').innerText()).length > 1);
  assert.match(await page.locator('#frontNumber').innerText(), /^#\d{4}$/);
  assert.match(await page.locator('.card-question').innerText(), /Song/);
});

await step('no audio is downloaded before the user presses play', async () => {
  assert.equal(audioRequests.length, 0, audioRequests.join(', '));
});

await step('clicking play starts a real audio clip', async () => {
  await page.locator('#cardPlay').click();
  await page.waitForFunction(() => document.querySelector('#card')?.classList.contains('is-playing'), { timeout: 15000 });
  await page.waitForTimeout(900);
  const audio = await page.evaluate(() => {
    const a = document.querySelector('#audio');
    return { paused: a.paused, currentTime: a.currentTime, duration: a.duration, readyState: a.readyState };
  });
  assert.equal(audio.paused, false);
  assert.ok(audio.currentTime > 0.2, `currentTime=${audio.currentTime}`);
  assert.ok(audio.duration > 20 && audio.duration < 45, `duration=${audio.duration}`);
  assert.ok(audio.readyState >= 2);
  assert.ok(await page.locator('#card').evaluate((el) => el.classList.contains('is-playing')));
  assert.ok(audioRequests.length >= 1, 'no audio request after play');
});

await step('timer counts down while playing', async () => {
  const first = Number(await page.locator('#timer').innerText());
  await page.waitForTimeout(1500);
  const second = Number(await page.locator('#timer').innerText());
  assert.ok(second < first, `${first} -> ${second}`);
});

await step('flipping reveals title, artist and year', async () => {
  await page.locator('#flipBtn').click();
  await page.waitForTimeout(950);
  assert.equal(await page.locator('#card').getAttribute('data-flipped'), 'true');
  const title = await page.locator('#backTitle').innerText();
  const artist = await page.locator('#backArtist').innerText();
  const year = await page.locator('#backYear').innerText();
  assert.ok(title.length > 1, 'title');
  assert.ok(artist.length > 1, 'artist');
  assert.match(year, /^(19|20)\d\d$/);
  assert.equal(await page.locator('#cardFront').getAttribute('aria-hidden'), 'true');
  assert.equal(await page.locator('#cardBack').getAttribute('aria-hidden'), 'false');
});

await step('album artwork is requested from the server', async () => {
  const img = page.locator('#backArt img');
  await img.waitFor({ state: 'visible', timeout: 8000 });
  const src = await img.getAttribute('src');
  assert.match(src, /^\/api\/art\/s\d{4}$/);
  const natural = await img.evaluate((i) => ({ w: i.naturalWidth, h: i.naturalHeight }));
  assert.ok(natural.w > 10 && natural.h > 10, JSON.stringify(natural));
});

await step('judging a correct answer updates the statistics', async () => {
  await page.locator('#judgeRight').click();
  await page.waitForTimeout(300);
  assert.equal(await page.locator('#statCorrect').innerText(), '1');
  assert.equal(await page.locator('#statStreak').innerText(), '1');
  assert.ok(await page.locator('.confetti-layer').count() > 0);
});

await step('Bingo scorecard can be marked and is persisted', async () => {
  const cell = page.locator('.bingo-cell').first();
  await cell.click();
  await page.waitForTimeout(200);
  assert.ok(await cell.evaluate((el) => el.classList.contains('marked')));
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('hitster-web-bingo-v1') || '{}'));
  assert.equal(saved.marked.length, 1);
});

await step('help modal opens and closes with Escape', async () => {
  await page.locator('#helpBtn').click();
  await page.waitForTimeout(200);
  assert.equal(await page.locator('#helpModal').getAttribute('hidden'), null);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  assert.notEqual(await page.locator('#helpModal').getAttribute('hidden'), null);
});

await step('Spotify player modal embeds a track', async () => {
  await page.locator('#spotifyBtn').click();
  await page.waitForTimeout(500);
  assert.equal(await page.locator('#spotifyModal').getAttribute('hidden'), null);
  const iframe = page.locator('#spotifyFrame iframe');
  if (await iframe.count()) {
    assert.match(await iframe.getAttribute('src'), /open\.spotify\.com\/embed\/track\//);
  } else {
    assert.match(await page.locator('#spotifyOpen').getAttribute('href'), /open\.spotify\.com/);
  }
  await page.keyboard.press('Escape');
});

await step('next card resets the flip and draws a different card', async () => {
  const before = await page.locator('#frontNumber').innerText();
  await page.locator('#nextBtn').click();
  await page.waitForTimeout(700);
  assert.equal(await page.locator('#card').getAttribute('data-flipped'), 'false');
  const after = await page.locator('#frontNumber').innerText();
  assert.notEqual(before, after);
});

await step('genre filter changes the card and URL', async () => {
  await page.locator('.chip[data-genre="rock"]').click();
  await page.waitForTimeout(700);
  assert.equal((await page.locator('#frontGenre').innerText()).toLowerCase(), 'rock');
  assert.match(page.url(), /genre=rock/);
  assert.match(await page.locator('#filterSummary').innerText(), /Rock/);
});

await step('decade filter combines with genre filter', async () => {
  await page.locator('.chip[data-decade="1990s"]').click();
  await page.waitForTimeout(700);
  assert.match(await page.locator('#backGenre').innerText(), /1990ER/);
  assert.match(page.url(), /decade=1990s/);
});

await step('reset filters restores the full catalogue', async () => {
  await page.locator('#resetFilters').click();
  await page.waitForTimeout(700);
  assert.doesNotMatch(page.url(), /genre=/);
  assert.match(await page.locator('#filterSummary').innerText(), /Alle Karten/);
});

await step('keyboard shortcuts control the game', async () => {
  await page.mouse.click(20, 500); // blur any button
  await page.keyboard.press('Space');
  await page.waitForTimeout(900);
  assert.ok(await page.locator('#card').evaluate((el) => el.classList.contains('is-playing')));
  await page.keyboard.press('f');
  await page.waitForTimeout(900);
  assert.equal(await page.locator('#card').getAttribute('data-flipped'), 'true');
  await page.keyboard.press('n');
  await page.waitForTimeout(700);
  assert.equal(await page.locator('#card').getAttribute('data-flipped'), 'false');
});

await step('no horizontal overflow on desktop', async () => {
  const sizes = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: innerWidth }));
  assert.ok(sizes.scroll <= sizes.inner + 1, JSON.stringify(sizes));
});

await page.screenshot({ path: 'test-results/e2e-desktop.png', fullPage: true });

// ---------------------------------------------------------------------------
// Mobile
// ---------------------------------------------------------------------------
const mobile = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
const mp = await mobile.newPage();
const mobileErrors = [];
mp.on('pageerror', (e) => mobileErrors.push(e.message));
await mp.goto(base, { waitUntil: 'networkidle' });
await mp.waitForFunction(() => document.querySelector('#catalogPill')?.textContent?.includes('Karten'), { timeout: 15000 });
await mp.waitForTimeout(600);

await step('mobile layout has no horizontal overflow', async () => {
  const sizes = await mp.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: innerWidth }));
  assert.ok(sizes.scroll <= sizes.inner + 1, JSON.stringify(sizes));
});

await step('mobile card fits the viewport', async () => {
  const box = await mp.locator('#card').boundingBox();
  assert.ok(box.width <= 390, JSON.stringify(box));
  assert.ok(box.height < 844, JSON.stringify(box));
});

await step('mobile tap plays audio and flips', async () => {
  await mp.locator('#cardPlay').tap();
  await mp.waitForFunction(() => document.querySelector('#card')?.classList.contains('is-playing'), { timeout: 15000 });
  await mp.waitForTimeout(800);
  const playing = await mp.evaluate(() => !document.querySelector('#audio').paused);
  assert.equal(playing, true);
  await mp.locator('#flipBtn').tap();
  await mp.waitForTimeout(900);
  assert.equal(await mp.locator('#card').getAttribute('data-flipped'), 'true');
  assert.ok((await mp.locator('#backTitle').innerText()).length > 1);
});

await step('mobile filter chips work', async () => {
  await mp.locator('.chip[data-genre="pop"]').tap();
  await mp.waitForTimeout(700);
  assert.equal((await mp.locator('#frontGenre').innerText()).toLowerCase(), 'pop');
});

await step('mobile has no runtime errors', async () => {
  assert.deepEqual(mobileErrors, []);
});

await mp.screenshot({ path: 'test-results/e2e-mobile.png', fullPage: true });

await step('desktop had no runtime errors', async () => {
  assert.deepEqual(errors, []);
});

await browser.close();
server.close();

console.log(`\n${results.length - failures}/${results.length} E2E checks passed.`);
if (failures) {
  console.error(`\n${failures} E2E check(s) failed.`);
  process.exit(1);
}
