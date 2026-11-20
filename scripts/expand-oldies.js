/**
 * Adds 1950s/60s classics so the expanded catalog stays decade-balanced.
 * Writes data/expansion-oldies.tsv.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const CATALOG = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/catalog.json'), 'utf8'));
const SELECTED = path.join(ROOT, 'data/expansion-selected.tsv');
const CACHE_FILE = path.join(ROOT, 'data/.cache/expansion-oldies.json');
const OUT = path.join(ROOT, 'data/expansion-oldies.tsv');

const norm = (s) => String(s || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const normArtist = (s) => norm(s).replace(/^the /, '');
const baseTitle = (s) => String(s || '').replace(/\s*[\(\[].*?[\)\]]\s*/g, ' ').replace(/\s+-\s+(single|radio edit|album version|remaster(ed)?|.*mix).*$/i, '').replace(/\s+/g, ' ').trim();
const key = (t, a) => `${norm(t)}|${normArtist(a)}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const HOLIDAY = /\b(christmas|jingle|snow|santa|noel|silent night|ave maria|rudolph|frosty|winter wonderland|let it snow|holly jolly|little drummer|o holy night|white christmas|blue christmas|happy holiday|new year)\b/i;
const BAD = /\b(live|karaoke|instrumental|demo|acoustic|cover|tribute|reprise|medley|remix|rmx)\b/i;

const curated = [
  ['Frank Sinatra', 'pop', false], ['Dean Martin', 'pop', false], ['Nat King Cole', 'jazz', false],
  ['Perry Como', 'pop', false], ['Bing Crosby', 'pop', false], ['Doris Day', 'pop', false],
  ['Connie Francis', 'pop', false], ['Brenda Lee', 'pop', false], ['Patsy Cline', 'country', false],
  ['Etta James', 'rnb', false], ['Nina Simone', 'jazz', false], ['Bill Haley & His Comets', 'rock', true],
  ['The Platters', 'rnb', true], ['The Coasters', 'rnb', true], ['The Drifters', 'rnb', true],
  ['Ben E. King', 'rnb', false], ['The Shirelles', 'rnb', true], ['The Ronettes', 'rnb', true],
  ['The Crystals', 'rnb', true], ['The Righteous Brothers', 'rnb', true], ['The Four Tops', 'rnb', true],
  ['Smokey Robinson & The Miracles', 'rnb', true], ['The Yardbirds', 'rock', true], ['The Hollies', 'pop', true],
  ["Herman's Hermits", 'pop', true], ['The Troggs', 'rock', true], ['The Zombies', 'rock', true],
  ['The Moody Blues', 'rock', true], ['Procol Harum', 'rock', true], ['The Walker Brothers', 'pop', true],
  ['Dusty Springfield', 'pop', false], ['Petula Clark', 'pop', false], ['Lulu', 'pop', false],
  ['Sandie Shaw', 'pop', false], ['Cilla Black', 'pop', false], ['Tom Jones', 'pop', false],
  ['Engelbert Humperdinck', 'pop', false], ['Cliff Richard', 'rock', false], ['The Shadows', 'rock', true],
  ['Gerry & The Pacemakers', 'pop', true], ['The Searchers', 'pop', true], ['The Merseybeats', 'pop', true],
  ['The Dave Clark Five', 'rock', true], ['The Tremeloes', 'pop', true], ['The Equals', 'rock', true],
  ['The Foundations', 'rnb', true], ['The Love Affair', 'pop', true], ['The Box Tops', 'rock', true],
  ['The Turtles', 'pop', true], ["The Lovin' Spoonful", 'folk', true], ['The Young Rascals', 'rnb', true],
  ['The Spencer Davis Group', 'rock', true], ['Traffic', 'rock', true], ['Jefferson Airplane', 'rock', true],
  ['The Grateful Dead', 'rock', true], ['Love', 'rock', true], ['The Velvet Underground', 'rock', true],
  ['The Band', 'rock', true], ['Crosby, Stills, Nash & Young', 'folk', true], ['Buffalo Springfield', 'folk', true],
  ['The Flying Burrito Brothers', 'country', true], ['Gram Parsons', 'country', false], ['The Monkees', 'pop', true],
  ['The Mamas & the Papas', 'pop', true], ['The Byrds', 'rock', true], ['The Animals', 'rock', true],
  ['The Beach Boys', 'rock', true], ['The Kinks', 'rock', true], ['The Who', 'rock', true],
  ['Cream', 'rock', true], ['The Jimi Hendrix Experience', 'rock', true], ['The Doors', 'rock', true],
  ['The Rolling Stones', 'rock', true], ['The Beatles', 'rock', true], ['Elvis Presley', 'rock', false],
];

function matchArtist(resultName, target) {
  const a = normArtist(resultName);
  const t = normArtist(target);
  if (!a || !t) return false;
  if (a === t) return true;
  if (a.includes(' & ' + t) || a.includes(' and ' + t) || a.includes(', ' + t)) return true;
  if (a.startsWith(t + ' ')) {
    const rest = a.slice(t.length + 1);
    return /^(&|and|feat|featuring|with|vs|x)\b/.test(rest) || /^(band|orchestra|quartet|trio|sisters|brothers|family|experience|project|collective|group)\b/.test(rest);
  }
  return false;
}

fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
const cache = fs.existsSync(CACHE_FILE) ? JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')) : {};
async function fetchArtist(name) {
  if (cache[name]) return cache[name];
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(name)}&entity=song&limit=50&country=DE&attribute=artistTerm`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'user-agent': 'HitsterWeb/1.0' } });
      if (res.ok) {
        const data = await res.json();
        cache[name] = data.results || [];
        fs.writeFileSync(CACHE_FILE, JSON.stringify(cache));
        return cache[name];
      }
      await sleep(1200 * (attempt + 1));
    } catch {
      await sleep(800 * (attempt + 1));
    }
  }
  cache[name] = [];
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache));
  return [];
}

