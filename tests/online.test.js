/**
 * New in 4.8.0: version-year coverage, start screen, collapsible panels,
 * compact print cards, version-mode scanning and the local online-bingo flow.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright-core';
import { app } from '../server/index.js';

const CHROMIUM = process.env.CHROMIUM_PATH || '/usr/bin/chromium';
let failures = 0;
async function step(name, fn) {
  try { await fn(); console.log(`✅ ${name}`); }
  catch (err) { failures++; console.error(`❌ ${name}\n   ${err.stack?.split('\n').slice(0, 6).join('\n   ')}`); }
}
const server = app.listen(0, '127.0.0.1');
await new Promise((resolve) => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: CHROMIUM, args: ['--no-sandbox', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
page.setDefaultTimeout(30000);
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error' && !m.text().toLowerCase().includes('spotify')) errors.push(`console: ${m.text()}`); });
await page.goto(base, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.HITSTER?.state?.ready, { timeout: 30000 });

await step('start screen offers every mode', async () => {
  await page.locator('#startBtn').click();
  assert.equal(await page.locator('#startScreen').isVisible(), true);
  assert.equal(await page.locator('.start-card').count(), 6);
  assert.equal(await page.locator('[data-start="online"]').count(), 1);
  await page.locator('[data-start="classic"]').click();
  await page.waitForTimeout(300);
});

await step('collapsible settings reduce the UI', async () => {
  const block = page.locator('.genre-panel');
  const toggle = block.locator('.panel-collapse');
  assert.equal(await toggle.count(), 1);
  await toggle.click();
  assert.equal(await block.evaluate((el) => el.classList.contains('is-collapsed')), true);
  await toggle.click();
  assert.equal(await block.evaluate((el) => el.classList.contains('is-collapsed')), false);
});

await step('every version has ten playable songs in every year', async () => {
  const result = await page.evaluate(() => {
    const H = window.HITSTER;
    const years = [...new Set(H.state.songs.map((song) => song.year))];
    const counts = {};
    for (const id of Object.keys(H.versions)) counts[id] = Math.min(...years.map((year) => H.versionYearPool(id, year).length));
    return counts;
  });
  for (const [id, count] of Object.entries(result)) assert.ok(count >= 10, `${id} only ${count}`);
});

await step('version mode exposes card scanning', async () => {
  await page.locator('#startBtn').click();
  await page.locator('[data-start="versions"]').click();
  await page.waitForTimeout(300);
  assert.equal(await page.locator('#versionPanel').isVisible(), true);
  assert.equal(await page.locator('#versionScanBtn').isVisible(), true);
  await page.locator('#versionScanBtn').click({ force: true });
  assert.equal(await page.locator('#scanModal').isVisible(), true);
  await page.keyboard.press('Escape');
});

await step('compact print style produces compact cards', async () => {
  await page.locator('[data-start="print"]').click().catch(() => {});
  if (!(await page.locator('#printModal').isVisible())) await page.locator('#printBtn').click();
  await page.locator('#printStyle').selectOption('compact');
  await page.locator('#printGo').click();
  await page.waitForTimeout(250);
  assert.equal(await page.locator('#printRoot .print-card.compact').count() > 0, true);
  await page.emulateMedia({ media: 'print' });
  const width = await page.locator('#printRoot .print-card').first().evaluate((el) => getComputedStyle(el).width);
  assert.match(width, /54mm|204\.\d+px|203\./);
  await page.emulateMedia({ media: 'screen' });
  await page.keyboard.press('Escape');
});

await step('playlist loading is cached in the browser', async () => {
  let requests = 0;
  await page.route('**/api/playlist**', async (route) => {
    requests++;
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'cache-test',
        name: 'Cache Test',
        songs: [
          { id: 's1', title: 'Eins', artist: 'A', year: 1984, previewUrl: 'https://example.test/a.mp3', genre: 'Pop', spotifyId: '1111111111111111111111' },
          { id: 's2', title: 'Zwei', artist: 'B', year: 1999, previewUrl: 'https://example.test/b.mp3', genre: 'Rock', spotifyId: '2222222222222222222222' },
        ],
      }),
    });
  });
  const result = await page.evaluate(async () => {
    const first = await window.HITSTER.loadPlaylist('https://open.spotify.com/playlist/cache-test');
    const start = performance.now();
    const second = await window.HITSTER.loadPlaylist('https://open.spotify.com/playlist/cache-test');
    return { first, second, ms: performance.now() - start, count: window.HITSTER.state.playlist?.songs.length };
  });
  assert.equal(result.first, true);
  assert.equal(result.second, true);
  assert.equal(result.count, 2);
  assert.equal(requests, 1);
  assert.ok(result.ms < 500, `cached reload took ${result.ms}ms`);
  await page.unroute('**/api/playlist**');
});

