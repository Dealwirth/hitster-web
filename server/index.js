import express from 'express';
import compression from 'compression';
import QRCode from 'qrcode';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  songs,
  byId,
  genres,
  decades,
  stats,
  generatedAt,
  publicSong,
  publicSongs,
  randomSong,
  filterSongs,
} from './catalog.js';
import { getAudio, getArt, parseRange } from './audio.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, '../public');
const PORT = Number(process.env.PORT || 12000);

const ARTIST_TYPES = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.resolve(__dirname, '../data/artist-types.json'), 'utf8')).artists || {};
  } catch {
    return {};
  }
})();
const YEAR_OVERRIDES = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.resolve(__dirname, '../data/year-overrides.json'), 'utf8')).songs || {};
  } catch {
    return {};
  }
})();
const HITSTER_CARDS = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.resolve(__dirname, '../public/hitster-cards.json'), 'utf8')).cards || {};
  } catch {
    return {};
  }
})();

export const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);
app.use(compression());

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "img-src 'self' data: https:",
      "media-src 'self' https: data:",
      "style-src 'self' 'unsafe-inline'",
      "font-src 'self'",
      "script-src 'self'",
      "worker-src 'self'",
      "connect-src 'self' https: wss:",
      "frame-src https://open.spotify.com",
      "base-uri 'none'",
      "form-action 'none'",
    ].join('; ')
  );
  next();
});

app.use((req, res, next) => {
  if (req.query.v && /\.(?:css|js|mjs|woff2?)$/.test(req.path)) {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  }
  next();
});

app.use(
  express.static(PUBLIC_DIR, {
    etag: true,
    maxAge: '5m',
    setHeaders(res, filePath) {
      if (filePath.endsWith('index.html')) res.setHeader('Cache-Control', 'no-cache');
    },
  })
);

const api = express.Router();
const resolveCache = new Map();
const spotifyTrackCache = new Map();
const playlistCache = new Map();
const PLAYLIST_CACHE_DIR = path.resolve(__dirname, '../data/.cache/playlists');
fs.mkdirSync(PLAYLIST_CACHE_DIR, { recursive: true });
const PLAYLIST_DISK_TTL = 7 * 24 * 60 * 60 * 1000;

function readPlaylistDisk(id) {
  try {
    const file = path.join(PLAYLIST_CACHE_DIR, `${id}.json`);
    if (!fs.existsSync(file)) return null;
    const stat = fs.statSync(file);
    if (Date.now() - stat.mtimeMs > PLAYLIST_DISK_TTL) return null;
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    return data?.songs?.length ? data : null;
  } catch { return null; }
}

function writePlaylistDisk(id, data) {
  try {
    const file = path.join(PLAYLIST_CACHE_DIR, `${id}.json`);
    fs.writeFileSync(file, JSON.stringify(data));
  } catch { /* cache is best effort */ }
}

api.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Accept, Content-Type, Range');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});

