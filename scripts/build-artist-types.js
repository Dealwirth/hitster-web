#!/usr/bin/env node
/**
 * Builds data/artist-types.json and applies official Hitster artist types
 * (the gameset database contains "group"/"solo" per card) to the catalog.
 * Missing artists are resolved against MusicBrainz's free artist search.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const CATALOG = path.join(ROOT, 'data/catalog.json');
const OFFICIAL = 'https://hitster.jumboplay.com/hitster-assets/gameset_database.json';
const OUT = path.join(ROOT, 'data/artist-types.json');
const OVERRIDES = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/artist-overrides.json'), 'utf8'));

const norm = (s = '') => String(s)
  .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
const hasSeparator = (artist) => /(?:\s(?:&|and|x|vs\.?|feat\.?|ft\.?|with)\s|,|\/|\+)/i.test(String(artist || ''));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(url, tries = 5) {
  let last;
  for (let i = 0; i < tries; i++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: { 'user-agent': 'HITSTER-Web/4.3 (https://github.com/Dealwirth/hitster-web)' },
      });
      if (res.status === 503) throw new Error('MusicBrainz busy');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      last = err;
      await sleep(1200 * (i + 1));
    } finally {
      clearTimeout(timer);
    }
  }
  throw last;
}

const catalog = JSON.parse(fs.readFileSync(CATALOG, 'utf8'));
const raw = await fetchJson(OFFICIAL);
const official = new Map();
for (const set of raw.gamesets || []) {
  for (const card of set.gameset_data?.cards || []) {
    const id = card.Spotify;
    const type = String(card.ArtistType || '').toLowerCase();
    if (!id || (type !== 'group' && type !== 'solo')) continue;
    const bucket = official.get(id) || { group: 0, solo: 0 };
    bucket[type] += 1;
    official.set(id, bucket);
  }
}
console.log(`[types] official cards: ${official.size} Spotify tracks with artist type`);

const artists = new Map();
for (const song of catalog.songs || []) {
  const key = norm(song.artist);
  if (key && !artists.has(key)) artists.set(key, song.artist);
}
const names = [...artists.values()];
const resolved = new Map();
for (const [key, group] of Object.entries(OVERRIDES)) resolved.set(key, { group, source: 'override' });

for (let i = 0; i < names.length; i += 35) {
  const batch = names.slice(i, i + 35);
  const query = batch.map((name) => `artist:"${name.replace(/["\\]/g, ' ').trim()}"`).join(' OR ');
  let data;
  try {
    data = await fetchJson(`https://musicbrainz.org/ws/2/artist/?query=${encodeURIComponent(query)}&fmt=json&limit=100`);
  } catch (err) {
    console.warn(`[types] batch ${i / 35 + 1} failed: ${err.message}`);
    continue;
  }
  for (const name of batch) {
    const key = norm(name);
    if (resolved.has(key)) continue;
    const exact = (data.artists || [])
      .filter((a) => norm(a.name) === key && a.type)
      .sort((a, b) => (b.score || 0) - (a.score || 0))[0];
    if (!exact) continue;
    const type = exact.type;
    const group = /^(Group|Orchestra|Choir)$/i.test(type) ? true
      : /^Person$/i.test(type) ? false : null;
    if (group != null) resolved.set(key, { group, source: 'musicbrainz', mbid: exact.id, type, score: exact.score });
  }
  console.log(`[types] ${Math.min(i + 35, names.length)}/${names.length} artists`);
  await sleep(1100);
}

// Official card data wins over MusicBrainz/overrides for official tracks.
const officialById = new Map();
for (const [id, bucket] of official) {
  officialById.set(id, bucket.group >= bucket.solo ? 'group' : 'solo');
}
let catalogChanged = 0;
for (const song of catalog.songs || []) {
  const key = norm(song.artist);
  let group;
  let source;
  if (song.spotifyId && officialById.has(song.spotifyId)) {
    group = officialById.get(song.spotifyId) === 'group';
    source = 'hitster';
  } else if (resolved.has(key)) {
    group = resolved.get(key).group;
    source = resolved.get(key).source;
  } else {
    group = hasSeparator(song.artist);
    source = 'separator';
  }
  if (song.group !== group || song.groupSource !== source) catalogChanged++;
  song.group = group;
  song.groupSource = source;
}
fs.writeFileSync(CATALOG, `${JSON.stringify(catalog, null, 2)}\n`);

const artistsOut = {};
for (const [key, value] of resolved) artistsOut[key] = value;
fs.writeFileSync(OUT, `${JSON.stringify({
  generatedAt: new Date().toISOString(),
  source: 'Hitster official ArtistType + MusicBrainz artist search',
  artists: artistsOut,
}, null, 2)}\n`);
console.log(`[types] ${resolved.size} artist types, ${catalogChanged} catalog rows updated`);
console.log(`[types] wrote ${path.relative(ROOT, OUT)}`);
