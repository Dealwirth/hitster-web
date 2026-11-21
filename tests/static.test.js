/**
 * Static GitHub-Pages build test: build docs/, serve it, verify blind card,
 * real Hitster scan against a local API, PWA assets and no runtime errors.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import QRCode from 'qrcode';
import { app } from '../server/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOCS = fs.mkdtempSync(path.join(os.tmpdir(), 'hitster-static-'));
const CHROMIUM = process.env.CHROMIUM_PATH || '/usr/bin/chromium';
let failures = 0;
async function step(name, fn) {
  try { await fn(); console.log(`✅ ${name}`); }
  catch (err) { failures++; console.error(`❌ ${name}\n   ${err.stack?.split('\n').slice(0, 5).join('\n   ')}`); }
}

const api = app.listen(0, '127.0.0.1');
await new Promise((resolve) => api.once('listening', resolve));
const apiBase = `http://127.0.0.1:${api.address().port}`;
execFileSync(process.execPath, ['scripts/build-static.js'], {
  cwd: ROOT,
  env: { ...process.env, PUBLIC_API_BASE: apiBase, PUBLIC_OUT: DOCS },
  stdio: 'ignore',
});

const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
const staticServer = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = path.join(DOCS, urlPath === '/' ? 'index.html' : urlPath.replace(/^\//, ''));
  if (!file.startsWith(DOCS) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); res.end('not found'); return;
  }
  res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((resolve) => staticServer.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${staticServer.address().port}`;
console.log(`\nStatic build: ${base} (API ${apiBase})\n`);

const browser = await chromium.launch({ executablePath: CHROMIUM, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !m.text().toLowerCase().includes('spotify')) errors.push(m.text()); });
await page.goto(`${base}/?play=1`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.HITSTER?.state?.ready, { timeout: 15000 });

await step('static flag, catalog and API base are wired', async () => {
  assert.equal(await page.evaluate(() => document.documentElement.dataset.static), 'true');
  assert.ok(await page.evaluate(() => window.HITSTER.state.songs.length) >= 4400);
  assert.equal(await page.evaluate(() => document.querySelector('meta[name="hitster-api"]').content), apiBase);
  assert.match(await page.locator('#databaseLink').getAttribute('href'), /hitster-database\.json/);
});

await step('front is spoiler-free and back reveals metadata', async () => {
  const front = (await page.locator('#cardFront').innerText()).replace(/KARTE #[^\n]*/i, '');
  assert.doesNotMatch(front, /19\d\d|20\d\d/);
  await page.locator('#flipBtn').click();
  await page.waitForTimeout(700);
  assert.match(await page.locator('#backYear').innerText(), /^\d{4}$/);
  assert.equal(await page.locator('.back-bingo').count(), 0);
  assert.ok((await page.locator('#backTitle').innerText()).length > 1);
  assert.ok((await page.locator('#backArtist').innerText()).length > 1);
  assert.match(await page.locator('#backGroupTag').getAttribute('aria-label'), /^(Solo|Gruppe)$/i);
  assert.ok(await page.locator('#backCats span').count() >= 2);
});

await step('static page can call the API cross-origin (CORS)', async () => {
  const result = await page.evaluate(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/hitster/de/00052`);
    return { status: res.status, data: await res.json() };
  }, apiBase);
  assert.equal(result.status, 200);
  assert.equal(result.data.card, '00052');
  assert.equal(result.data.track.year, 2018);
});

await step('real Hitster QR resolves against local API without showing year', async () => {
  assert.equal(await page.locator('#scanLinkInput').count(), 0);
  assert.equal(await page.locator('#scanStage').count(), 1);
  const qrFile = '/tmp/hitster-static-00052.png';
  await QRCode.toFile(qrFile, 'http://www.hitstergame.com/de/00052', { width: 420, margin: 2 });
  await page.locator('#scanBtn').click();
  await page.waitForTimeout(300);
  await page.locator('#scanFile').setInputFiles(qrFile);
  await page.waitForFunction(() => window.HITSTER?.state?.extensionYear === 2018, { timeout: 30000 });
  const result = await page.evaluate(() => ({
    year: window.HITSTER.state.extensionYear,
    currentYear: window.HITSTER.state.current?.year,
    currentTitle: window.HITSTER.state.current?.title,
    hasYearInput: !!document.querySelector('#yearInput'),
  }));
  assert.equal(result.currentYear, result.year);
  assert.notEqual(result.currentTitle, 'La Cintura');
  assert.equal(result.hasYearInput, false);
  const visible = await page.locator('#cardFront').innerText() + await page.locator('#yearHint').innerText();
  assert.doesNotMatch(visible, new RegExp(String(result.year)));
});

await step('static build exposes version presets', async () => {
  await page.locator('.mode-btn[data-mode="versions"]').click();
  await page.waitForTimeout(300);
  assert.equal(await page.locator('#versionPanel').isVisible(), true);
  assert.equal(await page.locator('#versionChips .version-card').count(), 13);
  await page.locator('#versionChips [data-version="guilty"]').click();
  await page.waitForTimeout(350);
  const result = await page.evaluate(() => ({
    version: window.HITSTER.state.version,
    mode: window.HITSTER.state.mode,
    genre: window.HITSTER.state.current?.genre,
    analytics: window.HITSTER.state.analytics.versions.guilty || 0,
  }));
  assert.equal(result.version, 'guilty');
  assert.equal(result.mode, 'versions');
  assert.ok(['pop', 'schlager', 'film', 'rnb', 'latin'].includes(result.genre));
  assert.ok(result.analytics > 0);
});

await step('PWA manifest, icons and service worker exist', async () => {
  assert.equal(await page.locator('link[rel="manifest"]').count(), 1);
  const sw = await page.evaluate(async () => (await navigator.serviceWorker.ready).active?.scriptURL);
  assert.ok(sw.endsWith('/sw.js'));
  const icon = await page.evaluate(async () => (await fetch('icons/icon-192.png')).status);
  assert.equal(icon, 200);
});

await step('static build can host an online room with a local QR', async () => {
  const online = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  online.on('pageerror', (e) => errors.push(e.message));
  await online.goto(`${base}/?online=1`, { waitUntil: 'networkidle' });
  await online.waitForFunction(() => window.HITSTER?.state?.ready, { timeout: 15000 });
  await online.waitForTimeout(400);
  assert.equal(await online.locator('#onlineLobby').isVisible(), true);
  await online.locator('#onlineHostName').fill('Static Host');
  await online.locator('#onlineHostForm button[type=submit]').click();
  await online.waitForTimeout(800);
  assert.match(await online.locator('#onlineRoomCode').innerText(), /^[A-Z0-9]{6}$/);
  assert.ok((await online.locator('#onlineQr').getAttribute('src')).startsWith(`${apiBase}/api/qr?text=`));
  await online.close();
});

await step('no runtime errors', async () => {
  assert.deepEqual(errors, []);
});

await browser.close();
staticServer.close();
api.close();
fs.rmSync(DOCS, { recursive: true, force: true });
console.log(`\n${failures ? '❌' : '✅'} Static checks: ${failures} failure(s)\n`);
process.exit(failures ? 1 : 0);
