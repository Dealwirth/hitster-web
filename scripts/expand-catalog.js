/**
 * Expands the catalog with well-known songs from iTunes artist charts.
 * Writes candidates + a balanced selection; does not modify the source TSV.
 *
 * Usage: node scripts/expand-catalog.js [--artists=300] [--per-artist=12]
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const CATALOG = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/catalog.json'), 'utf8'));
const CACHE_FILE = path.join(ROOT, 'data/.cache/expansion-itunes.json');
const CANDIDATES_FILE = path.join(ROOT, 'data/expansion-candidates.json');
const SELECTED_FILE = path.join(ROOT, 'data/expansion-selected.tsv');

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? Number(hit.split('=')[1]) : fallback;
};
const TOP_ARTISTS = arg('artists', 300);
const PER_ARTIST = arg('per-artist', 12);

const norm = (s) => String(s || '')
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();
const normArtist = (s) => norm(s).replace(/^the /, '');
const baseTitle = (s) => String(s || '')
  .replace(/\s*[\(\[].*?[\)\]]\s*/g, ' ')
  .replace(/\s+-\s+(single|radio edit|album version|remaster(ed)?|.*mix).*$/i, '')
  .replace(/\s+/g, ' ')
  .trim();
const key = (title, artist) => `${norm(title)}|${normArtist(artist)}`;
const yearOf = (r) => {
  const d = new Date(r.releaseDate);
  return Number.isNaN(d.getTime()) ? null : d.getUTCFullYear();
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const BAD_TITLE = /\b(live|karaoke|instrumental|demo|acoustic|cover|tribute|reprise|medley|edit|version|mix|remix|rmx)\b/i;
const BAD_COLLECTION = /\b(karaoke|tribute|in the style of|made famous|cover version|stars on 45)\b/i;
const BAD_ARTIST = /\b(karaoke|tribute|in the style of|made famous|cover band)\b/i;

function matchArtist(resultName, target) {
  const a = normArtist(resultName);
  const t = normArtist(target);
  if (!a || !t) return false;
  if (a === t) return true;
  if (a.includes(' & ' + t) || a.includes(' and ' + t) || a.includes(', ' + t)) return true;
  if (a.startsWith(t + ' ')) {
    const rest = a.slice(t.length + 1);
    return /^(&|and|feat|featuring|with|vs|x)\b/.test(rest)
      || /^(band|orchestra|quartet|trio|sisters|brothers|family|experience|project|collective|group)\b/.test(rest);
  }
  return false;
}

// Build artist stats from the existing catalog.
const artists = new Map();
for (const s of CATALOG.songs) {
  const a = artists.get(s.artist) || { count: 0, genres: {}, groups: {} };
  a.count++;
  a.genres[s.genre] = (a.genres[s.genre] || 0) + 1;
  a.groups[s.group ? 'group' : 'solo'] = (a.groups[s.group ? 'group' : 'solo'] || 0) + 1;
  artists.set(s.artist, a);
}
const top = (obj) => Object.entries(obj).sort((a, b) => b[1] - a[1])[0]?.[0];

// Iconic artists that may be missing or underrepresented.
const curated = [
  ['Chuck Berry', 'rock', false], ['Little Richard', 'rock', false], ['Fats Domino', 'rock', false],
  ['Ray Charles', 'rnb', false], ['Sam Cooke', 'rnb', false], ['The Everly Brothers', 'rock', true],
  ['Buddy Holly', 'rock', false], ['Roy Orbison', 'rock', false], ['The Supremes', 'rnb', true],
  ['The Temptations', 'rnb', true], ['Otis Redding', 'rnb', false], ['Aretha Franklin', 'rnb', false],
  ['The Animals', 'rock', true], ['The Byrds', 'rock', true], ['The Mamas & the Papas', 'pop', true],
  ['The Monkees', 'pop', true], ['Sly & the Family Stone', 'funk', true], ['James Brown', 'funk', false],
  ['Johnny Cash', 'country', false], ['Dolly Parton', 'country', false], ['Loretta Lynn', 'country', false],
  ['Tammy Wynette', 'country', false], ['Willie Nelson', 'country', false], ['Waylon Jennings', 'country', false],
  ['Merle Haggard', 'country', false], ['The Clash', 'punk', true], ['Sex Pistols', 'punk', true],
  ['Ramones', 'punk', true], ['Talking Heads', 'indie', true], ['Patti Smith', 'rock', false],
  ['Iggy Pop', 'rock', false], ['Lou Reed', 'rock', false], ['T. Rex', 'rock', true],
  ['Slade', 'rock', true], ['Sweet', 'rock', true], ['Suzi Quatro', 'rock', false],
  ['Joan Jett', 'rock', false], ['Pat Benatar', 'rock', false], ['The B-52\'s', 'indie', true],
  ['Devo', 'electronic', true], ['The Cars', 'rock', true], ['Tom Petty', 'rock', false],
  ['Lynyrd Skynyrd', 'rock', true], ['The Allman Brothers Band', 'rock', true], ['Steely Dan', 'rock', true],
  ['Chicago', 'rock', true], ['Earth, Wind & Fire', 'funk', true], ['Kool & the Gang', 'funk', true],
  ['Chic', 'funk', true], ['Sister Sledge', 'funk', true], ['Rose Royce', 'funk', true],
  ['Gloria Gaynor', 'funk', false], ['Barry White', 'funk', false], ['Isaac Hayes', 'funk', false],
  ['Curtis Mayfield', 'funk', false], ['Al Green', 'rnb', false], ['Jimmy Cliff', 'reggae', false],
  ['Toots & the Maytals', 'reggae', true], ['Duran Duran', 'pop', true], ['Spandau Ballet', 'pop', true],
  ['Culture Club', 'pop', true], ['Wham!', 'pop', true], ['George Michael', 'pop', false],
  ['Cyndi Lauper', 'pop', false], ['Tina Turner', 'pop', false], ['Lionel Richie', 'pop', false],
  ['Chaka Khan', 'funk', false], ['Gloria Estefan', 'latin', false], ['Miami Sound Machine', 'latin', true],
  ['Def Leppard', 'metal', true], ['Mötley Crüe', 'metal', true], ['Van Halen', 'rock', true],
  ['The Cure', 'indie', true], ['New Order', 'electronic', true], ['Joy Division', 'indie', true],
  ['The Smiths', 'indie', true], ['The Stone Roses', 'indie', true], ['Happy Mondays', 'indie', true],
  ['The Jesus and Mary Chain', 'indie', true], ['Sonic Youth', 'indie', true], ['Pixies', 'indie', true],
  ['The Replacements', 'indie', true], ['Hüsker Dü', 'punk', true], ['Slayer', 'metal', true],
  ['Megadeth', 'metal', true], ['Anthrax', 'metal', true], ['Iron Maiden', 'metal', true],
  ['Judas Priest', 'metal', true], ['Motörhead', 'metal', true], ['Run-DMC', 'hiphop', true],
  ['Beastie Boys', 'hiphop', true], ['Public Enemy', 'hiphop', true], ['N.W.A', 'hiphop', true],
  ['Eric B. & Rakim', 'hiphop', true], ['LL Cool J', 'hiphop', false], ['Salt-N-Pepa', 'hiphop', true],
  ['Slick Rick', 'hiphop', false], ['Boogie Down Productions', 'hiphop', true], ['EPMD', 'hiphop', true],
  ['Nirvana', 'rock', true], ['Pearl Jam', 'rock', true], ['Soundgarden', 'rock', true],
  ['Alice in Chains', 'metal', true], ['Stone Temple Pilots', 'rock', true], ['Smashing Pumpkins', 'rock', true],
  ['Oasis', 'rock', true], ['Blur', 'rock', true], ['Pulp', 'pop', true], ['Suede', 'indie', true],
  ['The Verve', 'indie', true], ['Manic Street Preachers', 'rock', true], ['Placebo', 'rock', true],
  ['Portishead', 'electronic', true], ['Massive Attack', 'electronic', true], ['Tricky', 'electronic', false],
  ['The Chemical Brothers', 'electronic', true], ['The Prodigy', 'electronic', true], ['Fatboy Slim', 'electronic', false],
  ['Underworld', 'electronic', true], ['Daft Punk', 'electronic', true], ['Air', 'electronic', true],
  ['Moby', 'electronic', false], ['Beck', 'indie', false], ['Weezer', 'rock', true],
  ['Green Day', 'punk', true], ['Blink-182', 'punk', true], ['The Offspring', 'punk', true],
  ['Rancid', 'punk', true], ['NOFX', 'punk', true], ['Bad Religion', 'punk', true],
  ['Sublime', 'rock', true], ['311', 'rock', true], ['Rage Against the Machine', 'metal', true],
  ['Tool', 'metal', true], ['Nine Inch Nails', 'electronic', true], ['Marilyn Manson', 'metal', false],
  ['Korn', 'metal', true], ['Deftones', 'metal', true], ['Slipknot', 'metal', true],
  ['System of a Down', 'metal', true], ['Tupac', 'hiphop', false], ['Notorious B.I.G.', 'hiphop', false],
  ['Nas', 'hiphop', false], ['Jay-Z', 'hiphop', false], ['Wu-Tang Clan', 'hiphop', true],
  ['Method Man', 'hiphop', false], ['Snoop Dogg', 'hiphop', false], ['Dr. Dre', 'hiphop', false],
  ['OutKast', 'hiphop', true], ['A Tribe Called Quest', 'hiphop', true], ['De La Soul', 'hiphop', true],
  ['Fugees', 'hiphop', true], ['Lauryn Hill', 'rnb', false], ['Wyclef Jean', 'hiphop', false],
  ['Missy Elliott', 'hiphop', false], ['Timbaland', 'hiphop', false], ['Aaliyah', 'rnb', false],
  ['TLC', 'rnb', true], ['Destiny\'s Child', 'rnb', true], ['Boyz II Men', 'rnb', true],
  ['Mariah Carey', 'pop', false], ['Celine Dion', 'pop', false], ['Toni Braxton', 'rnb', false],
  ['Christina Aguilera', 'pop', false], ['Justin Timberlake', 'pop', false], ['*NSYNC', 'pop', true],
  ['Backstreet Boys', 'pop', true], ['Chris Brown', 'rnb', false], ['Ne-Yo', 'rnb', false],
  ['Akon', 'rnb', false], ['Nelly', 'hiphop', false], ['Ludacris', 'hiphop', false],
  ['Lil Wayne', 'hiphop', false], ['T.I.', 'hiphop', false], ['Young Jeezy', 'hiphop', false],
  ['Rick Ross', 'hiphop', false], ['Kid Cudi', 'hiphop', false], ['Mark Ronson', 'pop', false],
  ['Lily Allen', 'pop', false], ['Franz Ferdinand', 'indie', true], ['The Strokes', 'indie', true],
  ['The White Stripes', 'rock', true], ['Interpol', 'indie', true], ['The Libertines', 'indie', true],
  ['Bloc Party', 'indie', true], ['Keane', 'pop', true], ['Snow Patrol', 'rock', true],
  ['Muse', 'rock', true], ['My Chemical Romance', 'rock', true], ['Fall Out Boy', 'rock', true],
  ['Panic! at the Disco', 'pop', true], ['Paramore', 'rock', true], ['Linkin Park', 'metal', true],
  ['Evanescence', 'metal', true], ['Disturbed', 'metal', true], ['Avenged Sevenfold', 'metal', true],
  ['J. Cole', 'hiphop', false], ['Nicki Minaj', 'hiphop', false], ['Cardi B', 'hiphop', false],
  ['Migos', 'hiphop', true], ['Travis Scott', 'hiphop', false], ['Post Malone', 'hiphop', false],
  ['David Guetta', 'electronic', false], ['Avicii', 'electronic', false], ['Zedd', 'electronic', false],
  ['Kygo', 'electronic', false], ['The Chainsmokers', 'electronic', true], ['Martin Garrix', 'electronic', false],
  ['Skrillex', 'electronic', false], ['Major Lazer', 'electronic', true], ['Diplo', 'electronic', false],
  ['Disclosure', 'electronic', true], ['Flume', 'electronic', false], ['Bon Iver', 'indie', false],
  ['Frank Ocean', 'rnb', false], ['Lorde', 'pop', false], ['Halsey', 'pop', false],
  ['Ariana Grande', 'pop', false], ['Selena Gomez', 'pop', false], ['Demi Lovato', 'pop', false],
  ['Justin Bieber', 'pop', false], ['One Direction', 'pop', true], ['Harry Styles', 'pop', false],
  ['Zayn', 'pop', false], ['The 1975', 'pop', true], ['Tame Impala', 'indie', true],
  ['Vampire Weekend', 'indie', true], ['Fleet Foxes', 'folk', true], ['Mumford & Sons', 'folk', true],
  ['Florence + the Machine', 'indie', true], ['Olivia Rodrigo', 'pop', false], ['Doja Cat', 'pop', false],
  ['SZA', 'rnb', false], ['Lil Nas X', 'hiphop', false], ['Rosalía', 'latin', false],
  ['Karol G', 'latin', false], ['Anitta', 'latin', false], ['Udo Lindenberg', 'deutschpop', false],
  ['Peter Maffay', 'deutschpop', false], ['Marius Müller-Westernhagen', 'deutschpop', false],
  ['Die Toten Hosen', 'punk', true], ['Falco', 'ndw', false], ['Trio', 'ndw', true],
  ['Spider Murphy Gang', 'ndw', true], ['Rio Reiser', 'ndw', false], ['PUR', 'deutschpop', true],
  ['Silbermond', 'deutschpop', true], ['Juli', 'deutschpop', true], ['Wir sind Helden', 'deutschpop', true],
  ['Tokio Hotel', 'deutschpop', true], ['Mark Forster', 'deutschpop', false], ['Max Giesinger', 'deutschpop', false],
  ['Namika', 'deutschpop', false], ['Andrea Berg', 'schlager', false], ['Matthias Reim', 'schlager', false],
  ['Wolfgang Petry', 'schlager', false], ['Howard Carpendale', 'schlager', false], ['Sandra', 'pop', false],
  ['Enigma', 'electronic', true], ['Scooter', 'electronic', true], ['Cascada', 'electronic', true],
  ['ATB', 'electronic', false], ['Paul van Dyk', 'electronic', false], ['Sido', 'deutschrap', false],
  ['Bushido', 'deutschrap', false], ['Kool Savas', 'deutschrap', false], ['Bonez MC', 'deutschrap', false],
  ['RAF Camora', 'deutschrap', false], ['Capital Bra', 'deutschrap', false], ['Apache 207', 'deutschrap', false],
  ['Ufo361', 'deutschrap', false], ['Trettmann', 'deutschrap', false], ['Cro', 'deutschrap', false],
  ['Casper', 'deutschrap', false], ['Kraftklub', 'indie', true], ['AnnenMayKantereit', 'indie', true],
  ['Giant Rooks', 'indie', true], ['Marc Anthony', 'latin', false], ['Romeo Santos', 'latin', false],
  ['Prince Royce', 'latin', false], ['J Balvin', 'latin', false], ['Maluma', 'latin', false],
  ['Ozuna', 'latin', false], ['Anuel AA', 'latin', false], ['Farruko', 'latin', false],
  ['Nicky Jam', 'latin', false], ['Shakira', 'latin', false], ['Enrique Iglesias', 'latin', false],
  ['Ricky Martin', 'latin', false], ['Jennifer Lopez', 'latin', false],
];

const entries = [];
for (const [name, a] of [...artists.entries()].sort((x, y) => y[1].count - x[1].count).slice(0, TOP_ARTISTS)) {
  entries.push({ name, genre: top(a.genres) || 'pop', group: top(a.groups) === 'group', fame: a.count, origin: 'catalog' });
}
for (const [name, genre, group] of curated) {
  if (!artists.has(name)) entries.push({ name, genre, group, fame: 1, origin: 'curated' });
}
console.log(`[expand] artists: ${entries.length} (${entries.filter((e) => e.origin === 'curated').length} curated)`);

fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
const cache = fs.existsSync(CACHE_FILE) ? JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')) : {};

async function fetchArtist(name) {
  if (cache[name]) return cache[name];
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(name)}&entity=song&limit=25&country=DE&attribute=artistTerm`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'user-agent': 'HitsterWeb/1.0 (+https://github.com/openhands/hitster-web)' } });
      if (res.ok) {
        const data = await res.json();
        cache[name] = data.results || [];
        fs.writeFileSync(CACHE_FILE, JSON.stringify(cache));
        return cache[name];
      }
      if (res.status === 403 || res.status === 429) await sleep(1500 * (attempt + 1));
      else await sleep(500);
    } catch {
      await sleep(800 * (attempt + 1));
    }
  }
  cache[name] = [];
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache));
  return [];
}

const existing = new Set(CATALOG.songs.map((s) => key(s.title, s.artist)));
const seen = new Set();
const candidates = [];
let fetched = 0;
for (const entry of entries) {
  const results = await fetchArtist(entry.name);
  fetched++;
  if (fetched % 25 === 0) console.log(`[expand] fetched ${fetched}/${entries.length} artists, candidates ${candidates.length}`);
  await sleep(220);
  const byTitle = new Map();
  let rank = 0;
  for (const r of results) {
    if (r.kind !== 'song' || !r.previewUrl || !r.releaseDate) continue;
    if (BAD_ARTIST.test(r.artistName || '')) continue;
    if (!matchArtist(r.artistName, entry.name)) continue;
    if (BAD_COLLECTION.test(r.collectionName || '')) continue;
    if (/\b(live|karaoke|instrumental|demo|acoustic|cover|tribute|reprise|medley)\b/i.test(r.trackName || '')) continue;
    if (String(r.trackName || '').length > 80) continue;
    const year = yearOf(r);
    if (!year || year < 1950 || year > 2024) continue;
    const base = baseTitle(r.trackName);
    if (!base || base.length < 2) continue;
    if (norm(base) === norm(entry.name)) continue;
    const k = norm(base);
    if (!k) continue;
    const prev = byTitle.get(k);
    if (!prev || year < prev.year) byTitle.set(k, { title: base, year, collection: r.collectionName, rank });
    rank++;
  }
  let added = 0;
  for (const item of byTitle.values()) {
    const k = key(item.title, entry.name);
    if (existing.has(k) || seen.has(k)) continue;
    seen.add(k);
    candidates.push({
      title: item.title,
      artist: entry.name,
      year: item.year,
      genre: entry.genre,
      group: entry.group,
      popularity: entry.fame * 2 + Math.max(0, 25 - item.rank),
      collection: item.collection,
    });
    added++;
    if (added >= PER_ARTIST) break;
  }
}

console.log(`[expand] candidates: ${candidates.length}`);
fs.writeFileSync(CANDIDATES_FILE, JSON.stringify({ generatedAt: new Date().toISOString(), candidates }, null, 2));

// Balanced selection.
const decadeOf = (y) => `${Math.floor(y / 10) * 10}s`;
const decadeTarget = { '1950s': 100, '1960s': 300, '1970s': 500, '1980s': 600, '1990s': 600, '2000s': 700, '2010s': 650, '2020s': 327 };
const genreCap = { pop: 900, rock: 750, electronic: 450, hiphop: 400, rnb: 300, country: 220, folk: 120, metal: 160, punk: 110, funk: 90, jazz: 60, latin: 220, reggae: 60, film: 60, schlager: 90, deutschpop: 170, deutschrap: 110, ndw: 50, ska: 40, klassik: 30 };
const currentDecade = {};
const currentGenre = {};
for (const s of CATALOG.songs) {
  currentDecade[decadeOf(s.year)] = (currentDecade[decadeOf(s.year)] || 0) + 1;
  currentGenre[s.genre] = (currentGenre[s.genre] || 0) + 1;
}
const sorted = [...candidates].sort((a, b) => b.popularity - a.popularity);
const selected = [];
const selectedKeys = new Set();
const add = (c) => {
  const k = key(c.title, c.artist);
  if (selectedKeys.has(k)) return false;
  selectedKeys.add(k);
  selected.push(c);
  currentDecade[decadeOf(c.year)] = (currentDecade[decadeOf(c.year)] || 0) + 1;
  currentGenre[c.genre] = (currentGenre[c.genre] || 0) + 1;
  return true;
};
for (const c of sorted) {
  const d = decadeOf(c.year);
  if ((currentDecade[d] || 0) < (decadeTarget[d] || 0) && (currentGenre[c.genre] || 0) < (genreCap[c.genre] || 9999)) add(c);
}
// Fill to at least 2000 new songs, prioritising underfilled decades.
const remaining = sorted.filter((c) => !selectedKeys.has(key(c.title, c.artist)));
remaining.sort((a, b) => {
  const ra = (currentDecade[decadeOf(a.year)] || 0) / (decadeTarget[decadeOf(a.year)] || 1);
  const rb = (currentDecade[decadeOf(b.year)] || 0) / (decadeTarget[decadeOf(b.year)] || 1);
  return ra - rb || b.popularity - a.popularity;
});
for (const c of remaining) {
  if (selected.length >= 2100) break;
  add(c);
}

const lines = selected.map((c) => `${c.year}|${c.genre}|${c.group ? 'G' : 'S'}|${c.artist}|${c.title}|`);
fs.writeFileSync(SELECTED_FILE, `${lines.join('\n')}\n`);
console.log(`[expand] selected: ${selected.length}`);
console.log(`[expand] wrote ${SELECTED_FILE}`);
const dist = {};
for (const c of selected) dist[decadeOf(c.year)] = (dist[decadeOf(c.year)] || 0) + 1;
console.log('[expand] new by decade:', dist);
const gdist = {};
for (const c of selected) gdist[c.genre] = (gdist[c.genre] || 0) + 1;
console.log('[expand] new by genre:', gdist);