function decodeHtml(value = '') {
  return String(value)
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function normalizeText(value = '') {
  return String(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function cacheResolve(id, result) {
  if (resolveCache.size > 500) resolveCache.delete(resolveCache.keys().next().value);
  resolveCache.set(id, result);
}

function matchCatalog(title, artist) {
  const nt = normalizeText(title);
  const na = normalizeText(artist);
  if (!nt) return null;
  return songs.find((s) => normalizeText(s.title) === nt && na && normalizeText(s.artist).includes(na))
    || songs.find((s) => normalizeText(s.title) === nt && na && na.includes(normalizeText(s.artist)))
    || songs.find((s) => normalizeText(s.title) === nt)
    || songs.find((s) => nt.length > 4 && normalizeText(s.title).includes(nt))
    || null;
}

async function fetchSpotifyPage(id) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(`https://open.spotify.com/track/${id}`, {
      signal: ctrl.signal,
      headers: {
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        'accept-language': 'de-DE,de;q=0.9,en;q=0.8',
      },
    });
    if (!res.ok) throw new Error(`spotify HTTP ${res.status}`);
    const html = await res.text();
    const title = decodeHtml(html.match(/<meta property="og:title" content="([^"]*)"/)?.[1] || '');
    const description = decodeHtml(html.match(/<meta property="og:description" content="([^"]*)"/)?.[1] || '');
    const parts = description.split(' · ').map((x) => x.trim()).filter(Boolean);
    const artist = parts[0] || '';
    const year = Number((description.match(/\b(19[5-9]\d|20[0-2]\d)\b/) || [])[1]);
    return { title, artist, year: year >= 1950 && year <= 2024 ? year : null };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchSpotifyOembed(id) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    const target = encodeURIComponent(`https://open.spotify.com/track/${id}`);
    const res = await fetch(`https://open.spotify.com/oembed?url=${target}`, {
      signal: ctrl.signal,
      headers: { 'user-agent': 'Mozilla/5.0' },
    });
    if (!res.ok) throw new Error(`spotify oembed HTTP ${res.status}`);
    const data = await res.json();
    return { title: decodeHtml(data.title || ''), artist: '', year: null };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchSpotifyMeta(id) {
  try {
    const page = await fetchSpotifyPage(id);
    if (page.title && !/^(spotify|log in|anmelden)$/i.test(page.title)) return page;
  } catch { /* fall back to oEmbed */ }
  return fetchSpotifyOembed(id);
}

function parseNextData(html) {
  const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

let spotifySettings = null;
let spotifyNext = 0;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function spotifyWait() {
  const wait = Math.max(0, spotifyNext - Date.now());
  spotifyNext = Math.max(Date.now(), spotifyNext) + 1200;
  if (wait) await sleep(wait);
}

async function fetchSpotifyEmbed(kind, id) {
  let lastError;
  for (let attempt = 0; attempt < 4; attempt++) {
    await spotifyWait();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10000);
    try {
      const res = await fetch(`https://open.spotify.com/embed/${kind}/${encodeURIComponent(id)}`, {
        signal: ctrl.signal,
        headers: {
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
          'accept-language': 'de-DE,de;q=0.9,en;q=0.8',
        },
      });
      if (res.status === 429) {
        const retry = Math.min(Number(res.headers.get('retry-after')) || (attempt + 1) * 2, 4);
        lastError = new Error('spotify rate limited');
        await sleep(retry * 1000);
        continue;
      }
      if (!res.ok) throw new Error(`spotify embed HTTP ${res.status}`);
      const data = parseNextData(await res.text());
      const settings = data?.props?.pageProps?.state?.settings;
      if (settings?.session?.accessToken) spotifySettings = settings;
      const entity = data?.props?.pageProps?.state?.data?.entity;
      if (!entity && !settings?.session?.accessToken) throw new Error('spotify embed without entity');
      return entity || null;
    } catch (err) {
      lastError = err;
      if (attempt < 3) await sleep(1500 * (attempt + 1));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError || new Error('spotify embed failed');
}

const SPOTIFY_PLAYLIST_HASHES = [
  'a65e12194ed5fc443a1cdebed5fabe33ca5b07b987185d63c72483867ad13cb4',
  '864fdecccb9bb893141df3776d0207886c7fa781d9e586b9d4eb3afa387eea42',
  '32b05e92e438438408674f95d0fdad8082865dc32acd55bd97f5113b8579092b',
  '86dde7b9d9356e2369414647cf6950cfed96e778e129cfdfc99aea6c1613b3b0',
  '8964e8eafb21aa992a7d951d256d83285c04be2105d209262901de70cb97584a',
];
let spotifyPlaylistHash = SPOTIFY_PLAYLIST_HASHES[0];

async function ensureSpotifyToken() {
  const current = spotifySettings?.session;
  if (current?.accessToken && (current.accessTokenExpirationTimestampMs || 0) > Date.now() + 60000) return;
  const sources = [
    ['playlist', '37i9dQZF1DWXRqgorJj26U'],
    ['track', '4cOdK2wGLETKBW3PvgPWqT'],
  ];
  for (const [kind, id] of sources) {
    try {
      await fetchSpotifyEmbed(kind, id);
      if (spotifySettings?.session?.accessToken) return;
    } catch { /* try the next public embed */ }
  }
  throw new Error('spotify guest token unavailable');
}

async function spotifyPathfinderPlaylist(id, offset, limit = 50) {
  try {
    await fetchSpotifyEmbed('playlist', id);
  } catch { /* the target embed may omit settings; use a public fallback token */ }
  await ensureSpotifyToken();
  const variables = { uri: `spotify:playlist:${id}`, offset, limit };
  const order = [spotifyPlaylistHash, ...SPOTIFY_PLAYLIST_HASHES.filter((h) => h !== spotifyPlaylistHash)];
  let lastError = null;
  for (const hash of order) {
    const params = new URLSearchParams({
      operationName: 'fetchPlaylistContents',
      variables: JSON.stringify(variables),
      extensions: JSON.stringify({ persistedQuery: { version: 1, sha256Hash: hash } }),
    });
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12000);
    let res;
    try {
      res = await fetch(`https://api-partner.spotify.com/pathfinder/v1/query?${params}`, {
        signal: ctrl.signal,
        headers: {
          authorization: `Bearer ${spotifySettings.session.accessToken}`,
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36',
          'accept-language': 'de-DE,de;q=0.9,en;q=0.8',
        },
      });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) {
      lastError = new Error(`spotify pathfinder HTTP ${res.status}`);
      continue;
    }
    const data = await res.json();
    const content = data?.data?.playlistV2?.content;
    if (content) {
      spotifyPlaylistHash = hash;
      return {
        items: content.items || [],
        total: Number(content.totalCount) || 0,
      };
    }
    lastError = new Error('spotify pathfinder without playlist content');
  }
  throw lastError || new Error('spotify pathfinder failed');
}

function spotifyItemTrack(item) {
  const track = item?.itemV2?.data;
  if (!track || track.__typename !== 'Track') return null;
  const spotifyId = String(track.uri || '').split(':').pop();
  if (!/^[A-Za-z0-9]{22}$/.test(spotifyId)) return null;
  const artistNames = (track.artists?.items || [])
    .map((a) => a.profile?.name)
    .filter(Boolean);
  const artist = artistNames[0] || '';
  const images = track.albumOfTrack?.coverArt?.sources || [];
  const art = [...images].sort((a, b) => (b.width || 0) - (a.width || 0))[0]?.url || null;
  return {
    spotifyId,
    title: track.name || '',
    artist,
    artistNames,
    artUrl: art,
    duration: track.trackDuration?.totalMilliseconds || null,
    previewUrl: item._previewUrl || null,
    _releaseDate: item._releaseDate || null,
  };
}

const SPORTIFY_API = 'https://sportify.xcasper.space';
async function sportifyJson(url, timeout = 15000) {
  const data = await fetchJsonTimed(url, timeout);
  if (data?.success === false) throw new Error(data.error || 'Sportify API error');
  return data;
}
async function sportifyToken() {
  const data = await sportifyJson(`${SPORTIFY_API}/api/token`);
  if (!data.access_token) throw new Error('Sportify token missing');
  return data.access_token;
}
async function sportifyTrack(id) {
  const data = await sportifyJson(`${SPORTIFY_API}/api/track/${id}`);
  return data.track || null;
}
const BASE62 = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
function spotifyGid(id) {
  let value = 0n;
  for (const char of String(id)) {
    const digit = BASE62.indexOf(char);
    if (digit < 0) return null;
    value = value * 62n + BigInt(digit);
  }
  return value.toString(16).padStart(32, '0');
}
async function spotifyMetadataTrack(id, token) {
  const gid = spotifyGid(id);
  if (!gid) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(`https://spclient.wg.spotify.com/metadata/4/track/${gid}?market=from_token`, {
      signal: ctrl.signal,
      headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`metadata HTTP ${res.status}`);
    const meta = await res.json();
    const date = meta.album?.date || {};
    const image = (meta.album?.cover_group?.image || []).sort((a, b) => (b.width || 0) - (a.width || 0))[0];
    return {
      id,
      title: meta.name || '',
      artist: meta.artist?.[0]?.name || '',
      release_date: date.year ? `${date.year}-${String(date.month || 1).padStart(2, '0')}-${String(date.day || 1).padStart(2, '0')}T00:00:00Z` : null,
      thumbnail: image?.file_id ? `https://i.scdn.co/image/${image.file_id}` : null,
      duration_ms: meta.duration || null,
      preview_url: null,
      isrc: meta.external_id?.find((x) => x.type === 'isrc')?.id || null,
    };
  } finally {
    clearTimeout(timer);
  }
}
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next++;
      out[index] = await fn(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}
async function fetchSportifyPlaylist(id) {
  const data = await sportifyJson(`${SPORTIFY_API}/api/playlist/${id}`);
  const playlist = data.playlist;
  if (!playlist) throw new Error('Sportify playlist missing');
  const tracks = new Map((playlist.tracks || []).map((track) => [track.id, track]));
  const total = Number(playlist.total_tracks) || tracks.size;
  if (total > tracks.size) {
    try {
      const token = await sportifyToken();
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 15000);
      let sp;
      try {
        const res = await fetch(`https://spclient.wg.spotify.com/playlist/v2/playlist/${id}`, {
          signal: ctrl.signal,
          headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
        });
        if (!res.ok) throw new Error(`spclient HTTP ${res.status}`);
        sp = await res.json();
      } finally {
        clearTimeout(timer);
      }
      const ids = (sp?.contents?.items || [])
        .map((item) => String(item.uri || '').split(':').pop())
        .filter((trackId) => /^[A-Za-z0-9]{22}$/.test(trackId));
      const missing = [...new Set(ids.filter((trackId) => !tracks.get(trackId)?.release_date))];
      await mapLimit(missing, 12, async (trackId) => {
        try {
          const track = await spotifyMetadataTrack(trackId, token);
          if (track) {
            const existing = tracks.get(trackId) || {};
            tracks.set(trackId, {
              ...existing,
              ...track,
              preview_url: existing.preview_url || track.preview_url || null,
            });
          }
        } catch {
          try {
            const track = await sportifyTrack(trackId);
            if (track) tracks.set(trackId, track);
          } catch { /* keep the URI, metadata will be skipped */ }
        }
      });
      const ordered = [];
      for (const trackId of ids) {
        const track = tracks.get(trackId);
        if (track) ordered.push(track);
      }
      tracks.clear();
      for (const track of ordered) tracks.set(track.id, track);
    } catch (err) {
      console.warn('[playlist] Sportify full list failed:', err.message);
    }
  }
  return {
    name: playlist.name || 'Spotify Playlist',
    cover: playlist.thumbnail || null,
    total,
    tracks: [...tracks.values()],
  };
}

function fallbackRawItems(tracks) {
  return tracks.map((track) => ({
    itemV2: { data: {
      __typename: 'Track',
      uri: `spotify:track:${track.id}`,
      name: track.title,
      artists: { items: [{ profile: { name: track.artist } }] },
      albumOfTrack: { coverArt: { sources: [{ url: track.thumbnail, width: 640 }] } },
      trackDuration: { totalMilliseconds: track.duration_ms },
    } },
    _previewUrl: track.preview_url || null,
    _releaseDate: track.release_date || null,
  }));
}

async function fetchAllPlaylistItems(id) {
  const first = await spotifyPathfinderPlaylist(id, 0, 50);
  const items = [...first.items];
  const total = Math.min(first.total || items.length, 5000);
  for (let offset = items.length; offset < total; offset += 50) {
    const page = await spotifyPathfinderPlaylist(id, offset, 50);
    if (!page.items.length) break;
    items.push(...page.items);
    if (items.length >= total) break;
  }
  return { items, total };
}

function bestSpotifyImage(entity) {
  const images = entity?.visualIdentity?.image || entity?.coverArt?.sources || [];
  return [...images].sort((a, b) => (b.maxWidth || b.width || 0) - (a.maxWidth || a.width || 0))[0]?.url || null;
}

function spotifyTrackFromEntity(id, entity) {
  const releaseDate = entity?.releaseDate?.isoString || null;
  const year = releaseDate ? new Date(releaseDate).getUTCFullYear() : null;
  const artistNames = (entity?.artists || []).map((a) => a.name).filter(Boolean);
  const artist = artistNames[0] || entity?.subtitle || '';
  return {
    spotifyId: id,
    title: entity?.title || entity?.name || '',
    artist,
    artistNames,
    year: year >= 1950 && year <= 2030 ? year : null,
    releaseDate,
    previewUrl: entity?.audioPreview?.url || null,
    artUrl: bestSpotifyImage(entity),
    duration: entity?.duration || null,
    group: artistNames.length > 1 ? true : inferGroup(artist),
    source: 'spotify',
  };
}

const mbCache = new Map();
let mbNext = 0;
async function mbFetchJson(url) {
  const wait = Math.max(0, mbNext - Date.now());
  mbNext = Math.max(Date.now(), mbNext) + 1050;
  if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'user-agent': 'HITSTER-Web/4.0 (https://github.com/Dealwirth/hitster-web)' },
    });
    if (!res.ok) throw new Error(`MusicBrainz HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function musicBrainzMeta(title, artist) {
  const cleanTitle = String(title || '')
    .replace(/\s*[\(\[].*?[\)\]]/g, '')
    .replace(/\s+-\s+.*$/, '')
    .replace(/["\\]/g, ' ')
    .trim();
  const cleanArtist = String(artist || '').split(',')[0].replace(/["\\]/g, ' ').trim();
  if (!cleanTitle) return null;
  const key = `${normalizeText(cleanTitle)}|${normalizeText(cleanArtist)}`;
  if (mbCache.has(key)) return mbCache.get(key);
  const override = yearOverride(cleanTitle, cleanArtist);
  if (override) {
    const result = { year: override, group: inferGroup(cleanArtist), source: 'override' };
    mbCache.set(key, result);
    return result;
  }
  const titleWords = cleanTitle.split(/\s+/).filter((w) => w.length > 1);
  const titleQuery = titleWords.length > 1
    ? `recording:(${titleWords.join(' AND ')})`
    : `recording:${titleWords[0] || cleanTitle}`;
  const query = `${titleQuery}${cleanArtist ? ` AND artist:"${cleanArtist}"` : ''}`;
  try {
    let data = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        data = await mbFetchJson(`https://musicbrainz.org/ws/2/recording/?query=${encodeURIComponent(query)}&fmt=json&limit=100`);
        break;
      } catch (err) {
        if (attempt === 3) throw err;
        await new Promise((resolve) => setTimeout(resolve, 1400 * (attempt + 1)));
      }
    }
    let best = null;
    const nt = normalizeText(cleanTitle);
    for (const recording of data.recordings || []) {
      const rt = normalizeText(recording.title);
      if (!(rt === nt || (rt.includes(nt) && !/\b(live|remix|karaoke|cover|demo)\b/i.test(recording.title)))) continue;
      const dates = [recording['first-release-date'], ...(recording.releases || []).map((release) => release.date)]
        .filter(Boolean).sort();
      const date = dates[0];
      const year = date ? Number(String(date).slice(0, 4)) : null;
      if (!year || year < 1950 || year > 2030) continue;
      if (!best || year < best.year) best = { year, recording };
    }
    let group = null;
    const artistCredit = best?.recording?.['artist-credit']?.[0]?.artist;
    if (artistCredit?.type === 'Group') group = true;
    else if (artistCredit?.type === 'Person') group = false;
    const result = best ? { year: best.year, group, source: 'musicbrainz' } : null;
    if (mbCache.size > 1000) mbCache.delete(mbCache.keys().next().value);
    mbCache.set(key, result);
    return result;
  } catch {
    mbCache.delete(key);
    return null;
  }
}