await step('database has guaranteed coverage and full metadata', async () => {
  const db = JSON.parse(fs.readFileSync('data/hitster-database.json', 'utf8'));
  assert.equal(db.schema, 'hitster-web-database/v1');
  assert.equal(db.totalSongs, 4860);
  for (const [id, version] of Object.entries(db.versions)) assert.ok(version.guaranteedMinPerYear >= 10, `${id}: ${version.guaranteedMinPerYear}`);
  assert.ok(db.songs.every((song) => Array.isArray(song.genres) && song.decade && typeof song.fame === 'number'));
});

await step('database download route serves the complete JSON', async () => {
  const res = await fetch(`${base}/api/database`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-disposition') || '', /hitster-database\.json/);
  const data = await res.json();
  assert.equal(data.totalSongs, 4860);
  assert.equal(data.versions.party.guaranteedMinPerYear, 10);
});

await step('online bingo: host/player, no year leak, answer and reveal', async () => {
  const host = await context.newPage();
  host.setDefaultTimeout(30000);
  host.on('pageerror', (e) => errors.push(`host pageerror: ${e.message}`));
  await host.goto(`${base}/?localonline=1`, { waitUntil: 'networkidle' });
  await host.waitForFunction(() => window.HITSTER?.state?.ready, { timeout: 30000 });
  await host.locator('#startBtn').click();
  await host.locator('[data-start="online"]').click();
  await host.locator('#onlineHostName').fill('Host');
  await host.locator('#onlineTimerSelect').selectOption('15');
  await host.locator('#onlineHostForm button[type=submit]').click();
  const code = (await host.locator('#onlineRoomCode').innerText()).trim();
  assert.match(code, /^[A-Z0-9]{6}$/);

  const player = await context.newPage();
  player.setDefaultTimeout(30000);
  player.on('pageerror', (e) => errors.push(`player pageerror: ${e.message}`));
  await player.goto(`${base}/?online=${code}&localonline=1`, { waitUntil: 'networkidle' });
  await player.waitForFunction(() => window.HITSTER?.state?.ready, { timeout: 30000 });
  assert.equal(await player.locator('#onlineJoinCode').inputValue(), code);
  await player.locator('#onlineJoinName').fill('Player');
  await player.locator('#onlineJoinForm button[type=submit]').click();
  await host.waitForTimeout(400);
  assert.match(await host.locator('#onlinePlayers').innerText(), /Player/);

  await host.locator('#onlineStart').click();
  await host.waitForTimeout(500);
  const secret = await host.evaluate(() => window.HitsterOnline.state.song);
  assert.ok(secret?.year);
  assert.match(await host.locator('#onlineQr').getAttribute('src'), /\/api\/qr\?text=/);
  assert.ok(await player.evaluate(() => Boolean(window.HitsterOnline.state.audio)));
  await player.locator('#onlinePlay').click();
  await player.waitForFunction(() => document.querySelector('#onlinePlay')?.classList.contains('is-playing'), { timeout: 8000 });
  assert.equal(await player.evaluate(() => window.HitsterOnline.state.song), null);
  const playerText = await player.locator('#onlineGame').innerText();
  assert.equal(playerText.includes(secret.title), false);
  assert.equal(playerText.includes(secret.artist), false);
  assert.equal(await player.locator('#onlineBingo button').count(), 25);
  assert.equal(await player.locator('#onlineBingo button').nth(12).innerText(), 'FREI');

  await player.locator('#onlineBingo button:not([disabled])').first().click();
  assert.match(await player.locator('#onlineGameStatus').innerText(), /Tipp gespeichert/);
  await host.waitForTimeout(16000);
  assert.match(await player.locator('#onlineReveal').innerText(), new RegExp(String(secret.year)));
  assert.match(await host.locator('#onlineReveal').innerText(), new RegExp(String(secret.year)));
  assert.equal(errors.length, 0, errors.join('\n'));
  await host.close();
  await player.close();
});

await browser.close();
await new Promise((resolve) => server.close(resolve));
console.log(`\n${failures ? '❌' : '✅'} Online/UI checks: ${failures} failure(s)\n`);
process.exit(failures ? 1 : 0);
