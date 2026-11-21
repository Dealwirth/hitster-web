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
    let data = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        data = await mbFetchJson(`https://musicbrainz.org/ws/2/recording/?query=${encodeURIComponent(query)}&fmt=json&limit=25`);
        break;
      } catch (err) {
        if (attempt === 2) throw err;
        await new Promise((resolve) => setTimeout(resolve, 1200 * (attempt + 1)));
      }
    }
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
    mbCache.delete(key);
    return null;
  }
}


const yearCache = new Map();
async function itunesYear(title, artist) {
  const key = `${normalizeText(title)}|${normalizeText(artist)}`;
  if (yearCache.has(key)) return yearCache.get(key);
  try {
    const data = await fetchJsonTimed(`https://itunes.apple.com/search?term=${encodeURIComponent(`${title} ${artist}`)}&entity=song&limit=8&country=DE`);
    const nt = normalizeText(title);
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
      const mbm = await musicBrainzMeta(cached.title, cached.artist);
      const itYear = mbm?.year ? null : await itunesYear(cached.title, cached.artist);
      const years = [mbm?.year, itYear, Number(String(cached.releaseDate || '').slice(0, 4))].filter((y) => y >= 1950 && y <= 2030);
      cached.year = years.length ? Math.min(...years) : cached.year;
      if (mbm?.group != null) cached.group = mbm.group;
      cached.yearSource = mbm?.year ? 'musicbrainz' : (itYear ? 'itunes' : 'spotify');
    }
    return cached;
  }
  try {
    const entity = await fetchSpotifyEmbed('track', id);
    const track = spotifyTrackFromEntity(id, entity);
    if (!track.title) throw new Error('spotify track without title');
    if (mb) {
      const mbm = await musicBrainzMeta(track.title, track.artist);
      const itYear = mbm?.year ? null : await itunesYear(track.title, track.artist);
      const years = [mbm?.year, itYear, Number(String(track.releaseDate || '').slice(0, 4))].filter((y) => y >= 1950 && y <= 2030);
      track.year = years.length ? Math.min(...years) : track.year;
      if (mbm?.group != null) track.group = mbm.group;
      track.yearSource = mbm?.year ? 'musicbrainz' : (itYear ? 'itunes' : 'spotify');
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
  const skippedTracks = [];
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
        genres: [match.genre],
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
        let track = await getSpotifyTrack(item.spotifyId, { mb: false });
        if (!track?.year) track = await getSpotifyTrack(item.spotifyId, { mb: true });
        const artistGenre = artistGenreFor(item.artist);
        const genre = artistGenre
          ? { genre: artistGenre, genres: [artistGenre] }
          : await trackGenre(item.title, item.artist);
        return { ...item, track, genre };
      } catch {
        return { ...item, track: null, genre: null };
      }
    }));
    enriched.push(...results);
  }
  const playlistGenre = inferPlaylistGenre(entity?.name || entity?.title || '');
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
  const local = db.tracks?.[spotifyId] || null;
  const direct = songs.find((song) => song.spotifyId === spotifyId) || null;
  let track = local || (direct ? {
    title: direct.title, artist: direct.artist, year: direct.year,
    genre: direct.genre, group: direct.group, art: direct.art, songId: direct.id,
  } : null);
  if (!track) {
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
    artistType,
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
