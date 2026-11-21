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
      "img-src 'self' data:",
      "media-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "font-src 'self'",
      "script-src 'self'",
      "connect-src 'self'",
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
      year: direct.year,
      title: direct.title,
      artist: direct.artist,
      song: publicSong(direct),
      source: 'catalog',
    };
    cacheResolve(id, result);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.json(result);
  }

  try {
    const meta = await fetchSpotifyMeta(id);
    const match = matchCatalog(meta.title, meta.artist);
    const result = {
      year: match?.year || meta.year || null,
      title: match?.title || meta.title || '',
      artist: match?.artist || meta.artist || '',
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
