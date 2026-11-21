import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
const OUT = process.env.PUBLIC_OUT ? path.resolve(ROOT, process.env.PUBLIC_OUT) : path.join(ROOT, 'docs');
const BASE = (process.env.PUBLIC_BASE || 'https://dealwirth.github.io/hitster-web').replace(/\/$/, '');
const API_BASE = (process.env.PUBLIC_API_BASE || 'https://work-1-biuhsvnutpptympz.prod-runtime.all-hands.dev').replace(/\/$/, '');

const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/catalog.json'), 'utf8'));
const songs = catalog.songs.map(({ id, title, artist, year, genre, group, tags, spotifyId, itunesId, deezerId, popularity, art, source, album, duration, isrc }) => ({
  id,
  title,
  artist,
  year,
  genre,
  group,
  tags,
  spotifyId,
  itunesId,
  deezerId: deezerId || null,
  popularity: popularity ?? null,
  art: art || null,
  artUrl: art || null,
  source: source || null,
  album: album || null,
  duration: duration || null,
  isrc: isrc || null,
}));

fs.mkdirSync(OUT, { recursive: true });
for (const name of ['fonts', 'vendor', 'icons']) {
  fs.rmSync(path.join(OUT, name), { recursive: true, force: true });
  fs.cpSync(path.join(PUBLIC, name), path.join(OUT, name), { recursive: true });
}
for (const name of ['manifest.webmanifest', 'sw.js', 'hitster-db.json', '404.html']) {
  fs.copyFileSync(path.join(PUBLIC, name), path.join(OUT, name));
}

let html = fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8');
html = html
  .replace('<html lang="de">', '<html lang="de" data-static="true">')
  .replace('<meta name="hitster-api" content="" />', `<meta name="hitster-api" content="${API_BASE}" />`)
  .replaceAll('href="/styles.css', 'href="styles.css')
  .replaceAll('src="/vendor/jsqr.js', 'src="vendor/jsqr.js')
  .replaceAll('src="/app.js', 'src="app.js')
  .replace('class="brand" href="/"', 'class="brand" href="./"');
fs.writeFileSync(path.join(OUT, 'index.html'), html);

const css = fs.readFileSync(path.join(PUBLIC, 'styles.css'), 'utf8').replaceAll("url('/fonts/", "url('fonts/");
fs.writeFileSync(path.join(OUT, 'styles.css'), css);
fs.copyFileSync(path.join(PUBLIC, 'app.js'), path.join(OUT, 'app.js'));
fs.writeFileSync(path.join(OUT, 'catalog.json'), JSON.stringify({
  generatedAt: catalog.generatedAt,
  count: songs.length,
  songs,
}));
fs.writeFileSync(path.join(OUT, '.nojekyll'), '');

fs.rmSync(path.join(OUT, 'qr'), { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'qr'), { recursive: true });
for (const song of songs) {
  const svg = await QRCode.toString(`${BASE}/?card=${song.id}`, {
    type: 'svg',
    margin: 1,
    width: 256,
    color: { dark: '#101010', light: '#f5efe3' },
  });
  fs.writeFileSync(path.join(OUT, 'qr', `${song.id}.svg`), svg);
}

console.log(`Static build: ${songs.length} songs, ${songs.length} QR codes → docs/`);
console.log(`Base URL: ${BASE}/`);
console.log(`API base: ${API_BASE}`);
