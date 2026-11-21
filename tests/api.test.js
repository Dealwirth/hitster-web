import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app } from '../server/index.js';
import { songs } from '../server/catalog.js';

test('GET /api/health reports a healthy catalog', async () => {
  const res = await request(app).get('/api/health').expect(200);
  assert.equal(res.body.ok, true);
  assert.ok(res.body.songs >= 1000);
});

test('GET /api/catalog returns all songs with filters metadata', async () => {
  const res = await request(app).get('/api/catalog').expect(200);
  assert.ok(res.body.count >= 4000, `only ${res.body.count} songs`);
  assert.equal(res.body.songs.length, res.body.count);
  assert.ok(res.body.genres.length >= 20);
  assert.ok(res.body.decades.length >= 7);
  assert.ok(res.body.songs.every((s) => s.streamUrl && s.spotifyId !== undefined));
  assert.match(res.headers['cache-control'], /max-age=86400/);
  assert.match(res.headers['content-type'], /application\/json/);
});

test('catalog is compressed for browsers', async () => {
  const res = await request(app)
    .get('/api/catalog')
    .set('Accept-Encoding', 'gzip')
    .expect(200);
  assert.equal(res.headers['content-encoding'], 'gzip');
});

test('GET /api/random respects filters and never returns a non-matching song', async () => {
  for (const [query, check] of [
    ['genre=rock&decade=1980s', (s) => s.genre === 'rock' && s.year >= 1980 && s.year < 1990],
    ['genre=hiphop', (s) => s.genre === 'hiphop'],
    ['decade=2020s', (s) => s.year >= 2020 && s.year < 2030],
    ['group=solo', (s) => s.group === false],
    ['group=group', (s) => s.group === true],
    ['tag=onehit', (s) => s.tags.includes('onehit')],
    ['spotifyOnly=1', (s) => Boolean(s.spotifyId)],
  ]) {
    const res = await request(app).get(`/api/random?${query}`).expect(200);
    assert.ok(res.body.song, query);
    assert.ok(check(res.body.song), `${query} returned ${JSON.stringify(res.body.song)}`);
  }
});

test('GET /api/random rejects impossible filters with 404', async () => {
  await request(app).get('/api/random?genre=polka').expect(404);
  await request(app).get('/api/random?decade=1890s').expect(404);
});

test('GET /api/random honours exclude ids', async () => {
  const pool = songs.filter((s) => s.genre === 'pop').slice(0, 20);
  const exclude = pool.slice(0, 19).map((s) => s.id).join(',');
  const res = await request(app).get(`/api/random?genre=pop&exclude=${exclude}`).expect(200);
  assert.ok(!pool.slice(0, 19).some((s) => s.id === res.body.song.id));
});

test('GET /api/song/:id returns song and all Bingo answers', async () => {
  const song = songs[0];
  const res = await request(app).get(`/api/song/${song.id}`).expect(200);
  assert.equal(res.body.song.id, song.id);
  assert.equal(res.body.bingo.beginner.length, 5);
  assert.equal(res.body.bingo.expert.length, 5);
  await request(app).get('/api/song/nope').expect(404);
});

test('GET /api/bingo/:id returns the ten answers', async () => {
  const res = await request(app).get(`/api/bingo/${songs[10].id}`).expect(200);
  assert.equal(res.body.bingo.beginner.length, 5);
  assert.equal(res.body.bingo.expert.length, 5);
});

test('GET /api/audio/:id serves a playable 30 second clip with Range support', async () => {
  const song = songs.find((s) => s.deezerId) || songs[0];
  const head = await request(app).head(`/api/audio/${song.id}`).expect(200);
  assert.match(head.headers['content-type'], /audio\//);
  assert.ok(Number(head.headers['content-length']) > 10000);

  const full = await request(app).get(`/api/audio/${song.id}`).expect(200);
  assert.match(full.headers['content-type'], /audio\//);
  assert.ok(full.body.length > 10000);
  // MP3 frame sync (0xFF Ex) or MP4 ftyp box.
  const bytes = full.body.subarray(0, 12);
  const isId3 = bytes.subarray(0, 3).toString() === 'ID3';
  const isMp3 = bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0;
  const isMp4 = bytes.subarray(4, 8).toString() === 'ftyp';
  const isOgg = bytes.subarray(0, 4).toString() === 'OggS';
  assert.ok(isId3 || isMp3 || isMp4 || isOgg, `unknown audio header ${bytes.toString('hex')}`);

  const range = await request(app)
    .get(`/api/audio/${song.id}`)
    .set('Range', 'bytes=0-99')
    .expect(206);
  assert.equal(range.body.length, 100);
  assert.match(range.headers['content-range'], /^bytes 0-99\//);
  assert.equal(range.headers['accept-ranges'], 'bytes');

  const bad = await request(app)
    .get(`/api/audio/${song.id}`)
    .set('Range', 'bytes=99999999-')
    .expect(416);
  assert.match(bad.headers['content-range'], /^bytes \*\//);
});

test('GET /api/qr/:id returns a scannable SVG QR code', async () => {
  const song = songs[0];
  const res = await request(app).get(`/api/qr/${song.id}`).expect(200);
  assert.match(res.headers['content-type'], /^image\/svg\+xml/);
  assert.ok(res.body.length > 500, `qr bytes=${res.body.length}`);
  const svg = res.body.toString();
  assert.match(svg, /<svg/);
  assert.match(svg, /width="256"/);
  await request(app).get(`/api/qr/${song.id}?base=https%3A%2F%2Fexample.com`).expect(200);
  await request(app).get('/api/qr/nope').expect(404);
});

test('GET /api/art/:id serves cached cover artwork', async () => {
  const song = songs.find((s) => s.art) || songs[0];
  const res = await request(app).get(`/api/art/${song.id}`).expect(200);
  assert.match(res.headers['content-type'], /^image\//);
  assert.ok(res.body.length > 1000);
  await request(app).get('/api/art/nope').expect(404);
});

test('unknown API endpoints return JSON 404', async () => {
  const res = await request(app).get('/api/does-not-exist').expect(404);
  assert.match(res.headers['content-type'], /application\/json/);
});

test('security headers are present', async () => {
  const res = await request(app).get('/').expect(200);
  assert.match(res.headers['content-security-policy'], /default-src 'self'/);
  assert.equal(res.headers['x-content-type-options'], 'nosniff');
  assert.equal(res.headers['referrer-policy'], 'no-referrer');
  assert.equal(res.headers['x-powered-by'], undefined);
});

test('the frontend is served at /', async () => {
  const res = await request(app).get('/').expect(200);
  assert.match(res.text, /HITSTER/);
  assert.match(res.text, /styles\.css/);
  assert.match(res.text, /app\.js/);
});
