import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CATALOG = path.join(ROOT, 'data/catalog.json');
const CONCURRENCY = Number(process.env.CONCURRENCY || 6);

const catalog = JSON.parse(fs.readFileSync(CATALOG, 'utf8'));
const songs = catalog.songs || [];
let done = 0;
let ok = 0;
let failed = 0;
let cursor = 0;

function save() {
  const tmp = `${CATALOG}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(catalog, null, 2));
  fs.renameSync(tmp, CATALOG);
}

async function lookup(song) {
  if (!song.deezerId) return;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 10000);
      const res = await fetch(`https://api.deezer.com/track/${encodeURIComponent(song.deezerId)}`, { signal: ctrl.signal });
      clearTimeout(timer);
      if (res.status === 429) { await new Promise((r) => setTimeout(r, 1500)); continue; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (typeof data.rank === 'number') {
        song.popularity = data.rank;
        song.popularitySource = 'deezer';
        ok++;
      }
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  }
  failed++;
}

async function worker() {
  while (true) {
    const i = cursor++;
    if (i >= songs.length) return;
    await lookup(songs[i]);
    done++;
    if (done % 100 === 0) {
      save();
      console.log(`[popularity] ${done}/${songs.length} ok=${ok} failed=${failed}`);
    }
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
save();
console.log(`[popularity] done ${done}/${songs.length} ok=${ok} failed=${failed}`);
