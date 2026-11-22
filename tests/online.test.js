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
  for (const [id, version] of Object.entries(db.versions)) { assert.ok(version.guaranteedMinPerYear >= 10, `${id}: ${version.guaranteedMinPerYear}`); assert.ok(version.count >= 500, `${id}: ${version.count}`); }
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

await step('online bingo: voting, 5x5 color cards, sync audio, answer, marking and win', async () => {
  const host = await context.newPage();
  host.setDefaultTimeout(30000);
  host.on('pageerror', (e) => errors.push(`host pageerror: ${e.message}`));
  const player = await context.newPage();
  player.setDefaultTimeout(30000);
  await player.setViewportSize({ width: 390, height: 844 });
  player.on('pageerror', (e) => errors.push(`player pageerror: ${e.message}`));

  await host.goto(`${base}/?start=1&localonline=1`, { waitUntil: 'networkidle' });
  await host.waitForFunction(() => window.HITSTER?.state?.ready, { timeout: 30000 });
  await host.locator('[data-start="online"]').click();
  await host.locator('#onlineHostName').fill('Host');
  await host.selectOption('#onlineTimerSelect', '15');
  await host.selectOption('#onlineMarkTimerSelect', '6');
  await host.locator('#onlineHostForm button[type=submit]').click();
  await host.waitForSelector('#onlineRoom:not([hidden])');
  assert.equal(await host.evaluate(() => window.HitsterOnline.state.settings.markTimer), 6);
  const code = (await host.locator('#onlineRoomCode').innerText()).trim();
  assert.match(code, /^[A-Z0-9]{6}$/);
  assert.match(await host.locator('#onlineQr').getAttribute('src'), /\/api\/qr\?text=/);

  await player.goto(`${base}/?online=${code}&localonline=1`, { waitUntil: 'networkidle' });
  await player.waitForFunction(() => window.HITSTER?.state?.ready, { timeout: 30000 });
  await player.locator('#onlineJoinName').fill('Player');
  await player.locator('#onlineJoinForm button[type=submit]').click();
  await host.waitForFunction(() => document.querySelector('#onlinePlayerCount')?.textContent === '2', { timeout: 10000 });
  assert.match(await host.locator('#onlinePlayers').innerText(), /Player/);

  const rules = await host.evaluate(() => {
    const d = window.HitsterOnline.debug;
    const song = { year: 1998, title: 'Believe', artist: 'Cher', group: false };
    return {
      solo: d.isCorrect({ id: 'solo', type: 'choice' }, song, 'solo'),
      group: d.isCorrect({ id: 'solo', type: 'choice' }, { ...song, group: true }, 'group'),
      before: d.isCorrect({ id: 'before2000', type: 'choice' }, song, 'yes'),
      year2: d.isCorrect({ id: 'year2', type: 'year', tolerance: 2 }, song, '2000'),
      year2bad: d.isCorrect({ id: 'year2', type: 'year', tolerance: 2 }, song, '2002'),
      short84: d.isCorrect({ id: 'year', type: 'year', tolerance: 0 }, { ...song, year: 1984 }, '84'),
      short06: d.isCorrect({ id: 'year', type: 'year', tolerance: 0 }, { ...song, year: 2006 }, '06'),
      shortBad: d.isCorrect({ id: 'year', type: 'year', tolerance: 0 }, { ...song, year: 1984 }, '85'),
      decadeShort: d.isCorrect({ id: 'decade', type: 'decade' }, song, '90'),
      decade: d.isCorrect({ id: 'decade', type: 'decade' }, song, '1990s'),
      title: d.isCorrect({ id: 'title', type: 'title' }, song, 'believe'),
      artist: d.isCorrect({ id: 'artist', type: 'artist' }, song, 'Cher'),
      line: d.hasBingo(new Set([0, 1, 2, 3, 4])),
      noLine: d.hasBingo(new Set([0, 1, 2, 3, 5])),
      card: d.makeBingoCard('easy')
    };
  });
  assert.deepEqual([rules.solo, rules.group, rules.before, rules.year2, rules.short84, rules.short06, rules.decadeShort, rules.decade, rules.title, rules.artist, rules.line], [true, true, true, true, true, true, true, true, true, true, true]);
  assert.equal(rules.year2bad, false);
  assert.equal(rules.shortBad, false);
  assert.equal(rules.noLine, false);
  assert.equal(rules.card.length, 25);
  assert.deepEqual(Object.values(rules.card.reduce((a, x) => { a[x] = (a[x] || 0) + 1; return a; }, {})).sort(), [5, 5, 5, 5, 5]);
  const balanced = await host.evaluate(() => {
    const d = window.HitsterOnline.debug;
    const cards = Array.from({ length: 40 }, () => d.makeBingoCard('easy'));
    const maxInLine = (line) => Math.max(...Object.values(line.reduce((out, id) => ({ ...out, [id]: (out[id] || 0) + 1 }), {})));
    const rowMax = Math.max(...cards.flatMap((card) => Array.from({ length: 5 }, (_, row) => maxInLine(card.slice(row * 5, row * 5 + 5)))));
    const colMax = Math.max(...cards.flatMap((card) => Array.from({ length: 5 }, (_, col) => maxInLine(Array.from({ length: 5 }, (_, row) => card[row * 5 + col])))));
    return { rowMax, colMax, unique: new Set(cards.map((card) => card.join(','))).size };
  });
  assert.equal(balanced.rowMax, 2);
  assert.equal(balanced.colMax, 2);
  assert.ok(balanced.unique >= 20);

  const direct = await context.newPage();
  await direct.goto(`${base}/?online`, { waitUntil: 'networkidle' });
  await direct.waitForFunction(() => window.HITSTER?.state?.ready, { timeout: 30000 });
  await direct.waitForTimeout(300);
  assert.equal(await direct.locator('#onlineScreen').isVisible(), true);
  assert.equal(await direct.locator('#onlineLobby').isVisible(), true);
  assert.equal(await direct.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), 0);
  await direct.close();

  await host.locator('#onlineStart').click();
  await host.waitForSelector('#onlineSetup:not([hidden])');
  await player.waitForSelector('#onlineSetup:not([hidden])');
  assert.equal(await host.locator('#onlineRounds').count(), 0);
  assert.equal(await host.locator('[data-vote-version]').count(), 12);
  assert.equal(await host.locator('[data-vote-familiarity]').count(), 3);
  assert.equal(await host.locator('[data-vote-difficulty]').count(), 2);
  await host.locator('[data-vote-version="party"]').click();
  await host.locator('[data-vote-familiarity="known"]').click();
  await host.locator('[data-vote-difficulty="easy"]').click();
  await player.locator('[data-vote-version="party"]').click();
  await player.locator('[data-vote-familiarity="known"]').click();
  await player.locator('[data-vote-difficulty="easy"]').click();
  await host.waitForFunction(() => window.HitsterOnline.state.phase === 'countdown', { timeout: 5000 });
  assert.match(await host.locator('#onlineVoteResult').innerText(), /Party & Dance/);
  assert.match(await host.locator('#onlineVoteResult').innerText(), /Bekannt/);
  assert.match(await host.locator('#onlineVoteResult').innerText(), /Einsteiger/);
  assert.equal(await host.evaluate(() => window.HitsterOnline.state.choices.familiarity), 'known');

  await host.waitForFunction(() => !document.querySelector('#onlineGame')?.hidden, { timeout: 8000 });
  await player.waitForFunction(() => !document.querySelector('#onlineGame')?.hidden, { timeout: 8000 });
  await host.waitForFunction(() => window.HitsterOnline.state.phase === 'playing', { timeout: 9000 });
  await player.waitForFunction(() => window.HitsterOnline.state.phase === 'playing', { timeout: 9000 });

  const hostState = await host.evaluate(() => ({ cat: window.HitsterOnline.state.category, song: window.HitsterOnline.state.song, card: window.HitsterOnline.state.card, audio: document.querySelector('#onlinePlay')?.className, tier: window.HITSTER.familiarity(window.HitsterOnline.state.song) }));
  const playerState = await player.evaluate(() => ({ cat: window.HitsterOnline.state.category, card: window.HitsterOnline.state.card, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, text: document.querySelector('#onlineGame').innerText }));
  assert.equal(hostState.cat.id, playerState.cat.id);
  assert.equal(hostState.tier, 'known');
  assert.equal(hostState.card.length, 25);
  assert.equal(playerState.card.length, 25);
  assert.equal(playerState.overflow, 0);
  assert.equal(playerState.text.includes(hostState.song.title), false);
  assert.equal(playerState.text.includes(hostState.song.artist), false);
  assert.deepEqual(Object.values(hostState.card.reduce((a, x) => { a[x] = (a[x] || 0) + 1; return a; }, {})).sort(), [5, 5, 5, 5, 5]);
  assert.notDeepEqual(hostState.card, playerState.card);
  assert.match(hostState.audio || '', /is-playing/);
  await host.waitForFunction(() => { const a = window.HitsterOnline.debug.audio(); return a.currentTime > 0.2 && !a.paused && !a.muted; }, { timeout: 5000 });
  await host.evaluate(() => { const d = window.HitsterOnline.debug, o = d.online, a = d.audio(); a.pause(); o.audioBlocked = true; o.audioPlaying = false; o.audioUnlocked = false; d.render(); });
  assert.equal(await host.locator('#onlineAudioGate').isVisible(), true);
  await host.locator('#onlineAudioGateBtn').click();
  await host.waitForFunction(() => { const a = window.HitsterOnline.debug.audio(); return a.currentTime > 0.2 && !a.paused; }, { timeout: 5000 });

  const submitCorrect = async (page, cat, song) => {
    let value = String(song.year);
    if (cat.id === 'solo') value = song.group ? 'group' : 'solo';
    else if (cat.id === 'before2000') value = song.year < 2000 ? 'yes' : 'no';
    else if (cat.type === 'decade') value = `${Math.floor(song.year / 10) * 10}s`;
    else if (cat.type === 'title') value = song.title;
    else if (cat.type === 'artist') value = song.artist;
    const input = page.locator('#onlineAnswerInput');
    if (await input.count()) { await input.fill(value); await page.locator('#onlineAnswerForm button[type=submit]').click(); }
    else await page.locator(`[data-answer="${value}"]`).click();
  };
  await submitCorrect(host, hostState.cat, hostState.song);
  assert.equal(await host.evaluate(() => window.HitsterOnline.state.phase), 'playing');
  await submitCorrect(player, hostState.cat, hostState.song);
  await host.waitForFunction(() => window.HitsterOnline.state.phase === 'reveal', { timeout: 2500 });
  await player.waitForFunction(() => window.HitsterOnline.state.phase === 'reveal', { timeout: 2500 });
  assert.equal(await host.locator('#onlineBingo .is-eligible').count() > 0, true);
  assert.equal(await player.locator('#onlineBingo .is-eligible').count() > 0, true);
  assert.match(await player.locator('#onlineReveal').innerText(), new RegExp(String(hostState.song.year)));

  await host.locator('#onlineBingo .is-eligible').first().click();
  await player.locator('#onlineBingo .is-eligible').first().click();
  await host.waitForTimeout(500);
  const scores = await host.evaluate(() => window.HitsterOnline.state.players.map((p) => ({ name: p.name, score: p.score })));
  assert.ok(scores.find((p) => p.name === 'Host').score >= 1);
  assert.ok(scores.find((p) => p.name === 'Player').score >= 1);

  const tiers = await host.evaluate(() => {
    const d = window.HitsterOnline.debug, o = d.online, before = o.choices.familiarity;
    const out = {};
    for (const fam of ['known', 'unknown', 'mixed']) {
      o.choices.familiarity = fam;
      out[fam] = Array.from({ length: 60 }, () => d.pickSong()).filter(Boolean).map((song) => window.HITSTER.familiarity(song));
    }
    o.choices.familiarity = before;
    return out;
  });
  assert.ok(tiers.known.length > 0 && tiers.known.every((tier) => tier === 'known'), JSON.stringify(tiers.known));
  assert.ok(tiers.unknown.length > 0 && tiers.unknown.every((tier) => tier === 'unknown'), JSON.stringify(tiers.unknown));
  assert.ok(tiers.mixed.includes('known'), JSON.stringify(tiers.mixed));

  await host.waitForFunction(() => window.HitsterOnline.state.phase === 'spinning', { timeout: 6000 });
  await host.waitForFunction(() => window.HitsterOnline.state.phase === 'playing', { timeout: 8000 });
  assert.ok(await host.evaluate(() => window.HitsterOnline.state.round) >= 2);
  const wheel = await host.evaluate(() => {
    const s = window.HitsterOnline.state;
    const order = ['solo', 'before2000', 'year4', 'decade', 'year2'];
    const index = order.indexOf(s.category?.id);
    const angle = ((s.wheelAngle || 0) % 360 + 360) % 360;
    const expected = (360 - index * 72) % 360;
    const el = document.querySelector('#onlineWheel');
    return { index, angle, expected, colors: [0, 1, 2, 3, 4].map((i) => getComputedStyle(el).getPropertyValue(`--w${i}`).trim()) };
  });
  assert.ok(wheel.index >= 0);
  assert.ok(Math.abs(wheel.angle - wheel.expected) < 1, JSON.stringify(wheel));
  assert.equal(wheel.colors.filter(Boolean).length, 5);

  const forms = await host.evaluate(() => {
    const d = window.HitsterOnline.debug, o = d.online;
    o.choices.difficulty = 'easy';
    const cats = [
      { id: 'solo', label: 'Solo oder Gruppe', short: 'Solo/Gruppe', icon: 'S/G', color: '#ff7aa8', ink: '#2a0715', question: 'Solo oder Gruppe?', type: 'choice', options: [{ value: 'solo', label: 'Solo' }, { value: 'group', label: 'Gruppe' }] },
      { id: 'before2000', label: 'Vor 2000?', short: 'Vor 2000?', icon: '00', color: '#ffd166', ink: '#2d2100', question: 'Erschien der Song vor 2000?', type: 'choice', options: [{ value: 'yes', label: 'Ja' }, { value: 'no', label: 'Nein' }] },
      { id: 'year4', label: '4 Jahre daneben', short: '±4 Jahre', icon: '±4', color: '#6ee7b7', ink: '#05251a', question: 'Jahr?', type: 'year', tolerance: 4 },
      { id: 'decade', label: 'Jahrzehnt', short: 'Jahrzehnt', icon: '10s', color: '#7dd3fc', ink: '#082333', question: 'Jahrzehnt?', type: 'decade' },
      { id: 'title', label: 'Songtitel', short: 'Titel', icon: 'T', color: '#ff7aa8', ink: '#2a0715', question: 'Titel?', type: 'title' },
      { id: 'artist', label: 'Interpret / Band', short: 'Interpret', icon: 'A', color: '#6ee7b7', ink: '#05251a', question: 'Wer?', type: 'artist' }
    ];
    return cats.map((cat) => {
      o.phase = 'playing'; o.category = cat; o.submitted = false; o.answer = null; o.deadline = Date.now() + 25000;
      document.querySelector('#onlineAnswerBox').dataset.key = '';
      d.render();
      return { id: cat.id, buttons: document.querySelectorAll('#onlineAnswerBox [data-answer]').length, input: Boolean(document.querySelector('#onlineAnswerInput')) };
    });
  });

  assert.deepEqual(forms.map((f) => [f.id, f.buttons, f.input]), [
    ['solo', 2, false], ['before2000', 2, false], ['year4', 0, true], ['decade', 8, false], ['title', 0, true], ['artist', 0, true]
  ]);

  const fallback = await host.evaluate(() => {
    const d = window.HitsterOnline.debug, o = d.online;
    o.card = Array(25).fill('decade'); o.marked = new Set();
    o.category = { id: 'decade', label: 'Jahrzehnt', short: 'Jahrzehnt', icon: '10s', color: '#7dd3fc', ink: '#082333', question: 'Jahrzehnt?', type: 'decade' };
    o.phase = 'reveal'; o.correct = { host: true }; o.pending = new Set(['host']); o.markDeadline = Date.now() + 1500; o.settings.markTimer = 3;
    const p = o.players.find((x) => x.id === 'host');
    p.card = o.card; p.marked = new Set(); p.score = 0; p.bingo = false; p.correct = true;
    d.render();
    const grid = document.querySelector('#onlineBingo');
    const warning = grid.classList.contains('is-warning');
    const blinks = getComputedStyle(grid).animationIterationCount;
    const cell = d.randomCell(p);
    d.autoMarkPending();
    return { warning, blinks, cell, score: p.score, marked: p.marked.size, pending: o.pending.size };
  });
  assert.equal(fallback.warning, true);
  assert.equal(fallback.blinks, '5');
  assert.ok(fallback.cell != null);
  assert.equal(fallback.score, 1);
  assert.equal(fallback.marked, 1);
  assert.equal(fallback.pending, 0);

  await host.evaluate(() => {
    const d = window.HitsterOnline.debug, o = d.online;
    o.card = Array(25).fill('decade');
    o.marked = new Set();
    o.category = { id: 'decade', label: 'Jahrzehnt', short: 'Jahrzehnt', icon: '10s', color: '#7dd3fc', ink: '#082333', question: 'Jahrzehnt?', type: 'decade' };
    o.phase = 'reveal'; o.correct = { host: true }; o.pending = new Set(['host']); o.markDeadline = Date.now() + 12000;
    const p = o.players.find((x) => x.id === 'host');
    p.card = o.card; p.marked = new Set(); p.score = 0; p.bingo = false;
    for (let i = 0; i < 5; i++) { o.pending.add('host'); d.hostMark('host', i); }
  });
  await host.waitForTimeout(400);
  const win = await host.evaluate(() => ({ phase: window.HitsterOnline.state.phase, winner: window.HitsterOnline.state.winner, text: document.querySelector('#onlineReveal')?.innerText, progress: document.querySelector('#onlineCardProgress')?.textContent, buttons: document.querySelectorAll('[data-bingo-vote]').length }));
  assert.equal(win.phase, 'bingo');
  assert.ok(win.winner?.name);
  assert.match(win.text, /BINGO/);
  assert.match(win.text, /Weiter bis zum nächsten Bingo/);
  assert.equal(win.buttons, 2);
  assert.match(win.progress, /5 \/ 25/);

  await host.locator('[data-bingo-vote="continue"]').click();
  await player.locator('[data-bingo-vote="continue"]').click();
  await host.waitForFunction(() => window.HitsterOnline.state.phase === 'spinning', { timeout: 5000 });
  await host.waitForFunction(() => window.HitsterOnline.state.phase === 'playing', { timeout: 8000 });
  assert.ok(await host.evaluate(() => window.HitsterOnline.state.round) >= 2);
  assert.equal(await host.evaluate(() => window.HitsterOnline.state.players.find((p) => p.id === 'host')?.bingos), 1);

  await host.evaluate(() => {
    const d = window.HitsterOnline.debug, o = d.online;
    o.card = Array(25).fill('decade'); o.marked = new Set([0, 1, 2, 3, 4]);
    o.category = { id: 'decade', label: 'Jahrzehnt', short: 'Jahrzehnt', icon: '10s', color: '#7dd3fc', ink: '#082333', question: 'Jahrzehnt?', type: 'decade' };
    o.phase = 'reveal'; o.correct = { host: true }; o.pending = new Set(['host']); o.markDeadline = Date.now() + 12000;
    const p = o.players.find((x) => x.id === 'host');
    p.card = o.card; p.marked = new Set([0, 1, 2, 3, 4]); p.bingo = true; p.bingos = 1;
    for (let i = 5; i < 10; i++) { o.pending.add('host'); d.hostMark('host', i); }
  });
  await host.waitForTimeout(300);
  assert.equal(await host.evaluate(() => window.HitsterOnline.state.phase), 'bingo');
  assert.equal(await host.evaluate(() => window.HitsterOnline.state.players.find((p) => p.id === 'host')?.bingos), 2);
  await host.locator('[data-bingo-vote="stop"]').click();
  await player.locator('[data-bingo-vote="stop"]').click();
  await host.waitForFunction(() => window.HitsterOnline.state.phase === 'ended', { timeout: 5000 });
  assert.match(await host.locator('#onlineReveal').innerText(), /BINGO/);

  assert.equal(await host.locator('#onlineLeaderboard').evaluate((el) => el.tagName), 'DETAILS');
  assert.equal(await host.locator('#onlineLeaderboard').evaluate((el) => el.open), false);
  await host.locator('#onlineLeaderboard summary').click();
  assert.equal(await host.locator('#onlineLeaderboard').evaluate((el) => el.open), true);
  await host.locator('#onlineLeaderboard summary').click();

  await host.locator('#onlineStart').click();
  await host.waitForFunction(() => window.HitsterOnline.state.phase === 'setup', { timeout: 3000 });
  assert.equal(errors.length, 0, errors.join('\n'));
  await host.close();
  await player.close();
});

await browser.close();
await new Promise((resolve) => server.close(resolve));
console.log(`\n${failures ? '❌' : '✅'} Online/UI checks: ${failures} failure(s)\n`);
process.exit(failures ? 1 : 0);
