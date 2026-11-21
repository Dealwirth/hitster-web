#!/usr/bin/env node
/** Fills early years so every playable year has at least ten songs. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CATALOG_PATH = path.join(ROOT, 'data/catalog.json');
const SOURCE_PATH = path.join(ROOT, 'data/songs.source.tsv');
const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
const norm = (s = '') => String(s).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/&/g, ' and ').replace(/\b(feat|featuring|ft)\b\.?.*$/, '').replace(/[^a-z0-9]+/g, ' ').trim();
const key = (title, artist) => `${norm(title)}|${norm(artist)}`;
const existing = new Set(catalog.songs.map((song) => key(song.title, song.artist)));

const CANDIDATES = {
  1950: [
    ['Nat King Cole', 'Mona Lisa', 'pop'],
    ['Patti Page', 'Tennessee Waltz', 'country'],
    ['Teresa Brewer', 'Music! Music! Music!', 'pop'],
    ['Perry Como', 'Hoop-Dee-Doo', 'pop'],
    ['Frankie Laine', 'The Cry of the Wild Goose', 'country'],
    ['Gordon Jenkins', 'My Foolish Heart', 'jazz'],
    ['Sammy Kaye', 'Harbor Lights', 'pop'],
    ['Bing Crosby', 'Chattanoogie Shoe Shine Boy', 'country'],
    ['Les Paul & Mary Ford', 'Tennessee Waltz', 'pop'],
    ['Doris Day', 'Bewitched, Bothered and Bewildered', 'jazz'],
    ['Guy Lombardo', 'Enjoy Yourself (It\'s Later Than You Think)', 'pop'],
    ['The Andrews Sisters', 'I Can Dream, Can\'t I?', 'pop'],
  ],
  1951: [
    ['Tony Bennett', 'Because of You', 'pop'],
    ['Rosemary Clooney', 'Come On-a My House', 'pop'],
    ['Nat King Cole', 'Unforgettable', 'jazz'],
    ['Les Paul & Mary Ford', 'How High the Moon', 'pop'],
    ['Johnnie Ray', 'Cry', 'pop'],
    ['Patti Page', 'Would I Love You (Love You, Love You)', 'pop'],
    ['Perry Como', 'If', 'pop'],
    ['Eddy Howard', 'Sin (It\'s No Sin)', 'pop'],
    ['Frankie Laine', 'Jezebel', 'country'],
    ['Dinah Shore', 'Sweet Violets', 'pop'],
    ['Kay Starr', 'Wheel of Fortune', 'pop'],
    ['Vaughn Monroe', 'Sound Off', 'pop'],
  ],
  1952: [
    ['Patti Page', 'I Went to Your Wedding', 'pop'],
    ['Vera Lynn', 'Auf Wiederseh\'n Sweetheart', 'pop'],
    ['Eddie Fisher', 'Wish You Were Here', 'pop'],
    ['Perry Como', 'Don\'t Let the Stars Get in Your Eyes', 'pop'],
    ['Jo Stafford', 'You Belong to Me', 'pop'],
    ['Gene Kelly', 'Singin\' in the Rain', 'film'],
    ['Doris Day', 'A Guy Is a Guy', 'pop'],
    ['Johnnie Ray', 'Walkin\' My Baby Back Home', 'pop'],
    ['Rosemary Clooney', 'Half as Much', 'country'],
    ['Hank Williams', 'Jambalaya (On the Bayou)', 'country'],
    ['Kay Starr', 'Wheel of Fortune', 'pop'],
    ['Eddie Fisher', 'Outside of Heaven', 'pop'],
  ],
  1953: [
    ['Frank Sinatra', 'I\'ve Got the World on a String', 'jazz'],
    ['Dean Martin', 'That\'s Amore', 'pop'],
    ['Les Paul & Mary Ford', 'Vaya con Dios', 'pop'],
    ['Eddie Fisher', 'I\'m Walking Behind You', 'pop'],
    ['Perry Como', 'No Other Love', 'pop'],
    ['Patti Page', 'How Much Is That Doggie in the Window', 'pop'],
    ['The Drifters', 'Money Honey', 'rnb'],
    ['Doris Day', 'Secret Love', 'film'],
    ['Kitty Kallen', 'Little Things Mean a Lot', 'pop'],
    ['Rosemary Clooney', 'Mambo Italiano', 'pop'],
    ['Frankie Laine', 'I Believe', 'pop'],
    ['The Ames Brothers', 'You, You, You', 'pop'],
  ],
  1954: [
    ['Bill Haley & His Comets', 'Rock Around the Clock', 'rock'],
    ['Elvis Presley', 'That\'s All Right', 'rock'],
    ['Doris Day', 'Secret Love', 'film'],
    ['Kitty Kallen', 'Little Things Mean a Lot', 'pop'],
    ['Perry Como', 'Wanted', 'pop'],
    ['Rosemary Clooney', 'Mambo Italiano', 'pop'],
    ['The Crew Cuts', 'Sh-Boom', 'rnb'],
    ['Eddie Fisher', 'Oh! My Pa-Pa', 'pop'],
    ['The Four Aces', 'Three Coins in the Fountain', 'film'],
    ['Frank Sinatra', 'Young at Heart', 'pop'],
    ['Judy Garland', 'The Man That Got Away', 'film'],
    ['Nat King Cole', 'Smile', 'jazz'],
  ],
  1955: [
    ['Little Richard', 'Tutti Frutti', 'rock'],
    ['Chuck Berry', 'Maybellene', 'rock'],
    ['The Platters', 'The Great Pretender', 'rnb'],
    ['Fats Domino', 'Ain\'t That a Shame', 'rock'],
    ['Tennessee Ernie Ford', 'Sixteen Tons', 'country'],
    ['Frank Sinatra', 'Love and Marriage', 'pop'],
    ['Bill Haley & His Comets', 'Rock Around the Clock', 'rock'],
    ['The Chordettes', 'Mr. Sandman', 'pop'],
    ['Mitch Miller', 'The Yellow Rose of Texas', 'country'],
    ['Pérez Prado', 'Cherry Pink and Apple Blossom White', 'latin'],
    ['Dean Martin', 'Memories Are Made of This', 'pop'],
    ['The Four Lads', 'Moments to Remember', 'pop'],
  ],
};

const counts = new Map();
for (const song of catalog.songs) counts.set(song.year, (counts.get(song.year) || 0) + 1);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function searchItunes(title, artist) {
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(`${title} ${artist}`)}&entity=song&limit=20&country=DE`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 12000);
      const res = await fetch(url, { signal: ctrl.signal, headers: { 'user-agent': 'HitsterWeb/4.6' } });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const nt = norm(title);
      const na = norm(artist);
      return (data.results || []).find((item) => {
        const it = norm(item.trackName);
        const ia = norm(item.artistName);
        return item.previewUrl && (it === nt || it.startsWith(nt) || nt.startsWith(it)) && (ia === na || ia.includes(na) || na.includes(ia));
      }) || null;
    } catch {
      await sleep(500 * (attempt + 1));
    }
  }
  return null;
}

async function searchDeezer(title, artist) {
  const url = `https://api.deezer.com/2.0/search?q=${encodeURIComponent(`${title} ${artist}`)}&limit=20`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 12000);
      const res = await fetch(url, { signal: ctrl.signal, headers: { 'user-agent': 'HitsterWeb/4.6' } });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const nt = norm(title);
      const na = norm(artist);
      return (data.data || []).find((item) => {
        const it = norm(item.title);
        const ia = norm(item.artist?.name);
        return item.preview && (it === nt || it.startsWith(nt) || nt.startsWith(it)) && (ia === na || ia.includes(na) || na.includes(ia));
      }) || null;
    } catch {
      await sleep(500 * (attempt + 1));
    }
  }
  return null;
}

let nextId = Math.max(0, ...catalog.songs.map((song) => Number(String(song.id).replace(/\D/g, '')) || 0)) + 1;
const added = [];
for (const [yearText, candidates] of Object.entries(CANDIDATES)) {
  const year = Number(yearText);
  for (const [artist, title, genre] of candidates) {
    if ((counts.get(year) || 0) >= 10) break;
    const identity = key(title, artist);
    if (existing.has(identity)) continue;
    const result = await searchItunes(title, artist) || await searchDeezer(title, artist);
    if (!result) {
      console.log(`[year] skip ${year} ${artist} – ${title}`);
      continue;
    }
    const id = `s${String(nextId++).padStart(4, '0')}`;
    const group = /\s(&|and|feat\.?|featuring)\s/i.test(artist);
    const art = result.artworkUrl100
      ? String(result.artworkUrl100).replace('100x100bb', '600x600bb')
      : (result.album?.cover_xl || result.album?.cover_big || null);
    catalog.songs.push({
      id,
      title,
      artist,
      year,
      genre,
      group,
      tags: ['year-filler', 'oldies'],
      spotifyId: null,
      deezerId: result.id || null,
      itunesId: result.trackId || null,
      previewUrl: result.previewUrl || result.preview || null,
      art,
      artUrl: art,
      duration: result.trackTimeMillis ? Math.round(result.trackTimeMillis / 1000) : (result.duration || null),
      isrc: result.isrc || null,
      album: result.collectionName || result.album?.title || null,
      source: result.trackId ? 'itunes' : 'deezer',
      popularity: null,
      popularitySource: null,
      groupSource: 'curated',
    });
    existing.add(identity);
    counts.set(year, (counts.get(year) || 0) + 1);
    added.push({ id, year, title, artist });
    console.log(`[year] + ${year} ${id} ${artist} – ${title}`);
  }
}

catalog.count = catalog.songs.length;
fs.writeFileSync(CATALOG_PATH, `${JSON.stringify(catalog, null, 2)}\n`);
if (added.length) {
  const lines = added.map((song) => `${song.year}|${catalog.songs.find((entry) => entry.id === song.id).genre}|${catalog.songs.find((entry) => entry.id === song.id).group ? 'G' : 'S'}|${song.artist}|${song.title}|year-filler`).join('\n');
  fs.appendFileSync(SOURCE_PATH, `\n${lines}\n`);
}
console.log(`[year] added ${added.length}; catalog now ${catalog.count}`);
const missing = Object.keys(CANDIDATES).map(Number).filter((year) => (counts.get(year) || 0) < 10);
console.log(missing.length ? `[year] still under 10: ${missing.map((year) => `${year}:${counts.get(year) || 0}`).join(', ')}` : '[year] all target years have at least 10 songs');
