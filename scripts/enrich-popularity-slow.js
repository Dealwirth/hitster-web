import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CATALOG = path.join(ROOT, 'data/catalog.json');
const RATE_PER_SEC = 8;
const catalog = JSON.parse(fs.readFileSync(CATALOG, 'utf8'));
const songs = (catalog.songs || []).filter((s) => s.deezerId && s.popularity == null);
let done = 0, ok = 0, failed = 0, next = Date.now();

function save() {
  const tmp = `${CATALOG}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(catalog, null, 2));
  fs.renameSync(tmp, CATALOG);
}
async function waitTurn() {
  const now = Date.now();
  const wait = Math.max(0, next - now);
  next = Math.max(now, next) + 1000 / RATE_PER_SEC;
  if (wait) await new Promise((r) => setTimeout(r, wait));
}
async function lookup(song) {
  for (let attempt = 0; attempt < 4; attempt++) {
    await waitTurn();
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 10000);
      const res = await fetch(`https://api.deezer.com/track/${encodeURIComponent(song.deezerId)}`, { signal: ctrl.signal });
      clearTimeout(timer);
      const data = await res.json();
      if (data?.error?.message?.toLowerCase().includes('quota')) {
        await new Promise((r) => setTimeout(r, 3000));
        continue;
      }
      if (res.status === 429) { await new Promise((r) => setTimeout(r, 2000)); continue; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (typeof data.rank === 'number') {
        song.popularity = data.rank;
        song.popularitySource = 'deezer';
        ok++;
      }
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    }
  }
  failed++;
}
async function worker() {
  while (true) {
    const song = songs.shift();
    if (!song) return;
    await lookup(song);
    done++;
    if (done % 100 === 0) { save(); console.log(`[pop-slow] ${done} ok=${ok} failed=${failed}`); }
  }
}
await Promise.all(Array.from({ length: 3 }, () => worker()));
save();
console.log(`[pop-slow] done ${done} ok=${ok} failed=${failed}`);