const existing = new Set(CATALOG.songs.map((s) => key(s.title, s.artist)));
if (fs.existsSync(SELECTED)) {
  for (const line of fs.readFileSync(SELECTED, 'utf8').trim().split('\n')) {
    const [, , , artist, title] = line.split('|');
    if (title) existing.add(key(title, artist));
  }
}
const seen = new Set();
const candidates = [];
for (const [name, genre, group] of curated) {
  const results = await fetchArtist(name);
  await sleep(200);
  const byTitle = new Map();
  for (const r of results) {
    if (r.kind !== 'song' || !r.previewUrl || !r.releaseDate) continue;
    if (!matchArtist(r.artistName, name)) continue;
    if (BAD.test(r.trackName || '')) continue;
    if (HOLIDAY.test(r.trackName || '') || HOLIDAY.test(r.collectionName || '')) continue;
    const year = new Date(r.releaseDate).getUTCFullYear();
    if (!year || year < 1950 || year > 1969) continue;
    const base = baseTitle(r.trackName);
    if (!base || base.length < 2) continue;
    const k = norm(base);
    const prev = byTitle.get(k);
    if (!prev || year < prev.year) byTitle.set(k, { title: base, year, collection: r.collectionName });
  }
  for (const item of byTitle.values()) {
    const k = key(item.title, name);
    if (existing.has(k) || seen.has(k)) continue;
    seen.add(k);
    candidates.push({ title: item.title, artist: name, year: item.year, genre, group, collection: item.collection });
  }
  console.log(`[oldies] ${name}: ${byTitle.size} -> total ${candidates.length}`);
}

const fifties = candidates.filter((c) => c.year < 1960);
const sixties = candidates.filter((c) => c.year >= 1960);
fifties.sort((a, b) => a.year - b.year);
sixties.sort((a, b) => a.year - b.year);
const selected = [...fifties.slice(0, 140), ...sixties.slice(0, 220)];
fs.writeFileSync(OUT, selected.map((c) => `${c.year}|${c.genre}|${c.group ? 'G' : 'S'}|${c.artist}|${c.title}|`).join('\n') + '\n');
console.log(`[oldies] candidates: ${candidates.length} (1950s ${fifties.length}, 1960s ${sixties.length})`);
console.log(`[oldies] selected: ${selected.length} -> ${OUT}`);
