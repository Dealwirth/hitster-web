#!/usr/bin/env node
/**
 * Adds well-known current chart songs to data/catalog.json.
 * Uses Apple's public iTunes RSS feeds (no login, no API key).
 * Run: node scripts/add-chart-songs.js
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CATALOG = path.join(ROOT, 'data/catalog.json');
const LIMIT = Number(process.argv.find((a) => a.startsWith('--limit='))?.split('=')[1] || 500);

const FEEDS = [
  { url: 'https://itunes.apple.com/de/rss/topsongs/limit=100/json', genre: 'pop' },
  { url: 'https://itunes.apple.com/de/rss/topsongs/limit=100/genre=21/json', genre: 'rock' },
  { url: 'https://itunes.apple.com/de/rss/topsongs/limit=100/genre=18/json', genre: 'hiphop' },
  { url: 'https://itunes.apple.com/de/rss/topsongs/limit=100/genre=17/json', genre: 'electronic' },
  { url: 'https://itunes.apple.com/de/rss/topsongs/limit=100/genre=15/json', genre: 'rnb' },
  { url: 'https://itunes.apple.com/de/rss/topsongs/limit=100/genre=20/json', genre: 'indie' },
];

function norm(value = '') {
  return String(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\b(feat|featuring|ft)\b\.?.*$/, '')
    .replace(/\b(remaster(ed)?|radio edit|single version|album version|live|deluxe|bonus track)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function groupOf(artist) {
  return /(?:\s(?:&|and|x|vs\.?|feat\.?|ft\.?|with)\s|,|\/|\+)/i.test(String(artist || ''));
}

function label(value) {
  return value?.label || value || '';
}

async function getFeed(url) {
  const res = await fetch(url, {
    headers: { 'user-agent': 'HitsterWeb/4.1 (+https://github.com/Dealwirth/hitster-web)' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function entriesOf(feed) {
  const entry = feed?.feed?.entry;
  return Array.isArray(entry) ? entry : entry ? [entry] : [];
}

function yearOf(entry) {
  const date = label(entry?.['im:releaseDate']);
  const m = /^(\d{4})/.exec(date);
  return m ? Number(m[1]) : null;
}

function artOf(entry) {
  const images = entry?.['im:image'] || [];
  return images.at(-1)?.label || null;
}

const catalog = JSON.parse(fs.readFileSync(CATALOG, 'utf8'));
const seen = new Set(catalog.songs.map((s) => `${norm(s.title)}|${norm(s.artist)}`));
let maxId = 0;
for (const song of catalog.songs) {
  const m = /^s(\d+)$/.exec(song.id);
  if (m) maxId = Math.max(maxId, Number(m[1]));
}

const added = [];
const seenThisRun = new Set();
for (const feedInfo of FEEDS) {
  let feed;
  try {
    feed = await getFeed(feedInfo.url);
  } catch (err) {
    console.warn('[charts] feed failed:', feedInfo.url, err.message);
    continue;
  }
  for (const entry of entriesOf(feed)) {
    const title = label(entry?.['im:name']).trim();
    const artist = label(entry?.['im:artist']).trim();
    const year = yearOf(entry);
    if (!title || !artist || !year || year < 1950 || year > 2030) continue;
    const key = `${norm(title)}|${norm(artist)}`;
    if (seen.has(key) || seenThisRun.has(key)) continue;
    seenThisRun.add(key);
    maxId += 1;
    added.push({
      id: `s${maxId}`,
      title,
      artist,
      year,
      genre: feedInfo.genre,
      group: groupOf(artist),
      tags: [],
      spotifyId: null,
      deezerId: null,
      itunesId: label(entry?.id?.attributes?.['im:id']) || null,
      popularity: null,
      art: artOf(entry),
      source: 'itunes',
    });
    if (added.length >= LIMIT) break;
  }
  if (added.length >= LIMIT) break;
}

if (!added.length) {
  console.log('[charts] no new songs');
  process.exit(0);
}
catalog.songs.push(...added);
catalog.count = catalog.songs.length;
catalog.generatedAt = new Date().toISOString();
fs.writeFileSync(CATALOG, JSON.stringify(catalog, null, 2) + '\n');
console.log(`[charts] added ${added.length} songs; catalog now ${catalog.count}`);
console.log('[charts] sample:', added.slice(0, 5).map((s) => `${s.artist} – ${s.title} (${s.year})`).join(' · '));
