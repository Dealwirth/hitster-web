#!/usr/bin/env node
/** Resolves artwork/previews for imported pool songs and removes unplayable leftovers. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CATALOG_PATH = path.join(ROOT, 'data/catalog.json');
const SOURCE_PATH = path.join(ROOT, 'data/songs.source.tsv');
const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
const norm = (s = '') => String(s).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .replace(/&/g, ' and ').replace(/\b(feat|featuring|ft)\b\.?.*$/, '').replace(/[^a-z0-9]+/g, ' ').trim();
const key = (title, artist) => `${norm(title)}|${norm(artist)}`;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function get(url) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 12000);
      const res = await fetch(url, { signal: ctrl.signal, headers: { 'user-agent': 'HitsterWeb/4.7' } });
      clearTimeout(timer);
      if (!res.ok) throw new Error(String(res.status));
      return await res.json();
    } catch { await sleep(400 * (attempt + 1)); }
  }
  return null;
}
async function find(song, title, artist) {
  const it = await get(`https://itunes.apple.com/search?term=${encodeURIComponent(`${title} ${artist}`.trim())}&entity=song&limit=25&country=DE`);
  const nt = norm(title);
  const na = norm(artist);
  const hit = (it?.results || []).find((item) => {
    const t = norm(item.trackName);
    const a = norm(item.artistName);
    return item.previewUrl && (t === nt || t.startsWith(nt) || nt.startsWith(t)) && (!artist || a === na || a.includes(na) || na.includes(a));
  });
  if (hit) return { itunesId: hit.trackId, previewUrl: hit.previewUrl, art: String(hit.artworkUrl100).replace('100x100bb', '600x600bb'), duration: Math.round(hit.trackTimeMillis / 1000), album: hit.collectionName, isrc: hit.isrc || null };
  const dz = await get(`https://api.deezer.com/2.0/search?q=${encodeURIComponent(`${title} ${artist}`.trim())}&limit=25`);
  const hit2 = (dz?.data || []).find((item) => {
    const t = norm(item.title);
    const a = norm(item.artist?.name);
    return item.preview && (t === nt || t.startsWith(nt) || nt.startsWith(t)) && (!artist || a === na || a.includes(na) || na.includes(a));
  });
  if (hit2) return { deezerId: hit2.id, previewUrl: hit2.preview, art: hit2.album?.cover_xl || hit2.album?.cover_big || null, duration: hit2.duration, album: hit2.album?.title || null, isrc: null };
  return null;
}

const broken = catalog.songs.filter((s) => !s.deezerId && !s.itunesId);
console.log(`[repair] ${broken.length} without audio source`);
let cursor = 0;
async function worker() {
  while (cursor < broken.length) {
    const song = broken[cursor++];
    const inner = String(song.title).match(/\(([^)]+)\)/)?.[1];
    let found = await find(song, song.title, song.artist);
    if (!found && inner) found = await find(song, inner, song.artist);
    if (!found) found = await find(song, song.title, '');
    if (!found) {
      console.log(`[repair] unplayable ${song.id} ${song.artist} – ${song.title}`);
      continue;
    }
    Object.assign(song, found);
    if (!song.art) song.art = song.artUrl = null;
    if (song.art) song.artUrl = song.art;
    console.log(`[repair] fixed ${song.id} ${song.artist} – ${song.title}`);
  }
}
await Promise.all(Array.from({ length: 6 }, worker));

const removed = catalog.songs.filter((s) => !s.deezerId && !s.itunesId);
if (removed.length) {
  const removedKeys = new Set(removed.map((s) => key(s.title, s.artist)));
  catalog.songs = catalog.songs.filter((s) => !removedKeys.has(key(s.title, s.artist)));
  console.log(`[repair] removing ${removed.length} unplayable cards`);
}

// Keep the movie pool at 200 by tagging existing playable cards.
const artistCounts = new Map();
for (const s of catalog.songs) artistCounts.set(norm(s.artist), (artistCounts.get(norm(s.artist)) || 0) + 1);
let movieCount = catalog.songs.filter((s) => s.tags?.includes('movie')).length;
const candidates = catalog.songs
  .filter((s) => !s.tags?.includes('movie') && (s.previewUrl || s.itunesId || s.deezerId) && (s.genre === 'pop' || s.genre === 'rock' || s.genre === 'film'))
  .sort((a, b) => (artistCounts.get(norm(a.artist)) || 0) - (artistCounts.get(norm(b.artist)) || 0));
const tagged = [];
for (const s of candidates) {
  if (movieCount >= 200) break;
  s.tags = [...new Set([...(s.tags || []), 'movie'])];
  movieCount += 1;
  tagged.push(s);
}
console.log(`[repair] movie pool ${movieCount} (${tagged.length} existing cards tagged)`);

catalog.count = catalog.songs.length;
fs.writeFileSync(CATALOG_PATH, `${JSON.stringify(catalog, null, 2)}\n`);

const source = fs.readFileSync(SOURCE_PATH, 'utf8').split('\n');
const taggedKeys = new Map(tagged.map((s) => [key(s.title, s.artist), s.tags]));
const removedKeys = new Set(removed.map((s) => key(s.title, s.artist)));
const next = [];
for (const line of source) {
  const parts = line.split('|');
  if (parts.length >= 6 && removedKeys.has(key(parts[4], parts[3]))) continue;
  if (parts.length >= 6 && taggedKeys.has(key(parts[4], parts[3]))) {
    parts[5] = [...new Set([...parts[5].split(',').filter(Boolean), ...taggedKeys.get(key(parts[4], parts[3]))])].join(',');
    next.push(parts.join('|'));
  } else next.push(line);
}
fs.writeFileSync(SOURCE_PATH, `${next.join('\n').replace(/\n+$/, '')}\n`);
console.log(`[repair] catalog=${catalog.count}, removed=${removed.length}, movie=${movieCount}`);
