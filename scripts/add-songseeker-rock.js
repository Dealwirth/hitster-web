#!/usr/bin/env node
/** Adds missing Rock/Metal cards from Songseeker to the playable catalog. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CATALOG_PATH = path.join(ROOT, 'data/catalog.json');
const SOURCE_PATH = path.join(ROOT, 'data/songs.source.tsv');
const CARDS_PATH = path.join(ROOT, 'public/hitster-cards.json');
const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
const meta = JSON.parse(fs.readFileSync(CARDS_PATH, 'utf8')).cards;
const norm = (s = '') => String(s).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/&/g, ' and ').replace(/\b(feat|featuring|ft)\b\.?.*$/, '').replace(/\b(remaster(ed)?|radio edit|single version|album version|live|mono|stereo|deluxe|bonus track)\b/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const key = (title, artist) => `${norm(title)}|${norm(artist)}`;
const existing = new Set(catalog.songs.map((s) => key(s.title, s.artist)));
const wanted = Object.values(meta).filter((m) => m.sku === 'aaaa0039' && !existing.has(key(m.title, m.artist)));
const extraMetal = [
  [1980, 'Iron Maiden', 'Iron Maiden'], [1982, 'Iron Maiden', 'The Number of the Beast'],
  [1983, 'Iron Maiden', 'The Trooper'], [1986, 'Slayer', 'Angel of Death'],
  [1990, 'Slayer', 'Seasons in the Abyss'], [1986, 'Megadeth', 'Peace Sells'],
  [1990, 'Megadeth', 'Holy Wars... The Punishment Due'], [1986, 'Metallica', 'Battery'],
  [1988, 'Metallica', 'One'], [1991, 'Metallica', 'Enter Sandman'],
  [1991, 'Metallica', 'Nothing Else Matters'], [1980, 'Black Sabbath', 'Heaven and Hell'],
  [1970, 'Black Sabbath', 'Paranoid'], [1970, 'Black Sabbath', 'Iron Man'],
  [1980, 'Judas Priest', 'Breaking the Law'], [1982, 'Judas Priest', 'You Got Another Thing Comin\''],
  [1983, 'Dio', 'Rainbow in the Dark'], [1984, 'Van Halen', 'Hot for Teacher'],
  [1987, 'Guns N\' Roses', 'Welcome to the Jungle'], [1987, 'Guns N\' Roses', 'Sweet Child O\' Mine'],
  [1989, 'Guns N\' Roses', 'Paradise City'], [1991, 'Nirvana', 'Smells Like Teen Spirit'],
  [1993, 'Nirvana', 'Heart-Shaped Box'], [1992, 'Alice in Chains', 'Would?'],
  [1994, 'Soundgarden', 'Black Hole Sun'], [1992, 'Rage Against the Machine', 'Killing in the Name'],
  [1996, 'Rage Against the Machine', 'Bulls on Parade'], [1999, 'Slipknot', 'Wait and Bleed'],
  [2001, 'Slipknot', 'People = Shit'], [2001, 'System of a Down', 'Chop Suey!'],
  [2005, 'System of a Down', 'B.Y.O.B.'], [2000, 'Linkin Park', 'In the End'],
  [2001, 'Linkin Park', 'Crawling'], [2003, 'Evanescence', 'Bring Me to Life'],
  [2006, 'Killswitch Engage', 'My Curse'], [2008, 'Bring Me the Horizon', 'Chelsea Smile'],
  [2011, 'Bring Me the Horizon', 'Sleepwalking'], [2013, 'Bring Me the Horizon', 'Can You Feel My Heart'],
  [2015, 'Ghost', 'Cirice'], [2018, 'Ghost', 'Dance Macabre'],
  [2020, 'Bring Me the Horizon', 'Parasite Eve'], [2023, 'Sleep Token', 'The Summoning'],
  [2021, 'Spiritbox', 'Circle With Me'], [2021, 'Electric Callboy', 'We Got the Moves'],
  [2022, 'Electric Callboy', 'Hypa Hypa'], [2023, 'Måneskin', 'Honey (Are U Coming?)'],
].filter(([, artist, title]) => !existing.has(key(title, artist))).map(([year, artist, title]) => ({ year, artist, title, group: true, sku: 'manual-metal' }));

const seen = new Set(existing);
const all = [...wanted, ...extraMetal].filter((song) => {
  const k = key(song.title, song.artist);
  if (seen.has(k)) return false;
  seen.add(k);
  return true;
});
console.log(`[rock] ${wanted.length} Songseeker Rock cards + ${extraMetal.length} curated metal = ${all.length} candidates`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function search(song) {
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(`${song.title} ${song.artist}`)}&entity=song&limit=20&country=DE`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 12000);
      const res = await fetch(url, { signal: ctrl.signal, headers: { 'user-agent': 'HitsterWeb/4.5' } });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const targetTitle = norm(song.title);
      const targetArtist = norm(song.artist);
      const candidates = (data.results || []).filter((r) => {
        const t = norm(r.trackName);
        const a = norm(r.artistName);
        return (t === targetTitle || t.startsWith(targetTitle) || targetTitle.startsWith(t)) && (a === targetArtist || a.includes(targetArtist) || targetArtist.includes(a));
      });
      return candidates.find((r) => r.previewUrl && r.artworkUrl100) || null;
    } catch { await sleep(500 * (attempt + 1)); }
  }
  return null;
}


async function searchDeezer(song) {
  const url = `https://api.deezer.com/2.0/search?q=${encodeURIComponent(`${song.title} ${song.artist}`)}&limit=20`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 12000);
      const res = await fetch(url, { signal: ctrl.signal, headers: { 'user-agent': 'HitsterWeb/4.5' } });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const targetTitle = norm(song.title);
      const targetArtist = norm(song.artist);
      return (data.data || []).find((r) => {
        const t = norm(r.title);
        const a = norm(r.artist?.name);
        return r.preview && (t === targetTitle || t.startsWith(targetTitle) || targetTitle.startsWith(t)) && (a === targetArtist || a.includes(targetArtist) || targetArtist.includes(a));
      }) || null;
    } catch { await sleep(500 * (attempt + 1)); }
  }
  return null;
}

const added = new Array(all.length);
let nextId = Math.max(0, ...catalog.songs.map((song) => Number(String(song.id).replace(/\D/g, '')) || 0)) + 1;
let cursor = 0;
async function worker() {
  while (cursor < all.length) {
    const index = cursor++;
    const song = all[index];
    const result = await search(song) || await searchDeezer(song);
    if (!result) { console.log(`[rock] skip ${song.artist} – ${song.title}`); continue; }
    const id = `s${String(nextId++).padStart(4, '0')}`;
    added[index] = {
      id,
      title: song.title,
      artist: song.artist,
      year: song.year,
      genre: song.sku === 'manual-metal' ? 'metal' : 'rock',
      group: song.group,
      tags: ['songseeker'],
      spotifyId: song.spotifyId || null,
      deezerId: result.id || null,
      itunesId: result.trackId || null,
      art: result.artworkUrl100 ? String(result.artworkUrl100).replace('100x100bb', '600x600bb') : (result.album?.cover_xl || result.album?.cover_big || null),
      duration: result.trackTimeMillis ? Math.round(result.trackTimeMillis / 1000) : (result.duration || null),
      isrc: result.isrc || null,
      album: result.collectionName || result.album?.title || null,
      source: result.trackId ? 'itunes' : 'deezer',
      matchScore: 30,
      popularity: null,
      popularitySource: null,
      groupSource: song.sku === 'manual-metal' ? 'curated' : 'songseeker',
    };
    console.log(`[rock] + ${id} ${song.artist} – ${song.title}`);
  }
}
await Promise.all(Array.from({ length: 8 }, worker));
const resolved = added.filter(Boolean);
catalog.songs.push(...resolved);
catalog.count = catalog.songs.length;
fs.writeFileSync(CATALOG_PATH, `${JSON.stringify(catalog, null, 2)}\n`);
const sourceLines = resolved.map((s) => `${s.year}|${s.genre}|${s.group ? 'G' : 'S'}|${s.artist}|${s.title}|songseeker`).join('\n');
fs.appendFileSync(SOURCE_PATH, `\n${sourceLines}\n`);
console.log(`[rock] added ${resolved.length}; catalog now ${catalog.songs.length}`);