const yearCache = new Map();
async function itunesYear(title, artist) {
  const key = `${normalizeText(title)}|${normalizeText(artist)}`;
  if (yearCache.has(key)) return yearCache.get(key);
  const cleanTitle = String(title || '')
    .replace(/\s*[\(\[].*?[\)\]]/g, '')
    .replace(/\s+-\s+.*$/, '')
    .trim() || title;
  const override = yearOverride(cleanTitle, artist);
  if (override) return override;
  try {
    const data = await fetchJsonTimed(`https://itunes.apple.com/search?term=${encodeURIComponent(`${cleanTitle} ${artist}`)}&entity=song&limit=8&country=DE`);
    const nt = normalizeText(cleanTitle);
    const na = normalizeText(artist);
    let best = null;
    for (const item of data?.results || []) {
      const tTitle = normalizeText(item.trackName);
      const tArtist = normalizeText(item.artistName);
      if (!(tTitle === nt || tTitle.includes(nt) || nt.includes(tTitle))) continue;
      if (na && !(tArtist.includes(na) || na.includes(tArtist))) continue;
      const year = Number(String(item.releaseDate || '').slice(0, 4));
      if (year >= 1950 && year <= 2030 && (!best || year < best)) best = year;
    }
    if (yearCache.size > 1500) yearCache.delete(yearCache.keys().next().value);
    yearCache.set(key, best);
    return best;
  } catch {
    yearCache.set(key, null);
    return null;
  }
}

