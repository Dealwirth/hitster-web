import express from 'express';
import compression from 'compression';
import QRCode from 'qrcode';
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
  bingoAnswers,
} from './catalog.js';
import { getAudio, getArt, parseRange } from './audio.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, '../public');
const PORT = Number(process.env.PORT || 12000);

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
      "media-src 'self' https:",
      "style-src 'self' 'unsafe-inline'",
      "font-src 'self'",
      "script-src 'self'",
      "worker-src 'self'",
      "connect-src 'self' https:",
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

api.use((req, res, next) => {
  if (/^\/(spotify|resolve|playlist)/.test(req.path)) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Accept, Content-Type');
    if (req.method === 'OPTIONS') return res.status(204).end();
  }
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

async function fetchSpotifyEmbed(kind, id) {
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
    if (!res.ok) throw new Error(`spotify embed HTTP ${res.status}`);
    const data = parseNextData(await res.text());
    const settings = data?.props?.pageProps?.state?.settings;
    if (settings?.session?.accessToken) spotifySettings = settings;
    const entity = data?.props?.pageProps?.state?.data?.entity;
    if (!entity && !settings?.session?.accessToken) throw new Error('spotify embed without entity');
    return entity || null;
  } finally {
    clearTimeout(timer);
  }
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
    const res = await fetch(`https://api-partner.spotify.com/pathfinder/v1/query?${params}`, {
      headers: {
        authorization: `Bearer ${spotifySettings.session.accessToken}`,
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36',
        'accept-language': 'de-DE,de;q=0.9,en;q=0.8',
      },
    });
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
  const artist = (track.artists?.items || [])
    .map((a) => a.profile?.name)
    .filter(Boolean)
    .join(', ');
  const images = track.albumOfTrack?.coverArt?.sources || [];
  const art = [...images].sort((a, b) => (b.width || 0) - (a.width || 0))[0]?.url || null;
  return {
    spotifyId,
    title: track.name || '',
    artist,
    artUrl: art,
    duration: track.trackDuration?.totalMilliseconds || null,
    previewUrl: null,
  };
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
  const artist = (entity?.artists || []).map((a) => a.name).filter(Boolean).join(', ')
    || entity?.subtitle || '';
  return {
    spotifyId: id,
    title: entity?.title || entity?.name || '',
    artist,
    year: year >= 1950 && year <= 2030 ? year : null,
    releaseDate,
    previewUrl: entity?.audioPreview?.url || null,
    artUrl: bestSpotifyImage(entity),
    duration: entity?.duration || null,
    group: inferGroup(artist),
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
  const query = `recording:"${cleanTitle}"${cleanArtist ? ` AND artist:"${cleanArtist}"` : ''}`;
  try {
    const data = await mbFetchJson(`https://musicbrainz.org/ws/2/recording/?query=${encodeURIComponent(query)}&fmt=json&limit=25`);
    let best = null;
    for (const recording of data.recordings || []) {
      const dates = [recording['first-release-date'], ...(recording.releases || []).map((release) => release.date)]
        .filter(Boolean)
        .sort();
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
    mbCache.set(key, null);
    return null;
  }
}

function pickReleaseYear(mbYear, releaseDate) {
  const spotifyYear = Number(String(releaseDate || '').slice(0, 4)) || null;
  if (mbYear && spotifyYear) return Math.min(mbYear, spotifyYear);
  return mbYear || spotifyYear || null;
}

async function getSpotifyTrack(id, { mb = true } = {}) {
  if (spotifyTrackCache.has(id)) {
    const cached = spotifyTrackCache.get(id);
    if (mb && !cached.yearSource) {
      const mbm = await musicBrainzMeta(cached.title, cached.artist);
      cached.year = pickReleaseYear(mbm?.year, cached.releaseDate) || cached.year;
      if (mbm?.group != null) cached.group = mbm.group;
      cached.yearSource = mbm?.year ? 'musicbrainz' : 'spotify';
    }
    return cached;
  }
  try {
    const entity = await fetchSpotifyEmbed('track', id);
    const track = spotifyTrackFromEntity(id, entity);
    if (!track.title) throw new Error('spotify track without title');
    if (mb) {
      const mbm = await musicBrainzMeta(track.title, track.artist);
      track.year = pickReleaseYear(mbm?.year, track.releaseDate) || track.year;
      if (mbm?.group != null) track.group = mbm.group;
      track.yearSource = mbm?.year ? 'musicbrainz' : 'spotify';
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
      year: meta.year || null,
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

function inferGroup(artist) {
  return /(?:\s(?:&|and|x|vs\.?|feat\.?|ft\.?|with)\s|,|\/|\+)/i.test(String(artist || ''));
}

async function buildPlaylist(id) {
  if (playlistCache.has(id)) return playlistCache.get(id);
  let entity = null;
  try {
    entity = await fetchSpotifyEmbed('playlist', id);
  } catch { /* pathfinder can still resolve the playlist */ }
  const cover = bestSpotifyImage(entity);
  let rawItems = [];
  let total = 0;
  try {
    const page = await fetchAllPlaylistItems(id);
    rawItems = page.items;
    total = page.total || rawItems.length;
  } catch (err) {
    console.warn('[playlist] pathfinder failed, using embed fallback:', err.message);
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
  if (!rawItems.length) throw new Error('Spotify playlist is empty or unavailable');

  const playlistSongs = [];
  const unmatched = [];
  let matched = 0;
  rawItems.forEach((item, index) => {
    const track = spotifyItemTrack(item);
    if (!track?.title) return;
    const match = songs.find((s) => s.spotifyId === track.spotifyId) || matchCatalog(track.title, track.artist);
    if (match) {
      matched++;
      playlistSongs.push({
        ...publicSong(match),
        id: `p${index + 1}`,
        spotifyId: track.spotifyId,
        previewUrl: item._previewUrl || null,
        artUrl: match.art || track.artUrl || cover,
        source: 'catalog',
      });
    } else {
      unmatched.push({ ...track, index, fallbackPreview: item._previewUrl || null });
    }
  });

  const enriched = [];
  for (let i = 0; i < unmatched.length; i += 8) {
    const chunk = unmatched.slice(i, i + 8);
    const results = await Promise.all(chunk.map(async (item) => {
      try {
        const track = await getSpotifyTrack(item.spotifyId, { mb: false });
        return { ...item, track };
      } catch {
        return { ...item, track: null };
      }
    }));
    enriched.push(...results);
  }
  for (const item of enriched) {
    const track = item.track;
    if (!track || !track.year) continue;
    playlistSongs.push({
      id: `p${item.index + 1}`,
      title: track.title || item.title,
      artist: track.artist || item.artist,
      year: track.year,
      genre: 'unbekannt',
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
    songs: playlistSongs,
  };
  if (playlistCache.size > 30) playlistCache.delete(playlistCache.keys().next().value);
  playlistCache.set(id, result);
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
  res.json({ song: publicSong(song), bingo: bingoAnswers(song) });
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

api.get('/bingo/:id', (req, res) => {
  const song = byId.get(req.params.id);
  if (!song) return res.status(404).json({ error: 'Karte nicht gefunden.' });
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.json({ bingo: bingoAnswers(song) });
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
