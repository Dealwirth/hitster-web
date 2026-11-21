#!/usr/bin/env node
/** Expands the two small version pools (Movie, One-Hit) to at least 200 cards. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CATALOG_PATH = path.join(ROOT, 'data/catalog.json');
const SOURCE_PATH = path.join(ROOT, 'data/songs.source.tsv');
const CARDS_PATH = path.join(ROOT, 'public/hitster-cards.json');
const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
const cards = Object.values(JSON.parse(fs.readFileSync(CARDS_PATH, 'utf8')).cards);

const norm = (s = '') => String(s)
  .normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .replace(/&/g, ' and ').replace(/\b(feat|featuring|ft)\b\.?.*$/, '')
  .replace(/[^a-z0-9]+/g, ' ').trim();
const key = (title, artist) => `${norm(title)}|${norm(artist)}`;
const existing = new Map(catalog.songs.map((song) => [key(song.title, song.artist), song]));
const sourceUpdates = new Map();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function addTag(song, tag) {
  const tags = new Set(song.tags || []);
  if (tags.has(tag)) return false;
  tags.add(tag);
  song.tags = [...tags];
  const k = key(song.title, song.artist);
  const update = sourceUpdates.get(k) || new Set(song.tags);
  update.add(tag);
  sourceUpdates.set(k, update);
  return true;
}

const MOVIE_EXTRA = `
1955|The Four Aces|Love Is a Many-Splendored Thing
1956|Doris Day|Que Sera, Sera (Whatever Will Be, Will Be)
1957|Frank Sinatra|All the Way
1959|Frank Sinatra|High Hopes
1960|Pat Boone|Theme from Exodus
1961|Henry Mancini|Moon River
1962|Andy Williams|Days of Wine and Roses
1963|Jack Jones|Call Me Irresponsible
1964|Dick Van Dyke|Chim Chim Cher-ee
1965|Tony Bennett|The Shadow of Your Smile
1966|Matt Monro|Born Free
1967|Rex Harrison|Talk to the Animals
1968|Noel Harrison|The Windmills of Your Mind
1970|Andy Williams|Love Story (Where Do I Begin)
1971|Isaac Hayes|Theme from Shaft
1972|Andy Williams|Speak Softly Love
1973|Barbra Streisand|The Way We Were
1974|Maureen McGovern|We May Never Love Like This Again
1975|Keith Carradine|I'm Easy
1976|Barbra Streisand|Evergreen (Love Theme from A Star Is Born)
1977|Debby Boone|You Light Up My Life
1978|Donna Summer|Last Dance
1979|Jennifer Warnes|It Goes Like It Goes
1980|Irene Cara|Fame
1981|Christopher Cross|Arthur's Theme (Best That You Can Do)
1982|Joe Cocker & Jennifer Warnes|Up Where We Belong
1983|Irene Cara|Flashdance... What a Feeling
1984|Stevie Wonder|I Just Called to Say I Love You
1985|Lionel Richie|Say You, Say Me
1986|Berlin|Take My Breath Away
1987|Bill Medley & Jennifer Warnes|(I've Had) The Time of My Life
1988|Carly Simon|Let the River Run
1989|Samuel E. Wright|Under the Sea
1990|Madonna|Sooner or Later
1991|Céline Dion & Peabo Bryson|Beauty and the Beast
1992|Peabo Bryson & Regina Belle|A Whole New World
1993|Bruce Springsteen|Streets of Philadelphia
1994|Elton John|Can You Feel the Love Tonight
1995|Vanessa Williams|Colors of the Wind
1996|Madonna|You Must Love Me
1997|Céline Dion|My Heart Will Go On
1998|Aerosmith|I Don't Want to Miss a Thing
1999|Sarah McLachlan|When She Loved Me
2000|Bob Dylan|Things Have Changed
2001|Enya|May It Be
2002|Eminem|Lose Yourself
2003|Annie Lennox|Into the West
2004|Jorge Drexler|Al Otro Lado del Río
2005|Three 6 Mafia|It's Hard out Here for a Pimp
2006|Melissa Etheridge|I Need to Wake Up
2007|Glen Hansard & Markéta Irglová|Falling Slowly
2008|A.R. Rahman|Jai Ho
2009|Ryan Bingham|The Weary Kind
2010|Randy Newman|We Belong Together
2011|Jason Segel & Walter|Man or Muppet
2012|Adele|Skyfall
2013|Idina Menzel|Let It Go
2014|John Legend & Common|Glory
2015|Sam Smith|Writing's on the Wall
2016|Ryan Gosling & Emma Stone|City of Stars
2017|Miguel & Natalia Lafourcade|Remember Me
2018|Lady Gaga & Bradley Cooper|Shallow
2019|Elton John|(I'm Gonna) Love Me Again
2020|H.E.R.|Fight for You
2021|Billie Eilish|No Time to Die
2022|Rahul Sipligunj & Kaala Bhairava|Naatu Naatu
2023|Billie Eilish|What Was I Made For?
2024|Jon Batiste|It Never Went Away
1984|Ray Parker Jr.|Ghostbusters
1982|Survivor|Eye of the Tiger
1976|Bill Conti|Gonna Fly Now
1985|Huey Lewis and the News|The Power of Love
1986|Kenny Loggins|Danger Zone
1984|Kenny Loggins|Footloose
1977|Bee Gees|Stayin' Alive
1978|Frankie Valli|Grease
1978|Olivia Newton-John|Hopelessly Devoted to You
1978|John Travolta & Olivia Newton-John|Summer Nights
1978|John Travolta & Olivia Newton-John|You're the One That I Want
1980|Olivia Newton-John|Xanadu
1979|Kermit the Frog|Rainbow Connection
1979|Bette Midler|The Rose
1981|Diana Ross & Lionel Richie|Endless Love
1992|Whitney Houston|I Have Nothing
1993|Whitney Houston|Run to You
1995|Seal|Kiss from a Rose
1995|Coolio|Gangsta's Paradise
1996|Madonna|Don't Cry for Me Argentina
1999|Madonna|Beautiful Stranger
2002|Madonna|Die Another Day
1997|Will Smith|Men in Black
2000|Destiny's Child|Independent Women Part I
2001|Christina Aguilera, Lil' Kim, Mýa & P!nk|Lady Marmalade
2013|Pharrell Williams|Happy
2014|Tegan and Sara|Everything Is Awesome
2016|Justin Timberlake|Can't Stop the Feeling!
2017|The Greatest Showman Ensemble|This Is Me
2018|Post Malone & Swae Lee|Sunflower
2009|Leona Lewis|I See You
2001|Randy Newman|You've Got a Friend in Me
1994|Elton John|Circle of Life
1998|Christina Aguilera|Reflection
1997|Michael Bolton|Go the Distance
2001|John Goodman & Billy Crystal|If I Didn't Have You
2020|Justin Timberlake|The Other Side
2022|Lady Gaga|Hold My Hand
2023|Ryan Gosling|I'm Just Ken
`.trim().split('\n').map((line) => {
  const [year, artist, title] = line.split('|');
  return { year: Number(year), artist, title };
});

async function searchItunes(title, artist) {
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(`${title} ${artist}`)}&entity=song&limit=25&country=DE`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 10000);
      const res = await fetch(url, { signal: ctrl.signal, headers: { 'user-agent': 'HitsterWeb/4.7' } });
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
    } catch { await sleep(400 * (attempt + 1)); }
  }
  return null;
}

async function searchDeezer(title, artist) {
  const url = `https://api.deezer.com/2.0/search?q=${encodeURIComponent(`${title} ${artist}`)}&limit=25`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 10000);
      const res = await fetch(url, { signal: ctrl.signal, headers: { 'user-agent': 'HitsterWeb/4.7' } });
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
    } catch { await sleep(400 * (attempt + 1)); }
  }
  return null;
}

async function resolve(song) {
  const titles = [song.title];
  const inner = String(song.title).match(/\(([^)]+)\)/)?.[1];
  if (inner) titles.push(inner);
  for (const title of titles) {
    const result = await searchItunes(title, song.artist) || await searchDeezer(title, song.artist);
    if (result) return { result, title };
  }
  return null;
}

let nextId = Math.max(0, ...catalog.songs.map((song) => Number(String(song.id).replace(/\D/g, '')) || 0)) + 1;
const added = [];

function makeSong(song, result, genre, tags, spotifyId = null) {
  const id = `s${String(nextId++).padStart(4, '0')}`;
  const group = /\s(&|and|feat\.?|featuring)\s/i.test(song.artist) || /\b(band|orchestra|ensemble|quartet|trio)\b/i.test(song.artist);
  const art = result.artworkUrl100
    ? String(result.artworkUrl100).replace('100x100bb', '600x600bb')
    : (result.album?.cover_xl || result.album?.cover_big || null);
  return {
    id, title: song.title, artist: song.artist, year: song.year, genre, group, tags, spotifyId,
    deezerId: result.id || null,
    itunesId: result.trackId || null,
    previewUrl: result.previewUrl || result.preview || null,
    art, artUrl: art,
    duration: result.trackTimeMillis ? Math.round(result.trackTimeMillis / 1000) : (result.duration || null),
    isrc: result.isrc || null,
    album: result.collectionName || result.album?.title || null,
    source: result.trackId ? 'itunes' : result.id ? 'deezer' : 'curated',
    popularity: null, popularitySource: null, groupSource: 'curated',
  };
}

for (const song of catalog.songs) {
  if (song.genre === 'film' || song.genres?.includes('film')) addTag(song, 'movie');
}

const movieCards = cards
  .filter((card) => card.sku === 'aaaa0026' && card.year >= 1950 && card.year <= 2026)
  .map((card) => ({ year: card.year, artist: card.artist, title: card.title, spotifyId: card.spotifyId }));
const movieCandidates = [...movieCards, ...MOVIE_EXTRA];
let movieCount = catalog.songs.filter((song) => song.tags?.includes('movie')).length;
let cursor = 0;
async function movieWorker() {
  while (cursor < movieCandidates.length && movieCount < 200) {
    const candidate = movieCandidates[cursor++];
    const k = key(candidate.title, candidate.artist);
    const found = existing.get(k);
    if (found) {
      if (addTag(found, 'movie')) movieCount += 1;
      continue;
    }
    const match = await resolve(candidate);
    const song = makeSong(candidate, match?.result || {}, 'film', ['movie'], candidate.spotifyId || null);
    existing.set(k, song);
    catalog.songs.push(song);
    added.push(song);
    movieCount += 1;
    console.log(`[movie] + ${song.id} ${song.year} ${song.artist} – ${song.title}${match ? '' : ' (ohne Vorschau)'}`);
  }
}
await Promise.all(Array.from({ length: 6 }, movieWorker));
console.log(`[movie] ${movieCount} cards`);

// A practical one-hit pool: artists that occur only once in this catalogue.
const artistCounts = new Map();
for (const song of catalog.songs) artistCounts.set(norm(song.artist), (artistCounts.get(norm(song.artist)) || 0) + 1);
let oneHitCount = catalog.songs.filter((song) => song.tags?.includes('onehit')).length;
const oneHitCandidates = catalog.songs
  .filter((song) => !song.tags?.includes('onehit') && artistCounts.get(norm(song.artist)) === 1)
  .sort((a, b) => a.year - b.year);
for (const song of oneHitCandidates) {
  if (oneHitCount >= 200) break;
  if (addTag(song, 'onehit')) oneHitCount += 1;
}
console.log(`[onehit] ${oneHitCount} cards`);

catalog.count = catalog.songs.length;
fs.writeFileSync(CATALOG_PATH, `${JSON.stringify(catalog, null, 2)}\n`);

const lines = fs.readFileSync(SOURCE_PATH, 'utf8').split('\n');
const updated = lines.map((line) => {
  const parts = line.split('|');
  if (parts.length < 6) return line;
  const tags = sourceUpdates.get(key(parts[4], parts[3]));
  if (!tags) return line;
  parts[5] = [...new Set([...parts[5].split(',').filter(Boolean), ...tags])].join(',');
  return parts.join('|');
});
for (const song of added) {
  updated.push(`${song.year}|${song.genre}|${song.group ? 'G' : 'S'}|${song.artist}|${song.title}|${song.tags.join(',')}`);
}
fs.writeFileSync(SOURCE_PATH, `${updated.join('\n').replace(/\n+$/, '')}\n`);
console.log(`[versions] movie=${movieCount}, onehit=${oneHitCount}, catalog=${catalog.count}, added=${added.length}`);
if (movieCount < 200 || oneHitCount < 200) process.exitCode = 1;
