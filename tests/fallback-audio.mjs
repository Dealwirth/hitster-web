/**
 * Verifies the iTunes/m4a fallback path: header, cache and real browser playback.
 * Requires the server on http://localhost:12000.
 */
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const cat = JSON.parse(fs.readFileSync('data/catalog.json', 'utf8'));
const fallback = cat.songs.filter((s) => !s.deezerId && s.itunesId);
assert.ok(fallback.length > 0, 'no iTunes fallback songs in catalog');
console.log(`fallback songs: ${fallback.length}`);

for (const s of fallback) {
  const res = await fetch(`http://localhost:12000/api/audio/${s.id}`, { method: 'HEAD' });
  assert.equal(res.status, 200, s.id);
  assert.match(res.headers.get('content-type'), /^audio\//, s.id);
  assert.ok(Number(res.headers.get('content-length')) > 10000, s.id);
  console.log(`✅ HEAD ${s.id} ${s.artist} – ${s.title}: ${res.headers.get('content-type')} ${res.headers.get('content-length')}`);
}

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage();
await page.goto('http://localhost:12000/', { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.HITSTER?.state?.songs?.length > 1000);
for (const s of fallback) {
  await page.evaluate(async (id) => {
    const d = await (await fetch('/api/catalog')).json();
    window.HITSTER.loadCard(d.songs.find((x) => x.id === id));
  }, s.id);
  await page.waitForTimeout(300);
  await page.locator('#cardPlay').click();
  await page.waitForTimeout(1500);
  const audio = await page.evaluate(() => {
    const a = document.querySelector('#audio');
    return { paused: a.paused, currentTime: a.currentTime, duration: a.duration, error: a.error?.code };
  });
  assert.equal(audio.paused, false, s.id);
  assert.ok(audio.currentTime > 0.2, `${s.id} currentTime=${audio.currentTime}`);
  assert.ok(audio.duration > 20 && audio.duration < 45, `${s.id} duration=${audio.duration}`);
  assert.equal(audio.error, undefined, `${s.id} error=${audio.error}`);
  console.log(`✅ PLAY ${s.id}: ${audio.currentTime.toFixed(2)}s / ${audio.duration.toFixed(2)}s`);
}
await browser.close();
console.log(`\n${fallback.length}/${fallback.length} fallback clips play in Chromium.`);
