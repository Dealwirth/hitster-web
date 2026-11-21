/**
 * V5 checks: full official card database, genre filter, card-link scanning,
 * Real card scans, version presets and the complete 664-track Spotify playlist.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
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
console.log(`\nV5 server: ${base}\n`);

const browser = await chromium.launch({
  executablePath: CHROMIUM,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.setDefaultTimeout(180000);
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error' && !m.text().toLowerCase().includes('spotify')) errors.push(`console: ${m.text()}`);
});

await page.goto(base, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.HITSTER?.state?.ready, { timeout: 15000 });

await step('official card database covers all 51.208 cards', async () => {
  const db = JSON.parse(fs.readFileSync('public/hitster-db.json', 'utf8'));
  assert.equal(db.gamesets.length, 176);
  const cards = db.gamesets.flatMap((set) => Object.values(set.cards));
  assert.equal(cards.length, 51208);
  assert.ok(cards.every(([id]) => /^[A-Za-z0-9]{22}$/.test(id)));
  assert.ok(Object.keys(db.tracks).length >= 2600);
});

await step('catalog is complete and contains the new bangers', async () => {
  const health = await (await fetch(`${base}/api/health`)).json();
  assert.equal(health.songs, 4701);
  const catalog = JSON.parse(fs.readFileSync('data/catalog.json', 'utf8'));
  assert.ok(catalog.songs.every((song) => song.year >= 1950 && song.year <= 2030));
  assert.ok(catalog.songs.every((song) => song.genre && song.title && song.artist));
  assert.ok(catalog.songs.some((song) => song.title === 'The Boys Are Back in Town'));
  assert.ok(catalog.songs.some((song) => song.title === 'Wildberry Lillet'));
});

await step('genre filter is visible, counted and URL-synced', async () => {
  assert.equal(await page.locator('#genreChips .chip').count(), 21);
  await page.locator('#genreChips [data-genre="rock"]').click();
  await page.waitForTimeout(250);
  assert.match(page.url(), /genre=rock/);
  assert.match(await page.locator('#filterSummary').innerText(), /^Rock · \d+$/);
  assert.equal(await page.locator('#genreCount').innerText(), '1 gewählt');
  await page.locator('#genreChips .chip').first().click();
  await page.waitForTimeout(250);
  assert.doesNotMatch(page.url(), /genre=/);
  assert.match(await page.locator('#filterSummary').innerText(), /^Alle Karten · \d+$/);
});

await step('version presets combine genres and are URL-synced', async () => {
  assert.equal(await page.locator('.mode-btn[data-mode="extension"]').count(), 0);
  await page.locator('.mode-btn[data-mode="versions"]').click();
  await page.waitForTimeout(300);
  assert.equal(await page.locator('#versionPanel').isVisible(), true);
  assert.equal(await page.locator('#versionChips .version-card').count(), 13);
  await page.locator('#versionChips [data-version="guilty"]').click();
  await page.waitForTimeout(450);
  const result = await page.evaluate(() => ({
    version: window.HITSTER.state.version,
    mode: window.HITSTER.state.mode,
    year: window.HITSTER.state.current?.year,
    genres: window.HITSTER.state.current ? (window.HITSTER.state.current.genres || [window.HITSTER.state.current.genre]) : [],
    analytics: window.HITSTER.state.analytics.versions.guilty || 0,
  }));
  assert.equal(result.version, 'guilty');
  assert.equal(result.mode, 'versions');
  assert.ok(result.genres.some((genre) => ['pop', 'schlager', 'film', 'rnb', 'latin'].includes(genre)));
  assert.ok(result.analytics > 0);
  assert.match(page.url(), /mode=versions/);
  assert.match(page.url(), /version=guilty/);
  await page.locator('.mode-btn[data-mode="classic"]').click();
  await page.waitForTimeout(300);
});

await step('QR code 00052 reveals a different song from the same year', async () => {
  assert.equal(await page.locator('#scanLinkInput').count(), 0);
  assert.equal(await page.locator('#scanStage').count(), 1);
  assert.equal(await page.locator('#scanFile').count(), 1);
  const qrFile = '/tmp/hitster-card-00052.png';
  await QRCode.toFile(qrFile, 'http://www.hitstergame.com/de/00052', { width: 420, margin: 2 });
  await page.locator('#scanBtn').click();
  await page.waitForTimeout(300);
  await page.locator('#scanFile').setInputFiles(qrFile);
  await page.waitForFunction(() => window.HITSTER?.state?.extensionYear > 0, { timeout: 30000 });
  const state = await page.evaluate(() => ({
    year: window.HITSTER.state.extensionYear,
    blind: window.HITSTER.state.blindYear,
    front: document.querySelector('#cardFront').innerText,
  }));
  assert.equal(state.year, 2018);
  assert.equal(state.blind, true);
  assert.doesNotMatch(state.front, /2018/);
  assert.equal(await page.locator('#card .back-bingo').count(), 0);
  await page.locator('#flipBtn').click();
  await page.waitForTimeout(700);
  assert.equal(await page.locator('#backYear').innerText(), '2018');
  const title = await page.locator('#backTitle').innerText();
  const artist = await page.locator('#backArtist').innerText();
  assert.notEqual(title, 'La Cintura');
  assert.notEqual(artist, 'Alvaro Soler');
  assert.ok(title.length > 0 && artist.length > 0);
});

await step('SKU URL aaaa0019/00215 reveals a different song from 2007', async () => {
  const parsed = await page.evaluate(() => window.HITSTER.parseScan('http://www.hitstergame.com/de/aaaa0019/00215'));
  assert.deepEqual(parsed.hitster, { region: 'de', sku: 'aaaa0019', card: '00215' });
  const qrFile = '/tmp/hitster-sku-00215.png';
  await QRCode.toFile(qrFile, 'http://www.hitstergame.com/de/aaaa0019/00215', { width: 420, margin: 2 });
  await page.locator('#scanBtn').click();
  await page.waitForTimeout(300);
  await page.locator('#scanFile').setInputFiles(qrFile);
  await page.waitForFunction(() => window.HITSTER?.state?.extensionYear === 2007, { timeout: 30000 });
  await page.locator('#flipBtn').click();
  await page.waitForTimeout(700);
  assert.equal(await page.locator('#backYear').innerText(), '2007');
  const title = await page.locator('#backTitle').innerText();
  const artist = await page.locator('#backArtist').innerText();
  assert.notEqual(title, 'Better in Time');
  assert.notEqual(artist, 'Leona Lewis');
  assert.ok(title.length > 0 && artist.length > 0);
  assert.equal(await page.locator('#card .back-bingo').count(), 0);
});

await step('camera video frame resolves arbitrary card 00128', async () => {
  const qr = await QRCode.toDataURL('http://www.hitstergame.com/de/00128', { width: 480, margin: 2 });
  await page.evaluate(async (url) => {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    canvas.getContext('2d').drawImage(img, 0, 0);
    const video = document.querySelector('#scanVideo');
    video.srcObject = canvas.captureStream(10);
    await video.play();
    document.querySelector('#scanModal').hidden = false;
    window.HITSTER.state.scan.active = true;
    window.HITSTER.state.scan.detected = false;
    window.HITSTER.scanFrame(performance.now() + 1000);
  }, qr);
  await page.waitForFunction(() => window.HITSTER?.state?.extensionYear === 1968, { timeout: 15000 });
  assert.equal(await page.evaluate(() => window.HITSTER.state.extensionYear), 1968);
});

await step('arbitrary QR card number 00128 resolves to a year', async () => {
  const res = await fetch(`${base}/api/hitster/de/00128`);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.card, '00128');
  assert.ok(data.track?.year >= 1950 && data.track?.year <= 2030);
  assert.ok(data.track?.title);
});

await step('deep link ?hitster=de/00052 opens the card', async () => {
  const deep = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await deep.goto(`${base}/?hitster=de/00052`, { waitUntil: 'networkidle' });
  await deep.waitForFunction(() => window.HITSTER?.state?.extensionYear > 0, { timeout: 30000 });
  assert.equal(await deep.evaluate(() => window.HITSTER.state.extensionYear), 2018);
  assert.equal(await deep.evaluate(() => window.HITSTER.state.blindYear), true);
  await deep.close();
});

await step('deep link with SKU opens a different song from the same year', async () => {
  const deep = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await deep.goto(`${base}/?hitster=de/aaaa0019/00215`, { waitUntil: 'networkidle' });
  await deep.waitForFunction(() => window.HITSTER?.state?.extensionYear === 2007, { timeout: 30000 });
  assert.notEqual(await deep.evaluate(() => window.HITSTER.state.current.title), 'Better in Time');
  assert.equal(await deep.evaluate(() => window.HITSTER.state.current.year), 2007);
  await deep.locator('#flipBtn').click();
  await deep.waitForTimeout(700);
  assert.equal(await deep.locator('#backYear').innerText(), '2007');
  assert.notEqual(await deep.locator('#backArtist').innerText(), 'Leona Lewis');
  await deep.close();
});

await step('official card API returns metadata and candidates', async () => {
  const res = await fetch(`${base}/api/hitster/de/00052`);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.set.region, 'Germany');
  assert.equal(data.set.name, 'Hitster Original');
  assert.equal(data.track.title, 'La Cintura');
  assert.equal(data.track.year, 2018);
  assert.equal(data.candidateCount, 176);
  assert.ok(data.candidates.length >= 10);
  const bingo = await (await fetch(`${base}/api/hitster/de/00215?sku=aaaa0019`)).json();
  assert.equal(bingo.track.title, 'Better in Time');
  assert.equal(bingo.track.year, 2007);
  assert.equal(bingo.track.group, false);
});

await step('new banger audio is playable', async () => {
  for (const id of ['s4422', 's4430', 's4484']) {
    const res = await fetch(`${base}/api/audio/${id}`);
    assert.equal(res.status, 200);
    const buf = Buffer.from(await res.arrayBuffer());
    assert.ok(buf.length > 10000);
  }
});

await step('complete 664-track Spotify playlist resolves without gaps', async () => {
  let data = null;
  let lastError = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`${base}/api/playlist?url=${encodeURIComponent('https://open.spotify.com/playlist/7qnG42fVABsfhbDvAnTGKv')}`);
      assert.equal(res.status, 200);
      data = await res.json();
      break;
    } catch (err) {
      lastError = err;
      if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
  if (!data) throw lastError || new Error('Playlist request failed');
  assert.equal(data.count, 664);
  assert.equal(data.songs.length, 664);
  assert.equal(data.skipped, 0);
  assert.equal(data.songs.filter((song) => !song.year).length, 0);
  assert.equal(data.songs.filter((song) => song.genre === 'unbekannt').length, 0);
  assert.ok(data.songs.every((song) => Array.isArray(song.genres) && song.genres.length));
  assert.ok(data.songs.some((song) => song.genre === 'rock'));
});

await step('no runtime errors', async () => {
  assert.deepEqual(errors, []);
});

await browser.close();
await new Promise((resolve) => server.close(resolve));
if (failures) {
  console.error(`\n❌ V5 checks: ${failures} failure(s)`);
  process.exit(1);
}
console.log('\n✅ V5 checks: 0 failure(s)');
