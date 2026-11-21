import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SOURCE = 'https://hitster.jumboplay.com/hitster-assets/gameset_database.json';
const OUT = path.join(ROOT, 'public', 'hitster-db.json');
const CATALOG = path.join(ROOT, 'data', 'catalog.json');

const res = await fetch(SOURCE, { headers: { 'user-agent': 'HITSTER-Web/4.0' } });
if (!res.ok) throw new Error(`Hitster DB HTTP ${res.status}`);
const raw = await res.json();
const catalog = JSON.parse(fs.readFileSync(CATALOG, 'utf8'));
const tracks = {};
for (const song of catalog.songs || []) {
  if (!song.spotifyId) continue;
  tracks[song.spotifyId] = {
    title: song.title,
    artist: song.artist,
    year: song.year,
    genre: song.genre,
    group: song.group,
    art: song.art || null,
    songId: song.id,
  };
}
const gamesets = [];
for (const set of raw.gamesets || []) {
  const data = set.gameset_data || {};
  const cards = {};
  for (const card of data.cards || []) {
    if (!card.CardNumber || !card.Spotify) continue;
    cards[String(card.CardNumber).padStart(5, '0')] = [card.Spotify, card.ArtistType || ''];
  }
  if (!Object.keys(cards).length) continue;
  gamesets.push({
    sku: set.sku,
    region: String(data.gameset_language || '').trim(),
    name: String(data.gameset_name || '').trim(),
    cards,
  });
}
gamesets.sort((a, b) => a.region.localeCompare(b.region) || a.name.localeCompare(b.name));
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ source: SOURCE, updated: raw.updated_on || null, tracks, gamesets }));
console.log(`Hitster DB: ${gamesets.length} sets, ${gamesets.reduce((n, g) => n + Object.keys(g.cards).length, 0)} card mappings → ${path.relative(ROOT, OUT)}`);
console.log(`Size: ${(fs.statSync(OUT).size / 1024 / 1024).toFixed(2)} MB`);