async function getSpotifyTrack(id, { mb = true } = {}) {
  if (spotifyTrackCache.has(id)) {
    const cached = spotifyTrackCache.get(id);
    if (mb && !cached.yearSource) {
      const override = yearOverride(cached.title, cached.artist);
      const mbm = override ? null : await musicBrainzMeta(cached.title, cached.artist);
      const itYear = (override || mbm?.year) ? null : await itunesYear(cached.title, cached.artist);
      const years = [override, mbm?.year, itYear, Number(String(cached.releaseDate || '').slice(0, 4))].filter((y) => y >= 1950 && y <= 2030);
      cached.year = years.length ? Math.min(...years) : cached.year;
      if (!Object.prototype.hasOwnProperty.call(ARTIST_TYPES, artistTypeKey(cached.artist))) {
        await ensureArtistTypes([cached.artist]);
      }
      if (mbm?.group != null) cached.group = mbm.group;
      else cached.group = (cached.artistNames?.length > 1) ? true : inferGroup(cached.artist);
      cached.yearSource = override ? 'override' : (mbm?.year ? 'musicbrainz' : (itYear ? 'itunes' : 'spotify'));
    }
    return cached;
  }
  try {
    const entity = await fetchSpotifyEmbed('track', id);
    const track = spotifyTrackFromEntity(id, entity);
    if (!track.title) throw new Error('spotify track without title');
    if (mb) {
      const override = yearOverride(track.title, track.artist);
      const mbm = override ? null : await musicBrainzMeta(track.title, track.artist);
      const itYear = (override || mbm?.year) ? null : await itunesYear(track.title, track.artist);
      const years = [override, mbm?.year, itYear, Number(String(track.releaseDate || '').slice(0, 4))].filter((y) => y >= 1950 && y <= 2030);
      track.year = years.length ? Math.min(...years) : track.year;
      if (!Object.prototype.hasOwnProperty.call(ARTIST_TYPES, artistTypeKey(track.artist))) {
        await ensureArtistTypes([track.artist]);
      }
      if (mbm?.group != null) track.group = mbm.group;
      else track.group = (track.artistNames?.length > 1) ? true : inferGroup(track.artist);
      track.yearSource = override ? 'override' : (mbm?.year ? 'musicbrainz' : (itYear ? 'itunes' : 'spotify'));
    }
    if (spotifyTrackCache.size > 1000) spotifyTrackCache.delete(spotifyTrackCache.keys().next().value);
    spotifyTrackCache.set(id, track);
    return track;
  } catch (err) {
    const meta = await fetchSpotifyMeta(id);
    const track = {
      spotifyId: id,
      title: meta.title || '',
      artist: meta.artist || '',
      year: yearOverride(meta.title, meta.artist) || meta.year || null,
      releaseDate: null,
      previewUrl: null,
      artUrl: null,
      duration: null,
      group: inferGroup(meta.artist),
      source: 'spotify',
    };
    if (!track.title) throw err;
    return track;
  }
}

function parsePlaylistId(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  let match = raw.match(/^spotify:playlist:([A-Za-z0-9]{22})$/i);
  if (match) return match[1];
  if (/^[A-Za-z0-9]{22}$/.test(raw)) return raw;
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    match = url.pathname.match(/\/playlist\/([A-Za-z0-9]{22})/);
    return match?.[1] || null;
  } catch {
    return null;
  }
}

