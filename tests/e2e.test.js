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

await step('cards are clean: no Bingo answers or Anfänger/Experten clutter', async () => {
  assert.equal(await page.locator('#card .mini-chip, #card .bingo-panel, #card .bingo-scorecard, #card .back-bingo').count(), 0);
  assert.equal(await page.locator('#card').innerText().then((t) => /Anfänger|Experten/i.test(t)), false);
});

await step('front card hides title, year, genre and group until flip', async () => {
  assert.ok((await page.evaluate(() => window.HITSTER.state.current.genre)).length > 1);
  assert.match(await page.locator('#frontNumber').innerText(), /^KARTE #\d{4}$/i);
  assert.match(await page.locator('.card-question').innerText(), /Song/i);
  assert.equal(await page.locator('#frontGroupIcon').count(), 0);
  assert.equal(await page.locator('#frontYearBadge').count(), 0);
  const front = await page.locator('#cardFront').innerText();
  assert.equal(/19\d\d|20\d\d/.test(front), false, front);
});

await step('no audio is downloaded before the user presses play', async () => {
  assert.equal(audioRequests.length, 0, audioRequests.join(', '));
});

await step('clicking play starts a real audio clip', async () => {
  await page.locator('#cardPlay').click();
  await page.waitForFunction(() => {
    const a = document.querySelector('#audio');
    return !a.paused && a.currentTime > 0.2;
  }, { timeout: 20000 });
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

await step('card back reveals only year, title, artist and group icon', async () => {
  assert.equal(await page.locator('#backQrImg').count(), 0);
  assert.match(await page.locator('#backYear').innerText(), /^\d{4}$/);
  assert.ok((await page.locator('#backTitle').innerText()).length > 1);
  assert.ok((await page.locator('#backArtist').innerText()).length > 1);
  assert.match(await page.locator('#backGroupTag').getAttribute('aria-label'), /^(Solo|Gruppe)$/i);
  assert.equal(await page.locator('.back-bingo').count(), 0);
});

await step('next card changes only after the card has turned back', async () => {
  await page.evaluate(() => { if (!window.HITSTER.state.flipped) window.HITSTER.flipCard(); });
  await page.waitForTimeout(800);
  const before = await page.evaluate(() => ({ id: window.HITSTER.state.current.id, year: document.querySelector('#backYear').textContent }));
  await page.locator('#nextBtn').click();
  await page.waitForTimeout(120);
  const during = await page.evaluate(() => ({
    id: window.HITSTER.state.current.id,
    year: document.querySelector('#backYear').textContent,
    flipped: window.HITSTER.state.flipped,
    attr: document.querySelector('#card').dataset.flipped,
  }));
  assert.equal(during.id, before.id, 'next card must not be loaded before the flip');
  assert.equal(during.year, before.year, 'next year must not be visible during the flip');
  assert.equal(during.flipped, false);
  assert.equal(during.attr, 'false');
  await page.waitForTimeout(900);
  const after = await page.evaluate(() => ({ id: window.HITSTER.state.current.id, flipped: window.HITSTER.state.flipped }));
  assert.notEqual(after.id, before.id);
  assert.equal(after.flipped, false);
  await page.evaluate(() => { if (!window.HITSTER.state.flipped) window.HITSTER.flipCard(); });
  await page.waitForTimeout(800);
});

await step('judging a correct answer updates the statistics', async () => {
  await page.locator('#judgeRight').click();
  await page.waitForTimeout(300);
  assert.equal(await page.locator('#statCorrect').innerText(), '1');
  assert.equal(await page.locator('#statStreak').innerText(), '1');
  assert.ok(await page.locator('.confetti').count() > 0);
});

await step('a round never repeats a card and can be reset', async () => {
  await page.locator('#roundNew').click();
  await page.waitForTimeout(400);
  const ids = new Set();
  for (let i = 0; i < 5; i++) {
    await page.locator('#nextBtn').click();
    await page.waitForTimeout(220);
    const id = await page.evaluate(() => window.HITSTER.state.current.id);
    assert.ok(!ids.has(id), `duplicate ${id}`);
    ids.add(id);
  }
  assert.equal(ids.size, 5);
  assert.ok((await page.evaluate(() => window.HITSTER.state.roundSeen.size)) >= 5);
  await page.locator('#roundNew').click();
  await page.waitForTimeout(400);
  assert.equal(await page.evaluate(() => window.HITSTER.state.roundSeen.size), 1);
});

await step('help modal opens and closes with Escape', async () => {
  await page.locator('#helpBtn').click();
  await page.waitForTimeout(200);
  assert.equal(await page.locator('#helpModal').getAttribute('hidden'), null);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  assert.notEqual(await page.locator('#helpModal').getAttribute('hidden'), null);
});

await step('modal close button works inside SVG icon', async () => {
  await page.locator('#helpBtn').click();
  await page.waitForTimeout(200);
  assert.equal(await page.locator('#helpModal').isVisible(), true);
  await page.locator('#helpModal .modal-head [data-close]').click();
  await page.waitForTimeout(200);
  assert.equal(await page.locator('#helpModal').isHidden(), true);
});

await step('Spotify player modal embeds a track', async () => {
  if ((await page.locator('#card').getAttribute('data-flipped')) !== 'true') {
    await page.locator('#flipBtn').click();
    await page.waitForTimeout(900);
  }
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
  await page.waitForTimeout(900);
  assert.equal(await page.locator('#card').getAttribute('data-flipped'), 'false');
  const after = await page.locator('#frontNumber').innerText();
  assert.notEqual(before, after);
});

await step('decade filter changes the card and URL', async () => {
  await page.locator('.chip[data-decade="1990s"]').click();
  await page.waitForTimeout(700);
  assert.equal(await page.evaluate(() => Math.floor(window.HITSTER.state.current.year / 10) * 10), 1990);
  assert.match(page.url(), /decade=1990s/);
  assert.equal(await page.evaluate(() => Math.floor(window.HITSTER.state.current.year / 10) * 10), 1990);
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
  await page.waitForTimeout(900);
  assert.equal(await page.locator('#card').getAttribute('data-flipped'), 'false');
});

await step('year focus draws a song from the chosen year', async () => {
  assert.equal(await page.locator('.mode-btn[data-mode="extension"]').count(), 0);
  await page.evaluate(() => window.HITSTER.applyYear(1984));
  await page.waitForTimeout(700);
  assert.equal(await page.locator('#extensionBar').isVisible(), true);
  assert.equal(await page.evaluate(() => window.HITSTER.state.mode), 'extension');
  assert.equal(await page.evaluate(() => window.HITSTER.state.current.year), 1984);
  assert.equal(await page.locator('#frontYearBadge').count(), 0);
  assert.doesNotMatch(await page.locator('#yearHint').innerText(), /1984/);
  assert.doesNotMatch((await page.locator('#cardFront').innerText()).replace(/KARTE #[^\n]*/i, ''), /1984/);
  assert.match(page.url(), /mode=extension/);
  assert.doesNotMatch(page.url(), /year=1984/);
});

await step('random year stays in the catalogue range', async () => {
  await page.evaluate(() => window.HITSTER.randomYear());
  await page.waitForTimeout(500);
  const year = await page.evaluate(() => window.HITSTER.state.current.year);
  assert.ok(year >= 1950 && year <= 2030, String(year));
  assert.equal(await page.evaluate(() => window.HITSTER.state.mode), 'extension');
});

await step('QR payload parser accepts cards, years, Spotify links and bare ids', async () => {
  const parsed = await page.evaluate(() => ({
    card: window.HITSTER.parseScan('https://example.com/?card=s0042'),
    year: window.HITSTER.parseScan('1984'),
    bare: window.HITSTER.parseScan('s0042'),
    spotify: window.HITSTER.parseScan('https://open.spotify.com/track/5DNmWyeY9sildeeHnmIImG?si=abc'),
    spotifyUri: window.HITSTER.parseScan('spotify:track:5DNmWyeY9sildeeHnmIImG'),
    bad: window.HITSTER.parseScan('hello'),
  }));
  assert.deepEqual(parsed.card, { card: 's0042' });
  assert.deepEqual(parsed.year, { year: 1984 });
  assert.deepEqual(parsed.bare, { card: 's0042' });
  assert.deepEqual(parsed.spotify, { spotifyId: '5DNmWyeY9sildeeHnmIImG' });
  assert.deepEqual(parsed.spotifyUri, { spotifyId: '5DNmWyeY9sildeeHnmIImG' });
  assert.equal(parsed.bad, null);
});

await step('Spotify scan draws a different song from the same year', async () => {
  const result = await page.evaluate(async () => {
    const scanned = '5DNmWyeY9sildeeHnmIImG';
    await window.HITSTER.handleScan({ spotifyId: scanned });
    return {
      mode: window.HITSTER.state.mode,
      year: window.HITSTER.state.extensionYear,
      current: window.HITSTER.state.current,
      seen: [...window.HITSTER.state.roundSeen],
    };
  });
  assert.equal(result.mode, 'extension');
  assert.equal(result.year, 1951);
  assert.equal(result.current.year, 1951);
  assert.notEqual(result.current.id, 's0002');
  assert.ok(result.seen.includes('s0002'), 'scanned song should be excluded from the round');
});

await step('card deep link opens the exact card', async () => {
  const target = await page.evaluate(() => window.HITSTER.state.songs[0].id);
  const deep = await context.newPage();
  await deep.goto(`${base}/?card=${target}`, { waitUntil: 'networkidle' });
  await deep.waitForFunction(() => window.HITSTER?.state?.current?.id, { timeout: 15000 });
  await deep.waitForTimeout(400);
  assert.equal(await deep.evaluate(() => window.HITSTER.state.current.id), target);
  assert.equal(await deep.locator('#frontNumber').innerText(), `KARTE #${target.slice(1)}`);
  await deep.close();
});

await step('year deep link opens extension mode for that year', async () => {
  const yp = await context.newPage();
  await yp.goto(`${base}/?year=1984`, { waitUntil: 'networkidle' });
  await yp.waitForFunction(() => window.HITSTER?.state?.current?.year, { timeout: 15000 });
  await yp.waitForTimeout(400);
  assert.equal(await yp.evaluate(() => window.HITSTER.state.mode), 'extension');
  assert.equal(await yp.evaluate(() => window.HITSTER.state.current.year), 1984);
  assert.equal(await yp.locator('#frontYearBadge').count(), 0);
  assert.doesNotMatch((await yp.locator('#cardFront').innerText()).replace(/KARTE #[^\n]*/i, ''), /1984/);
  assert.doesNotMatch(await yp.locator('#yearHint').innerText(), /1984/);
  await yp.close();
});

await step('print sheet builds fronts, backs and QR codes', async () => {
  await page.evaluate(() => { window.print = () => { window.__printed = true; }; window.HITSTER.openPrint(); });
  await page.waitForTimeout(250);
  assert.equal(await page.locator('#printModal').isVisible(), true);
  await page.selectOption('#printCount', '9');
  await page.locator('#printGo').click();
  await page.waitForTimeout(1400);
  const print = await page.evaluate(() => ({
    printed: window.__printed,
    cards: document.querySelectorAll('#printRoot .print-card').length,
    fronts: document.querySelectorAll('#printRoot .print-sheet.fronts .print-card').length,
    backs: document.querySelectorAll('#printRoot .print-sheet.backs .print-card').length,
    qrs: document.querySelectorAll('#printRoot .pc-qr img').length,
    bingo: document.querySelectorAll('#printRoot .pc-bingo, #printRoot .pc-answers').length,
  }));
  assert.equal(print.printed, true);
  assert.equal(print.cards, 18);
  assert.equal(print.fronts, 9);
  assert.equal(print.backs, 9);
  assert.equal(print.qrs, 9);
  assert.equal(print.bingo, 0);
  await page.emulateMedia({ media: 'print' });
  const dims = await page.locator('#printRoot .print-card').first().evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height) };
  });
  await page.emulateMedia({ media: 'screen' });
  assert.ok(dims.w >= 215 && dims.w <= 230, JSON.stringify(dims));
  assert.ok(dims.h >= 335 && dims.h <= 350, JSON.stringify(dims));
});

await step('version switch shows presets and hides them in free play', async () => {
  assert.equal(await page.locator('.mode-btn[data-mode="extension"]').count(), 0);
  await page.locator('.mode-btn[data-mode="versions"]').click();
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => window.HITSTER.state.mode), 'versions');
  assert.equal(await page.locator('#versionPanel').isVisible(), true);
  assert.ok(await page.locator('#versionChips .version-card').count() >= 10);
  await page.locator('#versionChips [data-version="guilty"]').click();
  await page.waitForTimeout(400);
  assert.equal(await page.evaluate(() => window.HITSTER.state.version), 'guilty');
  assert.match(page.url(), /version=guilty/);
  await page.locator('.mode-btn[data-mode="classic"]').click();
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => window.HITSTER.state.mode), 'classic');
  assert.equal(await page.locator('#versionPanel').isVisible(), false);
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
  await mp.locator('.chip[data-decade="1980s"]').tap();
  await mp.waitForTimeout(700);
  assert.equal(await mp.evaluate(() => Math.floor(window.HITSTER.state.current.year / 10) * 10), 1980);
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
