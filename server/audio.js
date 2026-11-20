import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.resolve(__dirname, '../data/.cache/audio');
const ART_DIR = path.resolve(__dirname, '../data/.cache/art');

fs.mkdirSync(CACHE_DIR, { recursive: true });
fs.mkdirSync(ART_DIR, { recursive: true });

const MEMORY_LIMIT = 30;
const MAX_AUDIO_CACHE = 800 * 1024 * 1024;
const memory = new Map();
const inflight = new Map();
const artInflight = new Map();

async function pruneAudioCache() {
  try {
    const files = await fsp.readdir(CACHE_DIR);
    const entries = [];
    let total = 0;
    for (const name of files) {
      const file = path.join(CACHE_DIR, name);
      const stat = await fsp.stat(file);
      entries.push({ file, size: stat.size, mtime: stat.mtimeMs });
      total += stat.size;
    }
    if (total <= MAX_AUDIO_CACHE) return;
    entries.sort((a, b) => a.mtime - b.mtime);
    for (const entry of entries) {
      if (total <= MAX_AUDIO_CACHE) break;
      await fsp.unlink(entry.file);
      total -= entry.size;
    }
    console.log(`[audio] cache pruned to ${(total / 1e6).toFixed(1)} MB`);
  } catch (err) {
    console.warn('[audio] cache prune failed:', err.message);
  }
}

function touch(key, value) {
  memory.delete(key);
  memory.set(key, value);
  while (memory.size > MEMORY_LIMIT) memory.delete(memory.keys().next().value);
}

function norm(s = '') {
  return s
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

async function fetchJson(url, timeout = 12000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'user-agent': 'HitsterWeb/1.0 (+https://github.com/openhands/hitster-web)' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function deezerPreview(trackId) {
  const data = await fetchJson(`https://api.deezer.com/2.0/track/${trackId}`);
  if (!data?.preview) throw new Error('deezer: no preview');
  return { url: data.preview, contentType: 'audio/mpeg', ext: 'mp3' };
}

async function itunesPreview(trackId) {
  const data = await fetchJson(`https://itunes.apple.com/lookup?id=${trackId}&country=DE`);
  const item = data?.results?.[0];
  if (!item?.previewUrl) throw new Error('itunes: no preview');
  return {
    url: item.previewUrl,
    contentType: item.previewUrl.includes('.m4a') ? 'audio/mp4' : 'audio/mpeg',
    ext: item.previewUrl.includes('.m4a') ? 'm4a' : 'mp3',
  };
}

async function searchDeezer(song) {
  const q = `${song.title} ${song.artist}`;
  const data = await fetchJson(
    `https://api.deezer.com/2.0/search?q=${encodeURIComponent(q)}&limit=10`
  );
  const target = norm(song.title);
  const artist = norm(song.artist);
  const cand = (data?.data || []).find((t) => {
    const nt = norm(t.title);
    const na = norm(t.artist?.name);
    return t.preview && (nt === target || nt.includes(target)) && (na.includes(artist) || artist.includes(na));
  });
  if (!cand) throw new Error('deezer search: no match');
  return { url: cand.preview, contentType: 'audio/mpeg', ext: 'mp3' };
}

async function searchItunes(song) {
  const q = `${song.title} ${song.artist}`;
  const data = await fetchJson(
    `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=song&limit=10&country=DE`
  );
  const target = norm(song.title);
  const artist = norm(song.artist);
  const cand = (data?.results || []).find((t) => {
    const nt = norm(t.trackName);
    const na = norm(t.artistName);
    return t.previewUrl && (nt === target || nt.includes(target)) && (na.includes(artist) || artist.includes(na));
  });
  if (!cand) throw new Error('itunes search: no match');
  return {
    url: cand.previewUrl,
    contentType: cand.previewUrl.includes('.m4a') ? 'audio/mp4' : 'audio/mpeg',
    ext: cand.previewUrl.includes('.m4a') ? 'm4a' : 'mp3',
  };
}

async function resolvePreview(song) {
  const attempts = [];
  if (song.deezerId) attempts.push(() => deezerPreview(song.deezerId));
  if (song.itunesId) attempts.push(() => itunesPreview(song.itunesId));
  attempts.push(() => searchDeezer(song));
  attempts.push(() => searchItunes(song));

  let lastErr;
  for (const attempt of attempts) {
    try {
      return await attempt();
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('no audio source');
}

async function download(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'user-agent': 'HitsterWeb/1.0' },
    });
    if (!res.ok) throw new Error(`audio HTTP ${res.status}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length < 4000) throw new Error('audio too small');
    const type = (res.headers.get('content-type') || 'audio/mpeg').split(';')[0];
    const isM4a = /m4a|mp4/i.test(type);
    return { buffer, contentType: isM4a ? 'audio/mp4' : 'audio/mpeg', ext: isM4a ? 'm4a' : 'mp3' };
  } finally {
    clearTimeout(timer);
  }
}

export async function getAudio(song) {
  const cached = memory.get(song.id);
  if (cached) {
    touch(song.id, cached);
    return cached;
  }
  if (inflight.has(song.id)) return inflight.get(song.id);

  const task = (async () => {
    const files = fs.readdirSync(CACHE_DIR).filter((f) => f.startsWith(`${song.id}.`));
    if (files.length) {
      const file = path.join(CACHE_DIR, files[0]);
      const buffer = await fsp.readFile(file);
      const isM4a = buffer.subarray(4, 8).toString() === 'ftyp';
      const contentType = isM4a ? 'audio/mp4' : 'audio/mpeg';
      const entry = { buffer, contentType, file };
      touch(song.id, entry);
      return entry;
    }

    const preview = await resolvePreview(song);
    const { buffer, contentType, ext } = await download(preview.url);
    const file = path.join(CACHE_DIR, `${song.id}.${ext}`);
    await fsp.writeFile(file, buffer);
    pruneAudioCache();
    const entry = { buffer, contentType, file };
    touch(song.id, entry);
    return entry;
  })();

  inflight.set(song.id, task);
  try {
    return await task;
  } finally {
    inflight.delete(song.id);
  }
}

export async function getArt(song) {
  if (!song?.art) return null;
  const file = path.join(ART_DIR, `${song.id}.img`);
  if (fs.existsSync(file)) {
    return { buffer: await fsp.readFile(file), contentType: 'image/jpeg' };
  }
  if (artInflight.has(song.id)) return artInflight.get(song.id);
  const task = (async () => {
    const res = await fetch(song.art, { headers: { 'user-agent': 'HitsterWeb/1.0' } });
    if (!res.ok) throw new Error(`art HTTP ${res.status}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    const contentType = (res.headers.get('content-type') || 'image/jpeg').split(';')[0];
    await fsp.writeFile(file, buffer);
    return { buffer, contentType };
  })();
  artInflight.set(song.id, task);
  try {
    return await task;
  } finally {
    artInflight.delete(song.id);
  }
}

export function parseRange(range, size) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(range || '');
  if (!m) return null;
  let start = m[1] === '' ? null : Number(m[1]);
  let end = m[2] === '' ? null : Number(m[2]);
  if (start === null && end === null) return null;
  if (start === null) {
    start = Math.max(0, size - end);
    end = size - 1;
  } else if (end === null || end >= size) {
    end = size - 1;
  }
  if (start > end || start >= size) return { invalid: true };
  return { start, end };
}