function artistTypeKey(artist) {
  return normalizeText(artist);
}
function hasArtistSeparator(artist) {
  return /(?:\s(?:&|and|x|vs\.?|feat\.?|ft\.?|with)\s|,|\/|\+)/i.test(String(artist || ''));
}
function inferGroup(artist) {
  const known = ARTIST_TYPES[artistTypeKey(artist)];
  if (known && typeof known.group === 'boolean') return known.group;
  return hasArtistSeparator(artist);
}
function yearOverride(title, artist) {
  const cleanTitle = String(title || '')
    .replace(/\s*[\(\[].*?[\)\]]/g, '')
    .replace(/\s+-\s+.*$/, '')
    .trim() || title;
  const key = `${normalizeText(cleanTitle)}|${normalizeText(artist)}`;
  const year = Number(YEAR_OVERRIDES[key]);
  return year >= 1950 && year <= 2030 ? year : null;
}
const artistTypeLookups = new Map();
async function ensureArtistTypes(artists) {
  const missing = [...new Set(artists.map((a) => String(a || '').trim()).filter(Boolean))]
    .filter((a) => !Object.prototype.hasOwnProperty.call(ARTIST_TYPES, artistTypeKey(a)))
    .filter((a) => !artistTypeLookups.has(artistTypeKey(a)));
  if (!missing.length) return;
  for (let i = 0; i < missing.length; i += 35) {
    const batch = missing.slice(i, i + 35);
    const query = batch.map((name) => `artist:"${name.replace(/["\\]/g, ' ').trim()}"`).join(' OR ');
    try {
      const data = await mbFetchJson(`https://musicbrainz.org/ws/2/artist/?query=${encodeURIComponent(query)}&fmt=json&limit=100`);
      for (const name of batch) {
        const key = artistTypeKey(name);
        const exact = (data.artists || [])
          .filter((a) => normalizeText(a.name) === key && a.type)
          .sort((a, b) => (b.score || 0) - (a.score || 0))[0];
        if (!exact) {
          artistTypeLookups.set(key, null);
          continue;
        }
        const group = /^(Group|Orchestra|Choir)$/i.test(exact.type) ? true
          : /^Person$/i.test(exact.type) ? false : null;
        artistTypeLookups.set(key, group);
        if (group != null) ARTIST_TYPES[key] = { group, source: 'musicbrainz', mbid: exact.id };
      }
    } catch {
      for (const name of batch) artistTypeLookups.set(artistTypeKey(name), null);
    }
  }
}


const GENRE_RULES = [
  [/deutschrap|german rap|rap.*deutsch/i, 'deutschrap'],
  [/neue deutsche welle|\bndw\b/i, 'ndw'],
  [/deutschpop|german pop/i, 'deutschpop'],
  [/schlager|volksmusik/i, 'schlager'],
  [/metal|hardcore|metalcore/i, 'metal'],
  [/punk|emo|grunge/i, 'punk'],
  [/hip.?hop|rap|trap/i, 'hiphop'],
  [/r&b|rnb|soul/i, 'rnb'],
  [/funk|disco/i, 'funk'],
  [/electronic|dance|house|techno|edm|electro/i, 'electronic'],
  [/indie|alternative/i, 'indie'],
  [/rock|grunge|britpop/i, 'rock'],
  [/pop/i, 'pop'],
  [/country|americana/i, 'country'],
  [/folk|singer.?songwriter|acoustic/i, 'folk'],
  [/jazz|blues/i, 'jazz'],
  [/latin|salsa|bachata|reggaeton|world/i, 'latin'],
  [/reggae|dancehall/i, 'reggae'],
  [/ska/i, 'ska'],
  [/soundtrack|film|musical|score/i, 'film'],
  [/classical|klassik|opera/i, 'klassik'],
];
const genreCache = new Map();
const artistGenreMap = new Map();
for (const song of songs) {
  const key = normalizeText(song.artist);
  if (!key) continue;
  const bucket = artistGenreMap.get(key) || new Map();
  bucket.set(song.genre, (bucket.get(song.genre) || 0) + 1);
  artistGenreMap.set(key, bucket);
}
function artistGenreFor(artist) {
  const full = normalizeText(artist);
  const first = normalizeText(String(artist || '').split(/\s*(?:,|&|\bfeat\.?|\bft\.?|\bwith\b|\bx\b|\/)\s*/i)[0]);
  for (const key of [full, first]) {
    const bucket = artistGenreMap.get(key);
    if (!bucket) continue;
    return [...bucket.entries()].sort((a, b) => b[1] - a[1])[0][0];
  }
  return null;
}
function inferPlaylistGenre(name) {
  const text = String(name || '');
  for (const [re, genre] of GENRE_RULES) if (re.test(text)) return genre;
  return null;
}

function mapGenre(raw) {
  const value = String(raw || '').trim();
  if (!value) return null;
  for (const [re, genre] of GENRE_RULES) if (re.test(value)) return genre;
  return null;
}

function mapGenres(list) {
  const out = [];
  for (const raw of list || []) {
    const genre = mapGenre(raw);
    if (genre && !out.includes(genre)) out.push(genre);
  }
  return out;
}

