#!/usr/bin/env node
/**
 * Builds data/catalog.json from data/songs.source.tsv.
 *
 * For every song we resolve:
 *  - a free 30 second audio preview (Deezer first, iTunes fallback)
 *  - cover artwork
 *  - a Spotify track id when the open dataset has one
 *
 * The script is resumable: resolved songs are cached in data/.cache/resolved.json.
 * Usage: node scripts/build-catalog.js [--force] [--limit=N]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA = path.join(ROOT, 'data');
const CACHE_DIR = path.join(DATA, '.cache');
const SOURCE = path.join(DATA, 'songs.source.tsv');
const CACHE = path.join(CACHE_DIR, 'resolved.json');
const SPOTIFY_CSV = path.join(CACHE_DIR, 'spotify-ids.csv');
const OUT = path.join(DATA, 'catalog.json');
const REPORT = path.join(DATA, 'build-report.json');

const SPOTIFY_URL =
  'https://raw.githubusercontent.com/gabminamedez/spotify-data/master/data.csv';

const VALID_GENRES = new Set([
  'pop', 'rock', 'indie', 'electronic', 'hiphop', 'rnb', 'funk', 'metal',
  'punk', 'country', 'folk', 'jazz', 'schlager', 'deutschpop', 'deutschrap',
  'latin', 'reggae', 'film', 'klassik', 'ndw', 'ska',
]);

const args = new Set(process.argv.slice(2));
const FORCE = args.has('--force');
const LIMIT = Number([...args].find((a) => a.startsWith('--limit='))?.split('=')[1] || 0);

function log(...m) { console.log(`[build]`, ...m); }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function norm(s = '') {
  return s
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\b(feat|featuring|ft)\b\.?.*$/, '')
    .replace(/\b(remaster(ed)?|radio edit|single version|album version|live|mono|stereo|deluxe|bonus track)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function tokens(s) { return new Set(norm(s).split(' ').filter(Boolean)); }
function jaccard(a, b) {
  const A = tokens(a), B = tokens(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

const BAD_TITLE = /\b(karaoke|tribute|cover|instrumental|backing track|made famous|in the style of|8 bit|nightcore)\b/i;

function yearOf(date) {
  const m = /^(\d{4})/.exec(String(date || ''));
  return m ? Number(m[1]) : null;
}

function scoreCandidate(song, cand, kind) {
  const title = kind === 'deezer' ? cand.title : cand.trackName;
  const artist = kind === 'deezer' ? cand.artist?.name : cand.artistName;
  const preview = kind === 'deezer' ? cand.preview : cand.previewUrl;
  const release = kind === 'deezer' ? null : cand.releaseDate;
  const date = kind === 'deezer' ? cand.album?.release_date : release;

  if (!title || !artist) return -999;
  let score = 0;
  const nt = norm(title), ns = norm(song.title);
  const na = norm(artist), nsa = norm(song.artist);

  if (nt === ns) score += 12;
  else if (nt.startsWith(ns) || ns.startsWith(nt)) score += 7;
  else if (nt.includes(ns) || ns.includes(nt)) score += 5;
  else {
    const tj = jaccard(title, song.title);
    if (tj >= 0.75) score += 5;
    else if (tj >= 0.5) score += 2;
    else return -999;
  }

  if (na === nsa) score += 10;
  else if (na.includes(nsa) || nsa.includes(na)) score += 6;
  else {
    const aj = jaccard(artist, song.artist);
    if (aj >= 0.5) score += 3;
    else score -= 4;
  }

  if (preview) score += 6;
  else return -999;

  if (kind === 'deezer' && cand.readable === false) score -= 10;
  if (BAD_TITLE.test(title)) score -= 12;

  const y = yearOf(date);
  if (y) {
    const d = Math.abs(y - song.year);
    if (d <= 1) score += 4;
    else if (d <= 3) score += 2;
    else if (d >= 15) score -= 3;
  }

  // Prefer tracks with a healthy popularity rank on Deezer.
  if (kind === 'deezer' && typeof cand.rank === 'number') {
    if (cand.rank > 700000) score += 2;
    else if (cand.rank < 50000) score -= 1;
  }
  return score;
}

class RateLimiter {
  constructor(perSecond) {
    this.gap = 1000 / perSecond;
    this.next = 0;
  }
  async wait() {
    const now = Date.now();
    const at = Math.max(now, this.next);
    this.next = at + this.gap;
    if (at > now) await sleep(at - now);
  }
}

const deezerLimiter = new RateLimiter(8);
const itunesLimiter = new RateLimiter(12);

async function fetchJson(url, { timeout = 15000, tries = 3, headers = {} } = {}) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: { 'user-agent': 'HitsterWeb/1.0 (+https://github.com/openhands/hitster-web)', ...headers },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      lastErr = err;
      await sleep(400 * (i + 1));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}

async function resolveDeezer(song) {
  const queries = [
    `${song.title} ${song.artist}`,
    `track:"${song.title}" artist:"${song.artist}"`,
    song.title,
  ];
  let best = null;
  let bestScore = -999;
  for (const q of queries) {
    await deezerLimiter.wait();
    let data;
    try {
      data = await fetchJson(`https://api.deezer.com/2.0/search?q=${encodeURIComponent(q)}&limit=25`);
    } catch {
      continue;
    }
    for (const cand of data?.data || []) {
      const s = scoreCandidate(song, cand, 'deezer');
      if (s > bestScore) { bestScore = s; best = cand; }
    }
    if (bestScore >= 24) break;
  }
  if (!best || bestScore < 8) return null;
  return {
    source: 'deezer',
    sourceId: String(best.id),
    deezerId: best.id,
    art: best.album?.cover_xl || best.album?.cover_big || null,
    duration: best.duration || null,
    isrc: best.isrc || null,
    score: bestScore,
    matchedTitle: best.title,
    matchedArtist: best.artist?.name || null,
    album: best.album?.title || null,
  };
}

async function resolveItunes(song) {
  const queries = [
    `${song.title} ${song.artist}`,
    song.title,
  ];
  let best = null;
  let bestScore = -999;
  for (const q of queries) {
    await itunesLimiter.wait();
    let data;
    try {
      data = await fetchJson(
        `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=song&limit=25&country=DE`
      );
    } catch {
      continue;
    }
    for (const cand of data?.results || []) {
      const s = scoreCandidate(song, cand, 'itunes');
      if (s > bestScore) { bestScore = s; best = cand; }
    }
    if (bestScore >= 24) break;
  }
  if (!best || bestScore < 8) return null;
  return {
    source: 'itunes',
    sourceId: String(best.trackId),
    deezerId: null,
    itunesId: best.trackId,
    art: (best.artworkUrl100 || '').replace('100x100bb', '600x600bb') || null,
    duration: best.trackTimeMillis ? Math.round(best.trackTimeMillis / 1000) : null,
    isrc: null,
    score: bestScore,
    matchedTitle: best.trackName,
    matchedArtist: best.artistName,
    album: best.collectionName || null,
  };
}

async function buildSpotifyIndex() {
  const index = new Map();
  try {
    if (!fs.existsSync(SPOTIFY_CSV)) {
      log('downloading open Spotify id dataset (27 MB) …');
      const res = await fetch(SPOTIFY_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      fs.writeFileSync(SPOTIFY_CSV, Buffer.from(await res.arrayBuffer()));
    }
    const text = fs.readFileSync(SPOTIFY_CSV, 'utf8');
    const lines = text.split('\n');
    const header = parseCsvLine(lines[0]);
    const iId = header.indexOf('id');
    const iName = header.indexOf('name');
    const iArtists = header.indexOf('artists');
    for (let i = 1; i < lines.length; i++) {
      if (!lines[i]) continue;
      const cols = parseCsvLine(lines[i]);
      const id = cols[iId];
      if (!id || id.length !== 22) continue;
      const name = cols[iName];
      const artists = (cols[iArtists] || '').replace(/[\[\]']/g, '').split(',');
      for (const a of artists) {
        const key = `${norm(name)}|${norm(a)}`;
        if (!index.has(key)) index.set(key, id);
      }
      const titleKey = norm(name);
      if (!index.has(`~${titleKey}`)) index.set(`~${titleKey}`, { id, artists });
    }
    log(`spotify index: ${index.size} keys`);
    return index;
  } catch (err) {
    log('spotify index unavailable:', err.message);
    return index;
  }
}

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

function findSpotifyId(index, song) {
  const direct = index.get(`${norm(song.title)}|${norm(song.artist)}`);
  if (typeof direct === 'string') return direct;
  const byTitle = index.get(`~${norm(song.title)}`);
  if (byTitle && typeof byTitle === 'object') {
    const artists = byTitle.artists || [];
    if (artists.some((a) => jaccard(a, song.artist) >= 0.5 || norm(a).includes(norm(song.artist)))) {
      return byTitle.id;
    }
  }
  return null;
}

function parseSource() {
  const rows = fs.readFileSync(SOURCE, 'utf8').split('\n');
  const songs = [];
  const seen = new Set();
  for (const raw of rows) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const p = line.split('|');
    if (p.length < 5) continue;
    const [year, genre, group, artist, title, tags] = p;
    const y = Number(year);
    if (!Number.isInteger(y) || y < 1900 || y > 2030) continue;
    if (!VALID_GENRES.has(genre)) continue;
    if (group !== 'G' && group !== 'S') continue;
    if (!artist?.trim() || !title?.trim()) continue;
    const key = `${norm(title)}|${norm(artist)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    songs.push({
      title: title.trim(),
      artist: artist.trim(),
      year: y,
      genre,
      group: group === 'G',
      tags: (tags || '').split(',').map((t) => t.trim()).filter(Boolean),
    });
  }
  return songs;
}

async function main() {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const songs = parseSource();
  log(`${songs.length} songs in source`);

  let cache = {};
  if (!FORCE && fs.existsSync(CACHE)) {
    try { cache = JSON.parse(fs.readFileSync(CACHE, 'utf8')); } catch { cache = {}; }
    log(`resume cache: ${Object.keys(cache).length} entries`);
  }

  const spotify = await buildSpotifyIndex();

  const pending = songs.filter((s) => !cache[`${s.title}|${s.artist}`]);
  const queue = LIMIT ? pending.slice(0, LIMIT) : pending;
  log(`resolving ${queue.length} songs (${pending.length - queue.length} left for a later run)`);

  let done = 0;
  const failures = [];

  async function worker() {
    while (queue.length) {
      const song = queue.shift();
      const key = `${song.title}|${song.artist}`;
      let res = null;
      try {
        res = await resolveDeezer(song);
        if (!res) res = await resolveItunes(song);
      } catch (err) {
        log('resolve error', key, err.message);
      }
      if (res) {
        res.spotifyId = findSpotifyId(spotify, song);
        cache[key] = res;
      } else {
        failures.push(key);
        cache[key] = null;
      }
      done++;
      if (done % 25 === 0 || done === queue.length) {
        log(`${done}/${queue.length} resolved (${failures.length} failed)`);
        fs.writeFileSync(CACHE, JSON.stringify(cache));
      }
    }
  }

  await Promise.all(Array.from({ length: 5 }, worker));
  fs.writeFileSync(CACHE, JSON.stringify(cache));

  const out = [];
  let i = 0;
  for (const s of songs) {
    const r = cache[`${s.title}|${s.artist}`];
    if (!r) continue;
    out.push({
      id: `s${String(++i).padStart(4, '0')}`,
      title: s.title,
      artist: s.artist,
      year: s.year,
      genre: s.genre,
      group: s.group,
      tags: s.tags,
      spotifyId: r.spotifyId || null,
      deezerId: r.deezerId || null,
      itunesId: r.itunesId || null,
      art: r.art || null,
      duration: r.duration || null,
      isrc: r.isrc || null,
      album: r.album || null,
      source: r.source,
      matchScore: r.score,
    });
  }

  out.sort((a, b) => a.year - b.year || a.artist.localeCompare(b.artist));
  out.forEach((s, idx) => { s.id = `s${String(idx + 1).padStart(4, '0')}`; });

  const report = {
    generatedAt: new Date().toISOString(),
    sourceSongs: songs.length,
    resolved: out.length,
    failed: songs.length - out.length,
    withSpotifyId: out.filter((s) => s.spotifyId).length,
    withArt: out.filter((s) => s.art).length,
    byGenre: out.reduce((acc, s) => ((acc[s.genre] = (acc[s.genre] || 0) + 1), acc), {}),
    byDecade: out.reduce((acc, s) => {
      const d = `${Math.floor(s.year / 10) * 10}s`;
      acc[d] = (acc[d] || 0) + 1;
      return acc;
    }, {}),
    failedSongs: songs.filter((s) => !cache[`${s.title}|${s.artist}`]).map((s) => `${s.artist} – ${s.title} (${s.year})`),
  };

  fs.writeFileSync(OUT, JSON.stringify({ generatedAt: report.generatedAt, count: out.length, songs: out }, null, 0));
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
  log(`wrote ${out.length} songs -> ${path.relative(ROOT, OUT)}`);
  log(`spotify ids: ${report.withSpotifyId}, artwork: ${report.withArt}, failed: ${report.failed}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
