import express from 'express';
import compression from 'compression';
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

api.get('/health', (_req, res) => {
  res.json({ ok: true, songs: songs.length, uptime: Math.round(process.uptime()) });
});

api.get('/catalog', (req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.json({
    generatedAt,
    count: songs.length,
    stats,
    genres,
    decades,
    songs: songs.map(publicSong),
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
  res.json({ song: publicSong(song), bingo: bingoAnswers(song) });
});

api.get('/bingo/:id', (req, res) => {
  const song = byId.get(req.params.id);
  if (!song) return res.status(404).json({ error: 'Karte nicht gefunden.' });
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
