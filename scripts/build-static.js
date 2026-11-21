import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
const OUT = path.join(ROOT, 'docs');
const BASE = (process.env.PUBLIC_BASE || 'https://dealwirth.github.io/hitster-web').replace(/\/$/, '');

const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/catalog.json'), 'utf8'));
const songs = catalog.songs.map(({ id, title, artist, year, genre, group, tags, spotifyId, itunesId }) => ({
  id,
  title,
  artist,
  year,
  genre,
  group,
  tags,
  spotifyId,
  itunesId,
}));

fs.mkdirSync(OUT, { recursive: true });
for (const name of ['fonts', 'vendor']) {
  fs.rmSync(path.join(OUT, name), { recursive: true, force: true });
  fs.cpSync(path.join(PUBLIC, name), path.join(OUT, name), { recursive: true });
}

let html = fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8');
html = html
  .replace('<html lang="de">', '<html lang="de" data-static="true">')
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