async function fetchJsonTimed(url, timeout = 8000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'user-agent': 'HITSTER-Web/4.2 (https://github.com/Dealwirth/hitster-web)' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function deezerGenre(title, artist) {
  const data = await fetchJsonTimed(`https://api.deezer.com/2.0/search?q=${encodeURIComponent(`${title} ${artist}`)}&limit=8`);
  const nt = normalizeText(title);
  const na = normalizeText(artist);
  const candidates = data?.data || [];
  const track = candidates.find((t) => {
    const tTitle = normalizeText(t.title);
    const tArtist = normalizeText(t.artist?.name);
    return t.album?.id && (tTitle === nt || tTitle.includes(nt) || nt.includes(tTitle))
      && (!na || tArtist.includes(na) || na.includes(tArtist));
  }) || candidates.find((t) => t.album?.id);
  if (!track?.album?.id) return null;
  const album = await fetchJsonTimed(`https://api.deezer.com/2.0/album/${track.album.id}`);
  const genres = mapGenres((album.genres?.data || []).map((g) => g.name));
  return genres.length ? { genre: genres[0], genres } : null;
}

async function itunesGenre(title, artist) {
  const data = await fetchJsonTimed(`https://itunes.apple.com/search?term=${encodeURIComponent(`${title} ${artist}`)}&entity=song&limit=8&country=DE`);
  const nt = normalizeText(title);
  const na = normalizeText(artist);
  const track = (data?.results || []).find((t) => {
    const tTitle = normalizeText(t.trackName);
    const tArtist = normalizeText(t.artistName);
    return (tTitle === nt || tTitle.includes(nt) || nt.includes(tTitle))
      && (!na || tArtist.includes(na) || na.includes(tArtist));
  });
  const genre = mapGenre(track?.primaryGenreName);
  return genre ? { genre, genres: [genre] } : null;
}

async function trackGenre(title, artist) {
  const key = `${normalizeText(title)}|${normalizeText(artist)}`;
  if (genreCache.has(key)) return genreCache.get(key);
  let result = null;
  try { result = await deezerGenre(title, artist); } catch { /* try iTunes */ }
  if (!result) {
    try { result = await itunesGenre(title, artist); } catch { /* unknown */ }
  }
  if (!result) result = { genre: 'unbekannt', genres: [] };
  if (genreCache.size > 3000) genreCache.delete(genreCache.keys().next().value);
  genreCache.set(key, result);
  return result;
}


const REGION_LANG = {
  de: 'Germany', at: 'Germany', ch: 'Switzerland', nl: 'Netherlands', be: 'Belgium',
  fr: 'France', es: 'Spain', it: 'Italy', uk: 'United Kingdom', gb: 'United Kingdom',
  us: 'United States of America', ca: 'Canada', au: 'Australia', nz: 'New Zealand',
  se: 'Sweden', no: 'Nordics', dk: 'Nordics', fi: 'Nordics', is: 'Iceland',
  pl: 'Poland', pt: 'Portugal', br: 'Brazil', mx: 'Mexico', ar: 'Argentina',
  cl: 'Chile', pe: 'Peru', il: 'Israel', jp: 'Japan', kr: 'Korea', tw: 'Taiwan',
  hk: 'Hong Kong', hu: 'Hungary', cz: 'Czechia/Slovakia', sk: 'Czechia/Slovakia',
  ro: 'Romania', hr: 'Croatia', gr: 'Greece', lt: 'Baltics', lv: 'Baltics', ee: 'Baltics',
};
let hitsterDb = null;
function loadHitsterDb() {
  if (hitsterDb) return hitsterDb;
  hitsterDb = JSON.parse(fs.readFileSync(path.join(PUBLIC_DIR, 'hitster-db.json'), 'utf8'));
  return hitsterDb;
}
function pickHitsterSet(candidates, region, sku) {
  if (sku && sku !== 'auto') {
    const selected = candidates.find((set) => set.sku === sku);
    if (selected) return selected;
  }
  const lang = REGION_LANG[region] || '';
  const regional = candidates.filter((set) => set.region === lang);
  const pool = regional.length ? regional : candidates;
  return pool.find((set) => /^Hitster Original$/i.test(set.name))
    || pool.find((set) => /Original/i.test(set.name))
    || pool.find((set) => /Bingo/i.test(set.name))
    || pool[0];
}

async function buildPlaylist(id) {
  if (playlistCache.has(id)) return playlistCache.get(id);
  const disk = readPlaylistDisk(id);
  if (disk) {
    playlistCache.set(id, disk);
    return disk;
  }
  let entity = null;
  try {
    entity = await fetchSpotifyEmbed('playlist', id);
  } catch { /* pathfinder can still resolve the playlist */ }
  let cover = bestSpotifyImage(entity);
  let rawItems = [];
  let total = 0;
  try {
    const page = await fetchAllPlaylistItems(id);
    rawItems = page.items;
    total = page.total || rawItems.length;
    if (total > 100) {
      try {
        const fallback = await fetchSportifyPlaylist(id);
        if (fallback.tracks.length >= Math.min(total, rawItems.length)) {
          if (!entity) entity = { name: fallback.name, title: fallback.name };
          cover = cover || fallback.cover;
          rawItems = fallbackRawItems(fallback.tracks);
          total = fallback.total;
        }
      } catch (fallbackError) {
        console.warn('[playlist] metadata enrichment failed:', fallbackError.message);
      }
    }
  } catch (err) {
    console.warn('[playlist] pathfinder failed, using public fallback:', err.message);
    try {
      const fallback = await fetchSportifyPlaylist(id);
      if (!entity) entity = { name: fallback.name, title: fallback.name };
      cover = cover || fallback.cover;
      total = fallback.total;
      rawItems = fallbackRawItems(fallback.tracks);
    } catch (fallbackError) {
      console.warn('[playlist] public fallback failed:', fallbackError.message);
      rawItems = (entity?.trackList || []).map((track) => ({
        itemV2: { data: {
          __typename: 'Track',
          uri: track.uri,
          name: track.title,
          artists: { items: [{ profile: { name: track.subtitle || '' } }] },
          albumOfTrack: { coverArt: { sources: [{ url: bestSpotifyImage(entity), width: 640 }] } },
        } },
        _previewUrl: track.audioPreview?.url || null,
      }));
      total = rawItems.length;
    }
  }
  if (!rawItems.length) throw new Error('Spotify playlist is empty or unavailable');

  const playlistGenre = inferPlaylistGenre(entity?.name || entity?.title || '');
  const playlistSongs = [];
  const unmatched = [];
  const skippedTracks = [];
  let matched = 0;
  rawItems.forEach((item, index) => {
    const track = spotifyItemTrack(item);
    if (!track?.title) return;
    const match = songs.find((s) => s.spotifyId === track.spotifyId) || matchCatalog(track.title, track.artist);
    if (match) {
      matched++;
      const genre = playlistGenre || match.genre;
      playlistSongs.push({
        ...publicSong(match),
        id: `p${index + 1}`,
        year: yearOverride(match.title, match.artist) || match.year,
        spotifyId: track.spotifyId,
        previewUrl: item._previewUrl || null,
        artUrl: match.art || track.artUrl || cover,
        genre,
        genres: [genre],
        source: 'catalog',
      });
    } else {
      unmatched.push({ ...track, index, fallbackPreview: item._previewUrl || null });
    }
  });

  await ensureArtistTypes(unmatched.map((item) => item.artist));
  const enriched = [];
  const enrichmentConcurrency = 20;
  for (let i = 0; i < unmatched.length; i += enrichmentConcurrency) {
    const chunk = unmatched.slice(i, i + enrichmentConcurrency);
    const results = await Promise.all(chunk.map(async (item) => {
      try {
        const override = yearOverride(item.title, item.artist);
        const releaseYear = Number(String(item._releaseDate || '').slice(0, 4));
        let year = override || (releaseYear >= 1950 && releaseYear <= 2030 ? releaseYear : null);
        if (!override && !year) year = await itunesYear(item.title, item.artist);
        const suffixYear = Number((String(item.title).match(/\b(19|20)\d{2}\b/) || [])[0]);
        if (!override && suffixYear && suffixYear === year && /remaster|mix|version|edit/i.test(item.title)) {
          const mb = await musicBrainzMeta(item.title, item.artist);
          if (mb?.year && mb.year < year) year = mb.year;
        }
        if (!year) {
          const mb = await musicBrainzMeta(item.title, item.artist);
          if (mb?.year) year = mb.year;
        }
        let track = null;
        if (!year) return { ...item, track: null, genre: null };
        const artistGenre = playlistGenre || artistGenreFor(item.artist);
        const genre = artistGenre
          ? { genre: artistGenre, genres: [artistGenre] }
          : await trackGenre(item.title, item.artist);
        return {
          ...item,
          track: {
            title: track?.title || item.title,
            artist: track?.artist || item.artist,
            year,
            group: track?.group ?? ((item.artistNames?.length > 1) ? true : inferGroup(item.artist)),
            previewUrl: track?.previewUrl || item.fallbackPreview || null,
            artUrl: track?.artUrl || item.artUrl || cover,
          },
          genre,
        };
      } catch {
        return { ...item, track: null, genre: null };
      }
    }));
    enriched.push(...results);
  }
  for (const item of enriched) {
    const track = item.track;
    if (!track || !track.year) {
      skippedTracks.push({ title: item.title, artist: item.artist, reason: 'kein Jahr' });
      continue;
    }
    playlistSongs.push({
      id: `p${item.index + 1}`,
      title: track.title || item.title,
      artist: track.artist || item.artist,
      year: track.year,
      genre: (item.genre?.genre && item.genre.genre !== 'unbekannt') ? item.genre.genre : (playlistGenre || 'unbekannt'),
      genres: (item.genre?.genres?.length ? item.genre.genres : (playlistGenre ? [playlistGenre] : [])),
      group: track.group ?? inferGroup(track.artist || item.artist),
      tags: [],
      spotifyId: item.spotifyId,
      previewUrl: track.previewUrl || item.fallbackPreview,
      artUrl: track.artUrl || item.artUrl || cover,
      popularity: null,
      source: 'spotify',
    });
  }
  playlistSongs.sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)));
  const result = {
    id,
    name: entity.name || entity.title || 'Spotify Playlist',
    cover,
    count: total,
    matched,
    skipped: Math.max(0, total - playlistSongs.length),
    skippedTracks,
    songs: playlistSongs,
  };
  if (playlistCache.size > 30) playlistCache.delete(playlistCache.keys().next().value);
  playlistCache.set(id, result);
  writePlaylistDisk(id, result);
  return result;
}

api.get('/health', (_req, res) => {
  res.json({ ok: true, songs: songs.length, uptime: Math.round(process.uptime()) });
});

api.get('/catalog', (req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
  res.json({
    generatedAt,
    count: songs.length,
    stats,
    genres,
    decades,
    songs: publicSongs,
  });
});

api.get('/genres', (_req, res) => {
  res.json({ genres, decades, stats });
});

api.get('/random', (req, res) => {
  const exclude = String(req.query.exclude || '')
    .split(',')
    .filter((x) => /^s\d{4}$/.test(x))
    .slice(0, 300);
  const filters = {
    genre: req.query.genre,
    decade: req.query.decade,
    tag: req.query.tag,
    group: req.query.group,
    q: req.query.q,
    spotifyOnly: req.query.spotifyOnly === '1',
  };
  const song = randomSong(filters, exclude);
  if (!song) {
    return res.status(404).json({ error: 'Keine Karte für diese Filter gefunden.' });
  }
  res.setHeader('Cache-Control', 'no-store');
  const remaining = filterSongs(filters).filter((s) => !exclude.includes(s.id)).length;
  res.json({ song: publicSong(song), remaining });
});

api.get('/song/:id', (req, res) => {
  const song = byId.get(req.params.id);
  if (!song) return res.status(404).json({ error: 'Karte nicht gefunden.' });
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.json({ song: publicSong(song) });
});

api.get('/spotify/track/:id', async (req, res) => {
  const id = String(req.params.id || '');
  if (!/^[A-Za-z0-9]{22}$/.test(id)) return res.status(400).json({ error: 'Ungültige Spotify-ID.' });
  try {
    const track = await getSpotifyTrack(id);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.json(track);
  } catch (err) {
    console.warn(`[spotify-track] ${id}:`, err.message);
    return res.status(502).json({ error: 'Spotify-Lied konnte nicht geladen werden.' });
  }
});

api.get('/playlist', async (req, res) => {
  const id = parsePlaylistId(req.query.url || req.query.id);
  if (!id) return res.status(400).json({ error: 'Bitte einen gültigen Spotify-Playlist-Link angeben.' });
  try {
    const playlist = await buildPlaylist(id);
    res.setHeader('Cache-Control', 'public, max-age=600, stale-while-revalidate=3600');
    return res.json(playlist);
  } catch (err) {
    console.warn(`[playlist] ${id}:`, err.message);
    return res.status(502).json({ error: 'Playlist konnte nicht geladen werden.' });
  }
});

api.get('/resolve', async (req, res) => {
  const id = String(req.query.spotify || '');
  if (!/^[A-Za-z0-9]{22}$/.test(id)) {
    return res.status(400).json({ error: 'Ungültige Spotify-ID.' });
  }
  if (resolveCache.has(id)) {
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.json(resolveCache.get(id));
  }

  const direct = songs.find((s) => s.spotifyId === id);
  if (direct) {
    const result = {
      spotifyId: id,
      year: direct.year,
      title: direct.title,
      artist: direct.artist,
      previewUrl: null,
      artUrl: direct.art || null,
      song: publicSong(direct),
      source: 'catalog',
    };
    cacheResolve(id, result);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.json(result);
  }

  try {
    const track = await getSpotifyTrack(id);
    const match = matchCatalog(track.title, track.artist);
    const result = {
      spotifyId: id,
      year: match?.year || track.year || null,
      title: match?.title || track.title || '',
      artist: match?.artist || track.artist || '',
      releaseDate: track.releaseDate,
      previewUrl: track.previewUrl,
      artUrl: match?.art || track.artUrl,
      song: match ? publicSong(match) : null,
      source: match ? 'catalog' : 'spotify',
    };
    cacheResolve(id, result);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.json(result);
  } catch (err) {
    console.warn(`[resolve] ${id}:`, err.message);
    return res.status(502).json({ error: 'Spotify-Lied konnte nicht erkannt werden.' });
  }
});


api.get('/hitster/:region/:card', async (req, res) => {
  const region = String(req.params.region || '').toLowerCase();
  const card = String(req.params.card || '').padStart(5, '0');
  if (!/^[a-z]{2}$/.test(region) || !/^\d{1,5}$/.test(card)) {
    return res.status(400).json({ error: 'Ungültige Hitster-Karte.' });
  }
  const db = loadHitsterDb();
  const candidates = (db.gamesets || []).filter((set) => set.cards?.[card]);
  if (!candidates.length) return res.status(404).json({ error: 'Karte nicht gefunden.' });
  const set = pickHitsterSet(candidates, region, String(req.query.sku || 'auto'));
  const [spotifyId, artistType] = set.cards[card];
  const meta = HITSTER_CARDS[`${set.sku}:${card}`] || null;
  const local = db.tracks?.[spotifyId] || null;
  const direct = songs.find((song) => song.spotifyId === spotifyId) || null;
  let track = local || (direct ? {
    title: direct.title, artist: direct.artist, year: direct.year,
    genre: direct.genre, group: direct.group, art: direct.art, songId: direct.id,
  } : null);
  if (meta) {
    track = {
      title: meta.title,
      artist: meta.artist,
      year: meta.year,
      genre: local?.genre || direct?.genre || 'unbekannt',
      group: meta.group,
      art: local?.art || direct?.art || null,
      songId: direct?.id || null,
      previewUrl: null,
      artUrl: local?.art || direct?.art || null,
      source: 'songseeker',
    };
    try {
      const spotify = await getSpotifyTrack(spotifyId, { mb: false });
      track.previewUrl = spotify.previewUrl || null;
      track.art = track.art || spotify.artUrl || null;
      track.artUrl = track.artUrl || spotify.artUrl || null;
    } catch { /* exact Songseeker metadata is still usable */ }
  } else if (!track) {
    try {
      const resolved = await getSpotifyTrack(spotifyId);
      track = {
        title: resolved.title, artist: resolved.artist, year: resolved.year,
        genre: resolved.genre || 'unbekannt', group: resolved.group, art: resolved.artUrl,
      };
    } catch { /* keep candidates usable even without metadata */ }
  }
  res.setHeader('Cache-Control', 'public, max-age=3600');
  return res.json({
    region,
    card,
    candidateCount: candidates.length,
    set: { sku: set.sku, region: set.region, name: set.name },
    spotifyId,
    artistType: meta ? (meta.group ? 'group' : 'solo') : artistType,
    meta,
    track,
    candidates: candidates.map((entry) => ({
      sku: entry.sku,
      region: entry.region,
      name: entry.name,
      spotifyId: entry.cards[card][0],
      artistType: entry.cards[card][1],
    })),
  });
});

api.get('/database', (req, res) => {
  const file = path.resolve(__dirname, '../data/hitster-database.json');
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'Datenbank noch nicht gebaut.' });
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="hitster-database.json"');
  return res.sendFile(file);
});

api.get('/qr', async (req, res) => {
  const text = String(req.query.text || '').trim();
  if (!text || text.length > 500) return res.status(400).json({ error: 'Ungültiger QR-Text.' });
  try {
    const svg = await QRCode.toString(text, {
      type: 'svg',
      margin: 1,
      width: 280,
      color: { dark: '#101010', light: '#ffffff' },
    });
    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
    return res.send(svg);
  } catch {
    return res.status(500).json({ error: 'QR-Code konnte nicht erzeugt werden.' });
  }
});

api.get('/qr/:id', async (req, res) => {
  const song = byId.get(req.params.id);
  if (!song) return res.status(404).json({ error: 'Karte nicht gefunden.' });
  const base = String(req.query.base || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
  if (!/^https?:\/\//i.test(base)) return res.status(400).json({ error: 'Ungültige Basis-URL.' });
  try {
    const svg = await QRCode.toString(`${base}/?card=${song.id}`, {
      type: 'svg',
      margin: 1,
      width: 256,
      color: { dark: '#101010', light: '#f5efe3' },
    });
    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
    return res.send(svg);
  } catch {
    return res.status(500).json({ error: 'QR-Code konnte nicht erzeugt werden.' });
  }
});

api.get('/audio/:id', async (req, res) => {
  const song = byId.get(req.params.id);
  if (!song) return res.status(404).json({ error: 'Karte nicht gefunden.' });
  try {
    const audio = await getAudio(song);
    const size = audio.buffer.length;
    res.setHeader('Content-Type', audio.contentType);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('Access-Control-Allow-Origin', '*');

    if (req.method === 'HEAD') {
      res.setHeader('Content-Length', size);
      return res.status(200).end();
    }

    const range = req.headers.range;
    if (range) {
      const parsed = parseRange(range, size);
      if (!parsed || parsed.invalid) {
        res.setHeader('Content-Range', `bytes */${size}`);
        return res.status(416).end();
      }
      const { start, end } = parsed;
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
      res.setHeader('Content-Length', end - start + 1);
      return res.end(audio.buffer.subarray(start, end + 1));
    }
    res.setHeader('Content-Length', size);
    return res.end(audio.buffer);
  } catch (err) {
    console.warn(`[audio] ${song.id} ${song.artist} – ${song.title}:`, err.message);
    return res.status(502).json({ error: 'Clip konnte nicht geladen werden.', detail: err.message });
  }
});

api.get('/art/:id', async (req, res) => {
  const song = byId.get(req.params.id);
  if (!song) return res.status(404).json({ error: 'Karte nicht gefunden.' });
  try {
    const art = await getArt(song);
    if (!art) return res.status(404).end();
    res.setHeader('Content-Type', art.contentType);
    res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.end(art.buffer);
  } catch (err) {
    return res.status(502).json({ error: 'Cover konnte nicht geladen werden.' });
  }
});

api.use((_req, res) => res.status(404).json({ error: 'Unbekannter API-Endpunkt.' }));

app.use('/api', api);

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

app.use((err, _req, res, _next) => {
  console.error('[server]', err);
  res.status(500).json({ error: 'Interner Serverfehler.' });
});

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n  HITSTER WEB läuft auf http://localhost:${PORT}`);
    console.log(`  ${songs.length} Karten · ${genres.length} Kategorien · kein Login · keine Werbung\n`);
  });
}

export default app;
