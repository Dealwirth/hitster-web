/* ==========================================================================
   HITSTER Web – app logic
   Vanilla JS, no build step, no tracking, no login.
   ========================================================================== */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const CLIP_SECONDS = 30;
const VERSION = '4.8.0';
const STATIC = document.documentElement.dataset.static === 'true' || location.hostname.endsWith('github.io');
const API_BASE = (document.querySelector('meta[name="hitster-api"]')?.content || '').replace(/\/$/, '');
const API = (path) => `${API_BASE}${path}`;
const itunesCache = new Map();
const STATS_KEY = 'hitster-web-stats-v1';
const ROUND_KEY = 'hitster-web-round-v1';
const PREFS_KEY = 'hitster-web-prefs-v1';
const CATEGORIES_KEY = 'hitster-web-categories-v1';
const ANALYTICS_KEY = 'hitster-web-analytics-v1';

const VERSIONS = {
  all: { label: 'Alle Hits', short: 'Alles', desc: 'Der komplette Katalog', color: '#ff2d95', icon: '∞' },
  guilty: { label: 'Guilty Pleasures', short: 'Guilty', desc: 'Schlager, Pop, Film & Soul', color: '#ff5a3c', icon: '💅', genres: ['pop', 'schlager', 'film', 'rnb', 'latin'] },
  party: { label: 'Party & Dance', short: 'Party', desc: 'Dance, Hip-Hop, Funk, Latin', color: '#29e6ff', icon: '🪩', genres: ['electronic', 'pop', 'funk', 'hiphop', 'latin'] },
  rock: { label: 'Rock & Metal', short: 'Rock', desc: 'Gitarren, Punk und Metal', color: '#ff5a3c', icon: '🎸', genres: ['rock', 'metal', 'punk', 'indie'] },
  deutsch: { label: 'Deutsch', short: 'Deutsch', desc: 'Deutschpop, Rap, Schlager, NDW', color: '#c6ff3d', icon: '🇩🇪', genres: ['deutschpop', 'deutschrap', 'schlager', 'ndw'] },
  onehit: { label: 'One-Hit-Wonder', short: 'One-Hit', desc: 'Ein Hit, nie vergessen', color: '#ffd23f', icon: '💥', tags: ['onehit'] },
  oldies: { label: 'Oldies', short: 'Oldies', desc: '50er, 60er und 70er', color: '#e8e2d0', icon: '📻', decades: ['1950s', '1960s', '1970s'] },
  nineties: { label: '90s Party', short: '90s', desc: 'Der Sound der 1990er', color: '#c084fc', icon: '💿', decades: ['1990s'] },
  love: { label: 'Love & Heartbreak', short: 'Love', desc: 'Soul, Pop, Folk, Schlager', color: '#ff2d95', icon: '💔', genres: ['rnb', 'pop', 'folk', 'schlager'] },
  movie: { label: 'Film & Musical', short: 'Film', desc: 'Kino, Musical und Klassik', color: '#ffd23f', icon: '🎬', tags: ['movie'] },
  summer: { label: 'Summer Hits', short: 'Summer', desc: 'Latin, Reggae, Dance, Pop', color: '#ff9f1c', icon: '🌴', genres: ['latin', 'reggae', 'electronic', 'pop'] },
  charts: { label: 'Charts & Neu', short: 'Charts', desc: '2010er und 2020er', color: '#29e6ff', icon: '📈', decades: ['2010s', '2020s'] },
  bangers: { label: 'Bangers', short: 'Bangers', desc: 'Laut, schnell, Party', color: '#ff3b5c', icon: '🔥', genres: ['metal', 'rock', 'electronic', 'hiphop'] },
};

const GENRES = {
  all: { label: 'Alle', color: '#ff2d95', icon: 'grid' },
  pop: { label: 'Pop', color: '#ff2d95', icon: 'music' },
  rock: { label: 'Rock', color: '#ff5a3c', icon: 'music' },
  indie: { label: 'Indie', color: '#29e6ff', icon: 'music' },
  electronic: { label: 'Electronic', color: '#29e6ff', icon: 'music' },
  hiphop: { label: 'Hip-Hop', color: '#ffb020', icon: 'music' },
  rnb: { label: 'R&B / Soul', color: '#c084fc', icon: 'music' },
  funk: { label: 'Funk / Disco', color: '#ffd23f', icon: 'music' },
  metal: { label: 'Metal', color: '#b0b7c3', icon: 'music' },
  punk: { label: 'Punk', color: '#ff3b5c', icon: 'music' },
  country: { label: 'Country', color: '#ff9f1c', icon: 'music' },
  folk: { label: 'Folk', color: '#c6ff3d', icon: 'music' },
  jazz: { label: 'Jazz', color: '#ffb020', icon: 'music' },
  schlager: { label: 'Schlager', color: '#ff2d95', icon: 'music' },
  deutschpop: { label: 'Deutschpop', color: '#ff5a3c', icon: 'music' },
  deutschrap: { label: 'Deutschrap', color: '#c6ff3d', icon: 'music' },
  latin: { label: 'Latin', color: '#ff9f1c', icon: 'music' },
  reggae: { label: 'Reggae', color: '#c6ff3d', icon: 'music' },
  film: { label: 'Film / Musical', color: '#ffd23f', icon: 'music' },
  klassik: { label: 'Klassik', color: '#e8e2d0', icon: 'music' },
  ndw: { label: 'NDW', color: '#29e6ff', icon: 'music' },
  ska: { label: 'Ska', color: '#c6ff3d', icon: 'music' },
  unbekannt: { label: 'Unbekannt', color: '#9aa0a6', icon: 'music' },
};


const state = {
  songs: [],
  filters: { genres: [], decade: 'all', oneHit: false, spotifyOnly: false },
  current: null,
  recent: [],
  flipped: false,
  playing: false,
  timer: { remaining: CLIP_SECONDS, id: null, last: 0 },
  stats: { played: 0, flipped: 0, correct: 0, wrong: 0, streak: 0, bestStreak: 0 },
  roundSeen: new Set(),
  prefs: { soundOn: true, volume: 0.85, deckSku: 'auto' },
  mode: 'classic',
  version: 'all',
  extensionYear: null,
  blindYear: false,
  analytics: null,
  analyticsTimer: null,
  initialCard: null,
  initialPlaylist: null,
  initialHitster: null,
  playlist: null,
  categories: [],
  hitsterDb: null,
  hitsterCards: null,
  playerHidden: false,
  lastScan: null,
  scanVersion: null,
  returnMode: null,
  transitioning: false,
  installPrompt: null,
  scan: { stream: null, raf: null, active: false, detected: false, last: 0, deckSku: 'auto' },
  toastTimer: null,
  ready: false,
};

const el = {
  card: $('#card'),
  cardWrap: $('#cardWrap'),
  cardFront: $('#cardFront'),
  cardBack: $('#cardBack'),
  vinyl: $('#vinyl'),
  audio: $('#audio'),
  timer: $('#timer'),
  playBtn: $('#playBtn'),
  playLabel: $('#playLabel'),
  flipBtn: $('#flipBtn'),
  nextBtn: $('#nextBtn'),
  cardPlay: $('#cardPlay'),
  frontSub: $('#frontSub'),
  frontNumber: $('#frontNumber'),
  backYear: $('#backYear'),
  backTitle: $('#backTitle'),
  backArtist: $('#backArtist'),
  backCats: $('#backCats'),
  backGroupIcon: $('#backGroupIcon'),
  backGroupTag: $('#backGroupTag'),
  modeSwitch: $('#modeSwitch'),
  extensionBar: $('#extensionBar'),
  versionPanel: $('#versionPanel'),
  versionChips: $('#versionChips'),
  versionCount: $('#versionCount'),
  versionHint: $('#versionHint'),
  versionScanBtn: $('#versionScanBtn'),
  scanBtn: $('#scanBtn'),
  yearHint: $('#yearHint'),
  printBtn: $('#printBtn'),
  printModal: $('#printModal'),
  printCount: $('#printCount'),
  printSides: $('#printSides'),
  printStyle: $('#printStyle'),
  databaseLink: $('#databaseLink'),
  printFilter: $('#printFilter'),
  printGo: $('#printGo'),
  printRoot: $('#printRoot'),
  scanModal: $('#scanModal'),
  scanVideo: $('#scanVideo'),
  scanCanvas: $('#scanCanvas'),
  scanStage: $('#scanStage'),
  scanCameraState: $('#scanCameraState'),
  scanStatus: $('#scanStatus'),
  scanRetry: $('#scanRetry'),
  footerCount: $('#footerCount'),
  decadeChips: $('#decadeChips'),
  decadeCount: $('#decadeCount'),
  genreChips: $('#genreChips'),
  genreCount: $('#genreCount'),
  genreReset: $('#genreReset'),
  playlistBar: $('#playlistBar'),
  playlistUrl: $('#playlistUrl'),
  playlistLoad: $('#playlistLoad'),
  playlistClear: $('#playlistClear'),
  playlistStatus: $('#playlistStatus'),
  categoriesPanel: $('#categoriesPanel'),
  customCategories: $('#customCategories'),
  categoryCount: $('#categoryCount'),
  saveCategory: $('#saveCategory'),
  deckSelect: $('#deckSelect'),
  scanFile: $('#scanFile'),
  installBtn: $('#installBtn'),
  mediaPlayer: $('#mediaPlayer'),
  mpArt: $('#mpArt'),
  mpVinyl: $('#mpVinyl'),
  mpKicker: $('#mpKicker'),
  mpTitle: $('#mpTitle'),
  mpArtist: $('#mpArtist'),
  mpBar: $('#mpBar'),
  mpTime: $('#mpTime'),
  mpDuration: $('#mpDuration'),
  mpPlay: $('#mpPlay'),
  mpRestart: $('#mpRestart'),
  mpClose: $('#mpClose'),
  mpEq: $('#mpEq'),
  oneHitToggle: $('#oneHitToggle'),
  spotifyToggle: $('#spotifyToggle'),
  resetFilters: $('#resetFilters'),
  filterSummary: $('#filterSummary'),
  catalogPill: $('#catalogPill'),
  startScreen: $('#startScreen'),
  startBtn: $('#startBtn'),
  fullscreenBtn: $('#fullscreenBtn'),
  gameLayout: $('#gameLayout'),
  statPlayed: $('#statPlayed'),
  statCorrect: $('#statCorrect'),
  statRate: $('#statRate'),
  statStreak: $('#statStreak'),
  resetStats: $('#resetStats'),
  roundNew: $('#roundNew'),
  volume: $('#volume'),
  volumeValue: $('#volumeValue'),
  soundToggle: $('#soundToggle'),
  helpBtn: $('#helpBtn'),
  helpModal: $('#helpModal'),
  spotifyModal: $('#spotifyModal'),
  spotifyBtn: $('#spotifyBtn'),
  spotifySong: $('#spotifySong'),
  spotifyFrame: $('#spotifyFrame'),
  spotifyOpen: $('#spotifyOpen'),
  judgeRight: $('#judgeRight'),
  judgeWrong: $('#judgeWrong'),
  toast: $('#toast'),
  analyticsSummary: $('#analyticsSummary'),
  analyticsExport: $('#analyticsExport'),
  analyticsClear: $('#analyticsClear'),
};

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

function decadeLabel(year) {
  return `${Math.floor(year / 10) * 10}er`;
}

function genreLabel(genre) {
  return GENRES[genre]?.label || genre;
}

function genreColor(genre) {
  return GENRES[genre]?.color || '#ff2d95';
}

function normText(value = '') {
  return String(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function activeSongs() {
  return state.mode === 'playlist' ? (state.playlist?.songs || []) : state.songs;
}

function songGenres(song) {
  const list = Array.isArray(song?.genres) && song.genres.length ? song.genres : [song?.genre];
  return [...new Set(list.filter(Boolean))];
}

function decadeKey(year) {
  return `${Math.floor(year / 10) * 10}s`;
}

function matchesFilters(song, { ignoreGenres = false, ignoreDecade = false } = {}) {
  const f = state.filters;
  if (!ignoreGenres && f.genres.length && !songGenres(song).some((g) => f.genres.includes(g))) return false;
  if (!ignoreDecade && f.decade !== 'all' && decadeKey(song.year) !== f.decade) return false;
  if (f.oneHit && !song.tags?.includes('onehit')) return false;
  if (f.spotifyOnly && !song.spotifyId) return false;
  return true;
}

function versionMatches(song, versionId = state.version) {
  const version = VERSIONS[versionId];
  if (!version || versionId === 'all') return true;
  if (version.genres?.length && !songGenres(song).some((genre) => version.genres.includes(genre))) return false;
  if (version.decades?.length && !version.decades.includes(decadeKey(song.year))) return false;
  if (version.tags?.length && !version.tags.some((tag) => song.tags?.includes(tag))) return false;
  return true;
}

function fameScore(song) {
  const popularity = Number(song?.popularity) || 0;
  const chart = song?.tags?.includes('chart') ? 5_000_000 : 0;
  const spotify = song?.spotifyId ? 50_000 : 0;
  return chart + popularity + spotify;
}

function versionYearPool(versionId, year) {
  const playable = (song) => song.previewUrl || song.itunesId || song.deezerId || song.spotifyId || song.streamUrl;
  const base = (state.songs || []).filter((song) => song.year === year
    && playable(song)
    && matchesFilters(song, { ignoreDecade: true })
    && (versionId === 'all' || versionMatches(song, versionId)));
  if (base.length >= 10 || versionId === 'all') return base;
  const seen = new Set(base.map((song) => song.id));
  const fallback = (state.songs || [])
    .filter((song) => song.year === year && playable(song) && !seen.has(song.id) && matchesFilters(song, { ignoreDecade: true }))
    .sort((a, b) => fameScore(b) - fameScore(a));
  return [...base, ...fallback.slice(0, 10 - base.length)];
}

function matches(song, options = {}) {
  return matchesFilters(song, options) && (state.mode !== 'versions' || versionMatches(song));
}

function currentPool() {
  return activeSongs().filter((s) => matches(s));
}

function pickSong() {
  let pool = state.extensionYear
    ? activeSongs().filter((s) => s.year === state.extensionYear)
    : currentPool();
  pool = pool.filter((s) => !state.roundSeen.has(s.id));
  if (!pool.length) return null;
  const fresh = pool.filter((s) => !state.recent.includes(s.id));
  const list = fresh.length ? fresh : pool;
  const song = list[Math.floor(Math.random() * list.length)];
  state.recent.push(song.id);
  if (state.recent.length > 80) state.recent.shift();
  return song;
}

function sameSong(a, b) {
  if (!a || !b) return false;
  if (a.spotifyId && b.spotifyId && a.spotifyId === b.spotifyId) return true;
  return normText(a.title) === normText(b.title) && normText(a.artist) === normText(b.artist);
}

function pickYearSong(year, { exclude = [] } = {}) {
  const pool = yearPool(year).filter((song) => !exclude.some((other) => sameSong(song, other)));
  if (!pool.length) return null;
  const unseen = pool.filter((song) => !state.roundSeen.has(song.id));
  const fresh = unseen.filter((song) => !state.recent.includes(song.id));
  const playable = (fresh.length ? fresh : unseen.length ? unseen : pool).filter((song) => song.previewUrl || song.itunesId || song.deezerId || song.spotifyId || song.streamUrl);
  const list = playable.length ? playable : (fresh.length ? fresh : unseen.length ? unseen : pool);
  return list[Math.floor(Math.random() * list.length)];
}

function showToast(message, duration = 2600) {
  el.toast.textContent = message;
  el.toast.classList.add('show');
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => el.toast.classList.remove('show'), duration);
}

/* --------------------------------------------------------------------------
   Persistence
   -------------------------------------------------------------------------- */

function loadStats() {
  try {
    const raw = JSON.parse(localStorage.getItem(STATS_KEY) || 'null');
    if (raw && typeof raw === 'object') state.stats = { ...state.stats, ...raw };
  } catch { /* ignore */ }
}

function saveStats() {
  try { localStorage.setItem(STATS_KEY, JSON.stringify(state.stats)); } catch { /* ignore */ }
}

function loadPrefs() {
  try {
    const raw = JSON.parse(localStorage.getItem(PREFS_KEY) || 'null');
    if (raw && typeof raw === 'object') state.prefs = { ...state.prefs, ...raw };
  } catch { /* ignore */ }
}

function savePrefs() {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(state.prefs)); } catch { /* ignore */ }
}

function loadRound() {
  try {
    const raw = JSON.parse(localStorage.getItem(ROUND_KEY) || 'null');
    if (Array.isArray(raw)) state.roundSeen = new Set(raw.filter((id) => /^[sp]\d{1,6}$/.test(id)));
  } catch { /* ignore */ }
}

function saveRound() {
  try { localStorage.setItem(ROUND_KEY, JSON.stringify([...state.roundSeen])); } catch { /* ignore */ }
}

function emptyAnalytics() {
  return {
    version: 1,
    since: new Date().toISOString(),
    updated: null,
    events: {},
    versions: {},
    genres: {},
    modes: {},
    decades: {},
    years: {},
    scans: { success: 0, fail: 0 },
    plays: 0,
    flips: 0,
    correct: 0,
    wrong: 0,
  };
}

function loadAnalytics() {
  try {
    const raw = JSON.parse(localStorage.getItem(ANALYTICS_KEY) || 'null');
    state.analytics = { ...emptyAnalytics(), ...(raw && typeof raw === 'object' ? raw : {}) };
    state.analytics.events ||= {};
    state.analytics.versions ||= {};
    state.analytics.genres ||= {};
    state.analytics.modes ||= {};
    state.analytics.decades ||= {};
    state.analytics.years ||= {};
    state.analytics.scans = { success: 0, fail: 0, ...(state.analytics.scans || {}) };
  } catch {
    state.analytics = emptyAnalytics();
  }
}

function saveAnalytics() {
  if (!state.analytics) return;
  try { localStorage.setItem(ANALYTICS_KEY, JSON.stringify(state.analytics)); } catch { /* ignore */ }
}

function scheduleAnalyticsSave() {
  clearTimeout(state.analyticsTimer);
  state.analyticsTimer = setTimeout(saveAnalytics, 400);
}

function trackEvent(name, data = {}) {
  if (!state.analytics) return;
  const a = state.analytics;
  a.events[name] = (a.events[name] || 0) + 1;
  if (data.version) a.versions[data.version] = (a.versions[data.version] || 0) + 1;
  if (data.genre) a.genres[data.genre] = (a.genres[data.genre] || 0) + 1;
  if (data.mode) a.modes[data.mode] = (a.modes[data.mode] || 0) + 1;
  if (data.decade) a.decades[data.decade] = (a.decades[data.decade] || 0) + 1;
  if (data.year) a.years[data.year] = (a.years[data.year] || 0) + 1;
  if (name === 'scan') a.scans[data.ok ? 'success' : 'fail'] += 1;
  if (name === 'play') a.plays += 1;
  if (name === 'flip') a.flips += 1;
  if (name === 'judge') data.correct ? a.correct += 1 : a.wrong += 1;
  a.updated = new Date().toISOString();
  scheduleAnalyticsSave();
  renderAnalytics();
}

function topEntries(map, limit = 3) {
  return Object.entries(map || {}).sort((a, b) => b[1] - a[1]).slice(0, limit);
}

function renderAnalytics() {
  if (!el.analyticsSummary) return;
  const a = state.analytics;
  if (!a) return;
  const events = Object.values(a.events).reduce((sum, value) => sum + value, 0);
  if (!events) {
    el.analyticsSummary.textContent = 'Noch keine lokalen Daten gesammelt. Spiele ein paar Karten – die Auswertung bleibt in deinem Browser.';
    return;
  }
  const versions = topEntries(a.versions).map(([id, count]) => `${VERSIONS[id]?.label || id} ${count}`).join(' · ') || '–';
  const genres = topEntries(a.genres).map(([id, count]) => `${genreLabel(id)} ${count}`).join(' · ') || '–';
  const modes = topEntries(a.modes).map(([id, count]) => `${id === 'classic' ? 'Freies Spiel' : id === 'versions' ? 'Versionen' : id} ${count}`).join(' · ') || '–';
  const years = topEntries(a.years).map(([id, count]) => `${id} ${count}`).join(' · ') || '–';
  el.analyticsSummary.replaceChildren();
  const lines = [
    `${events} Aktionen · ${a.scans.success} Scans ok · ${a.scans.fail} Fehlversuche`,
    `Versionen: ${versions}`,
    `Genres: ${genres}`,
    `Modi: ${modes}`,
    `Jahre: ${years}`,
  ];
  for (const line of lines) {
    const p = document.createElement('p');
    p.textContent = line;
    el.analyticsSummary.append(p);
  }
}

function exportAnalytics() {
  if (!state.analytics) return;
  saveAnalytics();
  const payload = {
    app: 'HITSTER Web',
    version: VERSION,
    exportedAt: new Date().toISOString(),
    ...state.analytics,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `hitster-nutzung-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast('Nutzungsdaten exportiert – nur lokal.');
}

function clearAnalytics() {
  if (!window.confirm('Lokale Nutzungsdaten wirklich löschen?')) return;
  state.analytics = emptyAnalytics();
  saveAnalytics();
  renderAnalytics();
  showToast('Lokale Nutzungsdaten gelöscht.');
}

/* --------------------------------------------------------------------------
   Rendering – chips
   -------------------------------------------------------------------------- */

function renderVersionChips() {
  if (!el.versionChips) return;
  const base = activeSongs();
  const frag = document.createDocumentFragment();
  for (const [id, version] of Object.entries(VERSIONS)) {
    const count = base.filter((song) => matchesFilters(song) && versionMatches(song, id)).length;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'version-card' + (state.version === id ? ' active' : '');
    btn.dataset.version = id;
    btn.style.setProperty('--v', version.color);
    btn.setAttribute('aria-pressed', state.version === id ? 'true' : 'false');
    btn.title = `${version.label} – ${version.desc} (${count} Karten)`;
    const icon = document.createElement('span');
    icon.className = 'version-icon';
    icon.textContent = version.icon;
    const copy = document.createElement('span');
    copy.className = 'version-copy';
    const label = document.createElement('strong');
    label.textContent = version.label;
    const desc = document.createElement('small');
    desc.textContent = version.desc;
    copy.append(label, desc);
    const n = document.createElement('span');
    n.className = 'version-n';
    n.textContent = count;
    btn.append(icon, copy, n);
    btn.addEventListener('click', () => setVersion(id));
    frag.append(btn);
  }
  el.versionChips.replaceChildren(frag);
  if (el.versionCount) el.versionCount.textContent = String(Object.keys(VERSIONS).length);
  if (el.versionHint) {
    const current = VERSIONS[state.version] || VERSIONS.all;
    const count = currentPool().length;
    el.versionHint.textContent = `${current.desc} · ${count} Karten in dieser Auswahl.`;
  }
}

function renderGenreChips() {
  if (!el.genreChips) return;
  const base = activeSongs();
  const counts = new Map();
  for (const song of base) {
    if (!matches(song, { ignoreGenres: true })) continue;
    for (const genre of songGenres(song)) counts.set(genre, (counts.get(genre) || 0) + 1);
  }
  const frag = document.createDocumentFragment();
  const all = document.createElement('button');
  all.type = 'button';
  all.className = 'chip' + (state.filters.genres.length ? '' : ' active');
  all.style.setProperty('--c', '#ff2d95');
  all.setAttribute('aria-pressed', state.filters.genres.length ? 'false' : 'true');
  all.textContent = 'Alle';
  all.addEventListener('click', () => clearGenres());
  frag.append(all);
  const order = Object.keys(GENRES).filter((g) => g !== 'all' && counts.get(g));
  order.sort((a, b) => counts.get(b) - counts.get(a) || genreLabel(a).localeCompare(genreLabel(b), 'de'));
  for (const genre of order) {
    const count = counts.get(genre);
    const active = state.filters.genres.includes(genre);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip' + (active ? ' active' : '');
    btn.dataset.genre = genre;
    btn.style.setProperty('--c', genreColor(genre));
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    btn.title = `${genreLabel(genre)} – ${count} Karten`;
    const dot = document.createElement('span');
    dot.className = 'dot';
    const label = document.createElement('span');
    label.textContent = genreLabel(genre);
    const n = document.createElement('span');
    n.className = 'n';
    n.textContent = count;
    btn.append(dot, label, n);
    btn.addEventListener('click', () => toggleGenre(genre));
    frag.append(btn);
  }
  el.genreChips.replaceChildren(frag);
  if (el.genreCount) el.genreCount.textContent = state.filters.genres.length ? `${state.filters.genres.length} gewählt` : 'Alle';
}

function renderDecadeChips() {
  const frag = document.createDocumentFragment();
  const base = activeSongs();
  const decades = [...new Set(base.map((s) => `${Math.floor(s.year / 10) * 10}s`))].sort();
  const all = document.createElement('button');
  all.type = 'button';
  all.className = 'chip' + (state.filters.decade === 'all' ? ' active' : '');
  all.dataset.decade = 'all';
  all.style.setProperty('--c', '#ff2d95');
  all.textContent = 'Alle';
  all.addEventListener('click', () => selectDecade('all'));
  frag.append(all);
  for (const d of decades) {
    const count = base.filter((s) => `${Math.floor(s.year / 10) * 10}s` === d && matches(s, { ignoreDecade: true })).length;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip' + (state.filters.decade === d ? ' active' : '');
    btn.dataset.decade = d;
    btn.style.setProperty('--c', '#29e6ff');
    btn.setAttribute('aria-pressed', state.filters.decade === d ? 'true' : 'false');
    btn.title = `${d} – ${count} Karten`;
    const label = document.createElement('span');
    label.textContent = d;
    const c = document.createElement('span');
    c.className = 'n';
    c.textContent = count;
    btn.append(label, c);
    btn.addEventListener('click', () => selectDecade(d));
    frag.append(btn);
  }
  el.decadeChips.replaceChildren(frag);
  el.decadeCount.textContent = `${currentPool().length}`;
}

function updateFilterSummary() {
  const parts = [];
  if (state.mode === 'playlist') parts.push(state.playlist?.name ? `Playlist: ${state.playlist.name}` : 'Playlist');
  if (state.mode === 'versions') parts.push(VERSIONS[state.version]?.label || 'Versionen');
  if (state.filters.genres.length) parts.push(state.filters.genres.map(genreLabel).join(', '));
  if (state.filters.decade !== 'all') parts.push(state.filters.decade);
  if (state.mode === 'extension') parts.push('Karte gescannt');
  if (state.filters.oneHit) parts.push('One-Hit-Wonder');
  if (state.filters.spotifyOnly) parts.push('mit Spotify');
  const count = currentPool().length;
  el.filterSummary.textContent = `${parts.length ? parts.join(' · ') : 'Alle Karten'} · ${count}`;
}

function toggleGenre(genre) {
  const before = [...state.filters.genres];
  const set = new Set(before);
  if (set.has(genre)) set.delete(genre); else set.add(genre);
  state.filters.genres = [...set];
  if (!before.includes(genre)) trackEvent('genre', { genre });
  if (!activeSongs().some((song) => matches(song))) {
    state.filters.genres = before;
    renderGenreChips();
    return showToast('Keine Karten mit dieser Kombination.');
  }
  if (state.mode === 'extension') {
    state.extensionYear = null;
    state.blindYear = false;
    setMode('classic', { silent: true, reload: false });
  }
  afterFilterChange();
}

function clearGenres() {
  if (!state.filters.genres.length) return;
  state.filters.genres = [];
  if (state.mode === 'extension') {
    state.extensionYear = null;
    state.blindYear = false;
    setMode('classic', { silent: true, reload: false });
  }
  afterFilterChange();
}

function setVersion(id) {
  if (!VERSIONS[id]) return;
  const previous = state.version;
  state.version = id;
  state.mode = 'versions';
  state.extensionYear = null;
  state.blindYear = false;
  if (!activeSongs().some((song) => matchesFilters(song) && versionMatches(song, id))) {
    state.version = previous;
    renderVersionChips();
    showToast('Keine Karten in dieser Version mit den aktuellen Filtern.');
    return;
  }
  setMode('versions', { silent: true, reload: false });
  afterFilterChange();
  trackEvent('version', { version: id });
  showToast(`Version: ${VERSIONS[id].label}`, 2600);
}

function selectDecade(decade) {
  const before = state.filters.decade;
  state.filters.decade = decade;
  if (decade !== 'all') trackEvent('decade', { decade });
  if (!activeSongs().some((s) => matches(s))) {
    state.filters.decade = before;
    return showToast('Keine Karten mit dieser Kombination.');
  }
  if (state.mode === 'extension') {
    state.extensionYear = null;
    state.blindYear = false;
    setMode('classic', { silent: true, reload: false });
  }
  afterFilterChange();
}

function afterFilterChange() {
  renderGenreChips();
  renderDecadeChips();
  renderVersionChips();
  updateFilterSummary();
  syncUrl();
  const song = pickSong();
  if (song) loadCard(song);
  else showToast('Keine neuen Karten – starte eine neue Runde.');
  if (window.matchMedia('(max-width: 1080px)').matches) {
    const rect = el.cardWrap.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > window.innerHeight) {
      el.cardWrap.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }
}

function syncUrl() {
  const params = new URLSearchParams();
  const incoming = new URLSearchParams(location.search);
  if (incoming.get('online')) params.set('online', incoming.get('online'));
  if (incoming.get('localonline') === '1') params.set('localonline', '1');
  if (incoming.get('start') === '1' && !document.body.classList.contains('started')) params.set('start', '1');
  if (state.filters.genres.length) params.set('genre', state.filters.genres.join(','));
  if (state.filters.decade !== 'all') params.set('decade', state.filters.decade);
  if (state.filters.oneHit) params.set('onehit', '1');
  if (state.filters.spotifyOnly) params.set('spotify', '1');
  if (state.mode !== 'classic') params.set('mode', state.mode);
  if (state.mode === 'versions' && state.version !== 'all') params.set('version', state.version);
  if (state.mode === 'playlist' && state.playlist?.id) params.set('playlist', state.playlist.id);
  const qs = params.toString();
  history.replaceState(null, '', qs ? `?${qs}` : location.pathname);
}

function readUrl() {
  const p = new URLSearchParams(location.search);
  state.filters.genres = [];
  state.filters.decade = 'all';
  state.filters.oneHit = false;
  state.filters.spotifyOnly = false;
  state.mode = 'classic';
  state.version = 'all';
  state.extensionYear = null;
  state.blindYear = false;
  state.returnMode = null;
  state.scanVersion = null;
  state.transitioning = false;
  state.initialCard = null;
  state.initialPlaylist = null;
  state.initialHitster = null;
  const genreParam = p.get('genre') || p.get('genres') || '';
  state.filters.genres = genreParam.split(',').map((g) => g.trim()).filter((g) => GENRES[g] && g !== 'all');
  const decade = p.get('decade');
  if (decade && /^\d{4}s$/.test(decade)) state.filters.decade = decade;
  state.filters.oneHit = p.get('onehit') === '1';
  state.filters.spotifyOnly = p.get('spotify') === '1';
  const mode = p.get('mode');
  if (['classic', 'versions', 'extension', 'playlist'].includes(mode)) state.mode = mode;
  const version = p.get('version');
  if (version && VERSIONS[version]) {
    state.version = version;
    state.mode = 'versions';
  }
  const year = Number(p.get('year'));
  if (year >= 1950 && year <= 2030) {
    state.mode = 'extension';
    state.extensionYear = year;
    state.blindYear = true;
  }
  const card = p.get('card');
  if (card && /^s\d{4}$/.test(card)) state.initialCard = card;
  const hitster = p.get('hitster');
  if (hitster && /^[a-z]{2}\/(?:[a-z][a-z0-9]{3,}\/)?\d{1,5}$/i.test(hitster)) {
    const [region, skuOrCard, maybeCard] = hitster.toLowerCase().split('/');
    state.initialHitster = {
      region,
      sku: maybeCard ? skuOrCard : null,
      card: (maybeCard || skuOrCard).padStart(5, '0'),
    };
  }
  const playlist = p.get('playlist');
  if (playlist && /^[A-Za-z0-9]{22}$/.test(playlist)) {
    state.initialPlaylist = playlist;
    state.mode = 'playlist';
  }
  // Official Hitster links can be opened directly by a phone camera.
  if (!state.initialHitster) {
    const pathHit = location.pathname.match(/\/([a-z]{2})(?:-[a-z]{2})?\/(?:([a-z][a-z0-9]{3,})\/)?(\d{1,5})\/?$/i);
    if (pathHit) {
      state.initialHitster = {
        region: pathHit[1].toLowerCase(),
        sku: pathHit[2] ? pathHit[2].toLowerCase() : null,
        card: pathHit[3].padStart(5, '0'),
      };
    }
  }
}

/* --------------------------------------------------------------------------
   Rendering – card
   -------------------------------------------------------------------------- */

function songCategories(song) {
  const categories = [genreLabel(song.genre)];
  if (song.tags?.includes('onehit')) categories.push('One-Hit-Wonder');
  if (song.tags?.includes('movie')) categories.push('Film & Musical');
  for (const [id, version] of Object.entries(VERSIONS)) {
    if (id !== 'all' && versionMatches(song, id)) categories.push(version.label);
  }
  return [...new Set(categories.filter(Boolean))];
}

function renderCardCategories(song) {
  if (!el.backCats) return;
  const categories = songCategories(song);
  el.backCats.innerHTML = categories.map((label) => `<span>${escapeHtml(label)}</span>`).join('');
  el.backCats.title = categories.join(' · ');
}

function renderGroupIcon(song) {
  const icon = song.group ? '#i-users' : '#i-user';
  const label = song.group ? 'Gruppe' : 'Solo';
  const node = el.backGroupIcon;
  if (!node) return;
  node.querySelector('use').setAttribute('href', icon);
  const tag = el.backGroupTag;
  if (tag) {
    tag.setAttribute('aria-label', label);
    tag.setAttribute('title', label);
    tag.dataset.group = song.group ? 'group' : 'solo';
  }
}


function yearPool(year) {
  const versionId = state.mode === 'versions'
    ? state.version
    : (state.mode === 'extension' ? state.scanVersion : null);
  if (versionId && versionId !== 'all') {
    return versionYearPool(versionId, year).filter((s) => s.year === year);
  }
  return activeSongs().filter((s) => s.year === year && (state.mode === 'extension' || matches(s, { ignoreDecade: true })));
}

function updateYearHint() {
  if (!state.extensionYear) {
    el.yearHint.textContent = 'Scanne eine echte Hitster-Karte – das Jahr bleibt verborgen und wir ziehen ein anderes Lied aus demselben Jahr.';
    return;
  }
  const pool = yearPool(state.extensionYear);
  const unseen = pool.filter((s) => !state.roundSeen.has(s.id)).length;
  if (!pool.length) {
    el.yearHint.textContent = 'Keine Lieder für diese Filter – andere Filter oder neue Runde.';
  } else if (!unseen) {
    el.yearHint.textContent = 'Alle Lieder dieser Runde gespielt – starte eine neue Runde.';
  } else {
    el.yearHint.textContent = `Noch ${unseen} Lieder in dieser Runde.`;
  }
}

function updatePlaylistStatus() {
  if (!state.playlist) {
    el.playlistStatus.textContent = 'Playlist-Link einfügen – gespielt werden nur Lieder aus dieser Playlist.';
    if (el.saveCategory) el.saveCategory.disabled = true;
    return;
  }
  el.playlistStatus.textContent = `${state.playlist.name} · ${state.playlist.songs.length} Lieder`;
  if (el.saveCategory) el.saveCategory.disabled = false;
}

function loadCategories() {
  try {
    const raw = JSON.parse(localStorage.getItem(CATEGORIES_KEY) || '[]');
    state.categories = Array.isArray(raw) ? raw.filter((c) => c && c.id && Array.isArray(c.songs)) : [];
  } catch {
    state.categories = [];
  }
  renderCategories();
}

function saveCategories() {
  try { localStorage.setItem(CATEGORIES_KEY, JSON.stringify(state.categories)); } catch { /* ignore */ }
}

function renderCategories() {
  if (!el.customCategories) return;
  if (el.categoriesPanel) el.categoriesPanel.hidden = !state.categories.length && !state.playlist;
  if (el.categoryCount) el.categoryCount.textContent = String(state.categories.length);
  if (!state.categories.length) {
    const empty = document.createElement('p');
    empty.className = 'category-empty';
    empty.textContent = 'Noch keine eigene Kategorie. Playlist laden und unten speichern.';
    el.customCategories.replaceChildren(empty);
    if (el.saveCategory) el.saveCategory.disabled = !state.playlist;
    return;
  }
  const frag = document.createDocumentFragment();
  for (const category of state.categories) {
    const row = document.createElement('div');
    row.className = 'category-row' + (state.playlist?.id === category.id ? ' active' : '');
    const main = document.createElement('button');
    main.type = 'button';
    main.className = 'category-main';
    main.dataset.categoryId = category.id;
    main.setAttribute('aria-label', `${category.name} laden`);
    const name = document.createElement('span');
    name.className = 'category-name';
    name.textContent = category.name;
    const meta = document.createElement('span');
    meta.className = 'category-meta';
    meta.textContent = `${category.songs.length} Lieder`;
    main.append(name, meta);
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'category-remove';
    remove.dataset.removeCategory = category.id;
    remove.setAttribute('aria-label', `${category.name} löschen`);
    remove.title = 'Kategorie löschen';
    remove.textContent = '×';
    row.append(main, remove);
    frag.append(row);
  }
  el.customCategories.replaceChildren(frag);
  if (el.saveCategory) el.saveCategory.disabled = !state.playlist;
}

function saveCurrentCategory({ silent = false } = {}) {
  if (!state.playlist?.songs?.length) {
    showToast('Lade zuerst eine Playlist.');
    return false;
  }
  const category = {
    id: state.playlist.id,
    name: state.playlist.name || 'Meine Playlist',
    cover: state.playlist.cover || null,
    count: state.playlist.count || state.playlist.songs.length,
    songs: state.playlist.songs,
    savedAt: new Date().toISOString(),
  };
  state.categories = [category, ...state.categories.filter((c) => c.id !== category.id)];
  saveCategories();
  renderCategories();
  if (!silent) showToast(`Kategorie gespeichert: ${category.name}`, 3200);
  return true;
}

function activateCategory(id) {
  const category = state.categories.find((c) => c.id === id);
  if (!category) return false;
  state.playlist = category;
  state.roundSeen = new Set([...state.roundSeen].filter((sid) => !sid.startsWith('p')));
  state.filters = { genres: [], decade: 'all', oneHit: false, spotifyOnly: false };
  if (el.oneHitToggle) el.oneHitToggle.checked = false;
  if (el.spotifyToggle) el.spotifyToggle.checked = false;
  state.mode = 'playlist';
  setMode('playlist', { silent: true, reload: false });
  updatePlaylistStatus();
  renderCategories();
  const song = pickSong();
  if (song) {
    loadCard(song);
    state.stats.played += 1;
    saveStats();
    renderStats();
  }
  syncUrl();
  showToast(`Kategorie: ${category.name}`, 2800);
  return true;
}

function removeCategory(id) {
  const category = state.categories.find((c) => c.id === id);
  state.categories = state.categories.filter((c) => c.id !== id);
  saveCategories();
  if (state.playlist?.id === id) {
    state.playlist = null;
    state.mode = 'classic';
    setMode('classic', { silent: true, reload: false });
    const song = pickSong();
    if (song) loadCard(song);
    updatePlaylistStatus();
  }
  renderCategories();
  showToast(category ? `Kategorie gelöscht: ${category.name}` : 'Kategorie gelöscht.');
}

function setMode(mode, { silent = false, reload = true, preserveYear = false } = {}) {
  if (!['classic', 'versions', 'extension', 'playlist'].includes(mode)) return;
  if (mode !== 'extension') state.scanVersion = null;
  state.mode = mode;
  document.body.classList.remove('mode-classic', 'mode-versions', 'mode-extension', 'mode-playlist');
  document.body.classList.add(`mode-${mode}`);
  const tabMode = mode === 'extension' ? 'classic' : mode;
  for (const btn of $$('.mode-btn', el.modeSwitch)) {
    const active = btn.dataset.mode === tabMode;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', active ? 'true' : 'false');
  }
  el.extensionBar.hidden = mode !== 'extension';
  if (el.versionPanel) el.versionPanel.hidden = mode !== 'versions';
  el.playlistBar.hidden = mode !== 'playlist';
  if (mode === 'extension') {
    if (!preserveYear) {
      state.extensionYear = null;
      state.blindYear = false;
    }
    state.blindYear = true;
    updateYearHint();
    if (state.filters.decade !== 'all') {
      state.filters.decade = 'all';
      renderDecadeChips();
    }
    if (!silent) showToast('Karte gescannt – anderes Lied aus demselben Jahr.');
  } else if (mode === 'playlist') {
    state.extensionYear = null;
    state.blindYear = false;
    updatePlaylistStatus();
    if (!silent) trackEvent('mode', { mode: 'playlist' });
    if (!silent) showToast('Playlist-Modus');
  } else if (mode === 'versions') {
    state.extensionYear = null;
    state.blindYear = false;
    if (!silent) trackEvent('mode', { mode: 'versions' });
    if (!silent) showToast('Versionen – wähle eine Auswahl.');
  } else {
    state.extensionYear = null;
    state.blindYear = false;
    el.yearHint.textContent = 'Scanne eine echte Hitster-Karte – das Jahr bleibt verborgen und wir ziehen ein anderes Lied aus derselben Zeit.';
    if (!silent) trackEvent('mode', { mode: 'classic' });
    if (!silent) showToast('Freies Spiel');
  }
  if (reload) {
    if (mode === 'playlist' && state.playlist) {
      const song = pickSong();
      if (song) loadCard(song);
    } else if (mode === 'versions') {
      const song = state.current && matches(state.current) ? state.current : pickSong();
      if (song) loadCard(song);
    } else if (state.current) {
      loadCard(state.current);
    }
  }
  renderGenreChips();
  renderDecadeChips();
  renderVersionChips();
  updateFilterSummary();
  syncUrl();
}

function applyYear(year, { silent = false } = {}) {
  year = Number(year);
  if (!Number.isInteger(year) || year < 1950 || year > 2030) {
    showToast('Bitte ein Jahr zwischen 1950 und 2030 eingeben.');
    return false;
  }
  state.extensionYear = year;
  state.blindYear = true;
  state.returnMode = null;
  state.scanVersion = state.mode === 'versions' ? state.version : null;
  setMode('extension', { silent: true, reload: false, preserveYear: true });
  const pool = yearPool(year);
  if (!pool.length) {
    showToast('Keine Lieder für diese Filter. Bitte Filter ändern.');
    updateYearHint();
    syncUrl();
    return false;
  }
  const unseen = pool.filter((s) => !state.roundSeen.has(s.id));
  if (!unseen.length) {
    showToast('Alle Lieder dieser Runde gespielt. Starte eine neue Runde.', 3800);
    updateYearHint();
    syncUrl();
    return false;
  }
  const fresh = unseen.filter((s) => !state.recent.includes(s.id));
  const list = fresh.length ? fresh : unseen;
  const song = list[Math.floor(Math.random() * list.length)];
  state.recent.push(song.id);
  if (state.recent.length > 80) state.recent.shift();
  loadCard(song);
  state.stats.played += 1;
  saveStats();
  renderStats();
  updateYearHint();
  syncUrl();
  if (!silent) showToast(`Noch ${unseen.length} Lieder in dieser Runde.`);
  return true;
}

function randomYear() {
  const years = [...new Set(activeSongs()
    .filter((s) => matches(s, { ignoreDecade: true }) && !state.roundSeen.has(s.id))
    .map((s) => s.year))];
  if (!years.length) return showToast('Keine neuen Lieder für diese Filter. Starte eine neue Runde.');
  applyYear(years[Math.floor(Math.random() * years.length)]);
}

async function loadCardById(id) {
  let song = state.songs.find((s) => s.id === id);
  if (!song && !STATIC) {
    try {
      const res = await fetch(`/api/song/${id}`, { headers: { accept: 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      song = data.song;
    } catch {
      showToast('Karte nicht gefunden.');
      return false;
    }
  }
  if (!song) {
    showToast('Karte nicht gefunden.');
    return false;
  }
  state.mode = 'classic';
  setMode('classic', { silent: true, reload: false });
  loadCard(song);
  state.stats.played += 1;
  saveStats();
  renderStats();
  return true;
}

function parseScan(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  let t = raw;
  try { t = decodeURIComponent(raw); } catch { /* keep raw */ }

  const hit = t.match(/(?:https?:\/\/)?(?:www\.)?hitstergame\.com\/([a-z]{2})(?:-[a-z]{2})?\/(?:([a-z][a-z0-9]{3,})\/)?(\d{1,5})/i);
  if (hit) return { hitster: { region: hit[1].toLowerCase(), sku: hit[2] ? hit[2].toLowerCase() : null, card: hit[3].padStart(5, '0') } };

  const uri = t.match(/^spotify:track:([A-Za-z0-9]{22})$/i);
  if (uri) return { spotifyId: uri[1] };
  if (/^[A-Za-z0-9]{22}$/.test(t)) return { spotifyId: t };

  try {
    const u = new URL(t);
    const spotify = u.pathname.match(/\/track\/([A-Za-z0-9]{22})/);
    if (spotify && /(^|\.)spotify\.com$/i.test(u.hostname)) return { spotifyId: spotify[1] };
    const card = u.searchParams.get('card');
    if (card && /^s?\d{4}$/.test(card)) return { card: card.startsWith('s') ? card : `s${card}` };
    const year = Number(u.searchParams.get('year'));
    if (year >= 1950 && year <= 2030) return { year };
    const m = u.pathname.match(/\b(s\d{4})\b/);
    if (m) return { card: m[1] };
  } catch { /* not a URL */ }

  const spotify = t.match(/\/track\/([A-Za-z0-9]{22})/);
  if (spotify) return { spotifyId: spotify[1] };
  const card = t.match(/\b(s\d{4})\b/);
  if (card) return { card: card[1] };
  const y = t.match(/\b(19[5-9]\d|20[0-2]\d)\b/);
  if (y) {
    const n = Number(y[1]);
    if (n >= 1950 && n <= 2030) return { year: n };
  }
  return null;
}

function catalogMatch(title, artist = '') {
  const nt = normText(title);
  const na = normText(artist);
  if (!nt) return null;
  return state.songs.find((s) => normText(s.title) === nt && na && normText(s.artist).includes(na))
    || state.songs.find((s) => normText(s.title) === nt && na && na.includes(normText(s.artist)))
    || state.songs.find((s) => normText(s.title) === nt)
    || state.songs.find((s) => nt.length > 4 && normText(s.title).includes(nt))
    || null;
}

async function resolveSpotify(id) {
  const direct = state.songs.find((s) => s.spotifyId === id);
  if (direct) {
    return {
      spotifyId: id,
      year: direct.year,
      title: direct.title,
      artist: direct.artist,
      previewUrl: null,
      artUrl: direct.artUrl || direct.art || null,
      song: direct,
      source: 'catalog',
    };
  }
  if (API_BASE || !STATIC) {
    try {
      const res = await fetch(API(`/api/spotify/track/${encodeURIComponent(id)}`), { headers: { accept: 'application/json' } });
      if (res.ok) {
        const track = await res.json();
        const match = catalogMatch(track.title, track.artist);
        return {
          ...track,
          year: match?.year || track.year || null,
          title: match?.title || track.title || '',
          artist: match?.artist || track.artist || '',
          artUrl: match?.artUrl || track.artUrl || null,
          song: match || null,
          source: match ? 'catalog' : 'spotify',
        };
      }
    } catch { /* fall through to oEmbed */ }
  }
  try {
    const target = encodeURIComponent(`https://open.spotify.com/track/${id}`);
    const res = await fetch(`https://open.spotify.com/oembed?url=${target}`, { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const title = data.title || '';
    const match = catalogMatch(title);
    return match
      ? { spotifyId: id, year: match.year, title: match.title, artist: match.artist, song: match, source: 'catalog' }
      : { spotifyId: id, year: null, title, artist: '', song: null, source: 'spotify' };
  } catch {
    return { spotifyId: id, year: null, title: '', artist: '', song: null, source: 'spotify' };
  }
}

const REGION_LANG = {
  de: 'Germany', at: 'Germany', ch: 'Switzerland', nl: 'Netherlands', be: 'Belgium',
  fr: 'France', es: 'Spain', it: 'Italy', uk: 'United Kingdom', gb: 'United Kingdom',
  us: 'United States of America', ca: 'Canada', au: 'Australia', nz: 'New Zealand',
  se: 'Sweden', no: 'Nordics', dk: 'Nordics', fi: 'Nordics', is: 'Iceland',
  pl: 'Poland', pt: 'Portugal', br: 'Brazil', mx: 'Mexico', ar: 'Argentina',
  cl: 'Chile', pe: 'Peru', il: 'Israel', jp: 'Japan', kr: 'Korea', tw: 'Taiwan',
  hk: 'Hong Kong', hu: 'Hungary', cz: 'Czechia/Slovakia', sk: 'Czechia/Slovakia',
  ro: 'Romania', hr: 'Croatia', gr: 'Greece', lt: 'Baltics', lv: 'Baltics', ee: 'Baltics',
};

async function loadHitsterDb() {
  if (state.hitsterDb) return state.hitsterDb;
  const res = await fetch('hitster-db.json', { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`Hitster DB HTTP ${res.status}`);
  state.hitsterDb = await res.json();
  populateDeckSelect();
  return state.hitsterDb;
}

async function loadHitsterCards() {
  if (state.hitsterCards) return state.hitsterCards;
  const res = await fetch('hitster-cards.json', { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`Hitster cards HTTP ${res.status}`);
  state.hitsterCards = await res.json();
  return state.hitsterCards;
}

function hitsterMeta(sku, card) {
  if (!state.hitsterCards?.cards) return null;
  return state.hitsterCards.cards[`${sku}:${card}`] || null;
}

function populateDeckSelect() {
  if (!el.deckSelect || !state.hitsterDb) return;
  const current = state.prefs.deckSku || 'auto';
  const frag = document.createDocumentFragment();
  const auto = document.createElement('option');
  auto.value = 'auto';
  auto.textContent = 'Automatisch (Original)';
  frag.append(auto);
  for (const set of state.hitsterDb.gamesets) {
    const option = document.createElement('option');
    option.value = set.sku;
    option.textContent = `${set.region} – ${set.name}`;
    frag.append(option);
  }
  el.deckSelect.replaceChildren(frag);
  el.deckSelect.value = [...el.deckSelect.options].some((o) => o.value === current) ? current : 'auto';
}

function resolveHitsterCard(region, card, sku = null) {
  if (!state.hitsterDb) return null;
  const candidates = state.hitsterDb.gamesets.filter((set) => set.cards[card]);
  if (!candidates.length) return null;
  const wantedSku = sku || (state.prefs.deckSku && state.prefs.deckSku !== 'auto' ? state.prefs.deckSku : null);
  const selected = wantedSku
    ? state.hitsterDb.gamesets.find((set) => set.sku.toLowerCase() === String(wantedSku).toLowerCase())
    : null;
  if (selected?.cards[card]) return { ...selected.cards[card], gameset: selected };
  const lang = REGION_LANG[region] || '';
  const regional = candidates.filter((set) => set.region === lang);
  const pool = regional.length ? regional : candidates;
  const set = pool.find((s) => /^Hitster Original$/i.test(s.name))
    || pool.find((s) => /Original/i.test(s.name))
    || pool.find((s) => /Bingo/i.test(s.name))
    || pool[0];
  return { ...set.cards[card], gameset: set, candidates: pool.map((entry) => ({ sku: entry.sku, region: entry.region, name: entry.name })) };
}

function startCardRound(meta, result, label = 'Originalkarte') {
  if (!meta?.year) return false;
  const alternative = pickYearSong(meta.year, {
    exclude: [{ title: meta.title, artist: meta.artist, spotifyId: result?.spotifyId || meta.spotifyId || null }],
  });
  if (!alternative) {
    el.scanStatus.textContent = 'Karte erkannt, aber kein anderes Lied aus diesem Jahr gefunden.';
    showToast('Kein anderes Lied aus diesem Jahr gefunden.');
    return false;
  }
  state.lastScan = { year: meta.year, card: meta.card, sku: meta.sku, title: meta.title, artist: meta.artist };
  const returnMode = state.mode === 'extension' ? 'classic' : state.mode;
  state.scanVersion = state.mode === 'versions' ? state.version : null;
  state.extensionYear = meta.year;
  state.blindYear = true;
  setMode('extension', { silent: true, reload: false, preserveYear: true });
  state.returnMode = returnMode;
  loadCard(alternative);
  state.stats.played += 1;
  saveStats();
  renderStats();
  updateYearHint();
  syncUrl();
  el.scanStatus.textContent = `${label} erkannt – anderes Lied aus demselben Jahr.`;
  showToast('Karte erkannt – anderes Lied aus demselben Jahr.', 3600);
  setTimeout(() => { if (!state.playing) playClip(); }, 650);
  return true;
}

async function startBlindRound(result, label = 'Originalkarte') {
  if (!result?.year) return false;
  if (result.meta) return startCardRound(result.meta, result, label);
  if (result.song?.id) {
    state.roundSeen.add(result.song.id);
    saveRound();
  }
  state.scanVersion = state.mode === 'versions' ? state.version : null;
  state.extensionYear = result.year;
  state.blindYear = true;
  const ok = applyYear(result.year, { silent: true });
  if (!ok) return false;
  el.scanStatus.textContent = `${label} erkannt – anderes Lied aus demselben Jahr.`;
  showToast(`${label} erkannt – anderes Lied aus demselben Jahr.`, 3600);
  setTimeout(() => { if (!state.playing) playClip(); }, 650);
  return true;
}

async function handleHitster(parsed) {
  el.scanStatus.textContent = 'Kartenset wird erkannt …';
  try {
    await loadHitsterDb();
  } catch {
    el.scanStatus.textContent = 'Kartendatenbank konnte nicht geladen werden. Bitte erneut scannen.';
    return false;
  }
  try { await loadHitsterCards(); } catch { /* API can still resolve the exact card */ }
  const mapping = resolveHitsterCard(parsed.region, parsed.card, parsed.sku);
  const meta = hitsterMeta(parsed.sku || mapping?.gameset?.sku, parsed.card);
  if (!mapping) {
    el.scanStatus.textContent = 'Karte nicht im gewählten Set. Bitte anderes Kartenset wählen.';
    return false;
  }
  const count = mapping.candidates?.length || 1;
  const setName = mapping.gameset.name || 'Originalkarte';
  el.scanStatus.textContent = `Kartenset: ${mapping.gameset.region} – ${setName}${count > 1 ? ` · ${count} Sets passen zur Kartennummer` : ''}. Lied wird geladen …`;
  let result = null;
  if (API_BASE || !STATIC) {
    try {
      const skuValue = parsed.sku || (state.prefs.deckSku && state.prefs.deckSku !== 'auto' ? state.prefs.deckSku : '');
      const sku = skuValue ? `?sku=${encodeURIComponent(skuValue)}` : '';
      const res = await fetch(API(`/api/hitster/${parsed.region}/${parsed.card}${sku}`), { headers: { accept: 'application/json' } });
      if (res.ok) {
        const data = await res.json();
        if (data.track?.year) {
          result = {
            ...data.track,
            spotifyId: data.spotifyId,
            song: state.songs.find((song) => song.spotifyId === data.spotifyId) || null,
            source: data.track.songId ? 'catalog' : 'spotify',
          };
        }
      }
    } catch { /* local database + Spotify fallback below */ }
  }
  const known = state.hitsterDb?.tracks?.[mapping[0]];
  if (!result && known?.year) {
    result = {
      ...known,
      spotifyId: mapping[0],
      song: state.songs.find((song) => song.spotifyId === mapping[0]) || null,
      source: 'catalog',
    };
  }
  if (!result) result = await resolveSpotify(mapping[0]);
  if (meta) result = { ...(result || {}), ...meta, meta, spotifyId: result?.spotifyId || meta.spotifyId || mapping[0] };
  if (!result?.year) {
    el.scanStatus.textContent = 'Originalkarte erkannt, aber kein Jahr gefunden. Bitte anderes Kartenset wählen oder erneut scannen.';
    return false;
  }
  return startBlindRound(result, setName);
}

async function handleScan(parsed) {
  const ok = await handleScanInner(parsed);
  if (parsed) trackEvent('scan', { ok, year: state.extensionYear });
  return ok;
}

async function handleScanInner(parsed) {
  if (!parsed) return false;
  if (parsed.hitster) return handleHitster(parsed.hitster);
  if (parsed.card) {
    showToast('Karte geladen.');
    await loadCardById(parsed.card);
    return true;
  }
  if (parsed.year) {
    state.blindYear = true;
    applyYear(parsed.year, { silent: false });
    return true;
  }
  if (parsed.spotifyId) {
    el.scanStatus.textContent = 'Lied wird erkannt …';
    const result = await resolveSpotify(parsed.spotifyId);
    if (result?.year) {
      return startBlindRound(result, 'Lied');
    }
    el.scanStatus.textContent = 'Lied nicht erkannt. Bitte erneut scannen.';
    return false;
  }
  return false;
}

function scanLabel(parsed, raw = '') {
  if (parsed?.hitster) return `Hitster-Karte ${parsed.hitster.card}`;
  if (parsed?.card) return `Karte ${parsed.card}`;
  if (parsed?.spotifyId) return 'Spotify-Lied';
  if (parsed?.year) return `Jahr ${parsed.year}`;
  return 'QR-Code';
}

function setScanStatus(text, state = 'scanning') {
  if (el.scanStatus) el.scanStatus.textContent = text;
  if (el.scanStage) el.scanStage.dataset.state = state;
}

function finishScan(parsed, raw = '') {
  if (!parsed || state.scan.detected) return false;
  state.scan.detected = true;
  stopScan();
  const label = scanLabel(parsed, raw);
  setScanStatus(`${label} erkannt – Lied wird geladen …`, 'detected');
  if (navigator.vibrate) navigator.vibrate(35);
  setTimeout(async () => {
    closeModal(el.scanModal);
    await handleScan(parsed);
  }, 420);
  return true;
}

async function scanImageFile(file) {
  if (!file || !window.jsQR) return false;
  state.scan.detected = false;
  el.scanStage.dataset.camera = 'off';
  setScanStatus('Bild wird nach dem QR-Code durchsucht …');
  try {
    const bitmap = await createImageBitmap(file);
    const maxSide = 1800;
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const baseW = Math.max(1, Math.round(bitmap.width * scale));
    const baseH = Math.max(1, Math.round(bitmap.height * scale));
    const variants = [
      [baseW, baseH],
      [Math.round(baseW * 0.8), Math.round(baseH * 0.8)],
      [Math.round(baseW * 1.25), Math.round(baseH * 1.25)],
    ];
    for (const [w, h] of variants) {
      const canvas = document.createElement('canvas');
      canvas.width = Math.min(2200, w);
      canvas.height = Math.min(2200, h);
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(bitmap, 0, 0, bitmap.width, bitmap.height, 0, 0, canvas.width, canvas.height);
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = window.jsQR(img.data, canvas.width, canvas.height, { inversionAttempts: 'attemptBoth' });
      if (code?.data) {
        const parsed = parseScan(code.data);
        if (parsed) return finishScan(parsed, code.data);
      }
    }
    setScanStatus('Kein lesbarer QR-Code im Bild gefunden. Bitte schärfer fotografieren.', 'error');
  } catch {
    setScanStatus('Bild konnte nicht gelesen werden. Bitte erneut versuchen.', 'error');
  }
  return false;
}

function stopScan() {
  state.scan.active = false;
  if (state.scan.raf) cancelAnimationFrame(state.scan.raf);
  state.scan.raf = null;
  if (state.scan.stream) {
    for (const track of state.scan.stream.getTracks()) track.stop();
    state.scan.stream = null;
  }
  if (el.scanVideo) el.scanVideo.srcObject = null;
  if (el.scanStage) el.scanStage.dataset.camera = 'off';
  if (el.scanCameraState) el.scanCameraState.textContent = 'Kamera';
}

function scanFrame(now = 0) {
  if (!state.scan.active) return;
  const video = el.scanVideo;
  if (video.readyState >= 2 && video.videoWidth && now - state.scan.last >= 90) {
    state.scan.last = now;
    const w = video.videoWidth;
    const h = video.videoHeight;
    const size = Math.min(w, h, 760);
    const sx = (w - size) / 2;
    const sy = (h - size) / 2;
    el.scanCanvas.width = size;
    el.scanCanvas.height = size;
    const ctx = el.scanCanvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(video, sx, sy, size, size, 0, 0, size, size);
    const img = ctx.getImageData(0, 0, size, size);
    const code = window.jsQR ? window.jsQR(img.data, size, size, { inversionAttempts: 'attemptBoth' }) : null;
    if (code?.data) {
      const parsed = parseScan(code.data);
      if (parsed) {
        finishScan(parsed, code.data);
        return;
      }
      setScanStatus('QR-Code erkannt, aber keine gültige Hitster-Karte. Bitte erneut scannen.', 'error');
    }
  }
  state.scan.raf = requestAnimationFrame(scanFrame);
}

async function startScanCamera() {
  if (!window.jsQR) {
    showToast('QR-Scanner konnte nicht geladen werden. Bitte Seite neu laden.');
    return;
  }
  stopScan();
  state.scan.detected = false;
  el.scanStage.dataset.state = 'scanning';
  setScanStatus('Kamera wird gestartet …');
  if (!navigator.mediaDevices?.getUserMedia) {
    setScanStatus('Kamera nicht verfügbar – nutze „Bild scannen“.', 'error');
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 1280 } },
      audio: false,
    });
    if (state.scan.detected) {
      for (const track of stream.getTracks()) track.stop();
      return;
    }
    state.scan.stream = stream;
    el.scanVideo.srcObject = stream;
    await el.scanVideo.play();
    if (state.scan.detected) {
      stopScan();
      return;
    }
    el.scanStage.dataset.camera = 'on';
    if (el.scanCameraState) el.scanCameraState.textContent = 'Kamera aktiv';
    setScanStatus('Richte die Kamera auf den QR-Code deiner Hitster-Karte.');
    state.scan.active = true;
    state.scan.last = 0;
    state.scan.raf = requestAnimationFrame(scanFrame);
  } catch {
    if (!state.scan.detected) setScanStatus('Kamera nicht verfügbar oder Zugriff verweigert. Nutze „Bild scannen“.', 'error');
  }
}

async function openScan() {
  trackEvent('scan_open');
  if (!window.jsQR) {
    showToast('QR-Scanner konnte nicht geladen werden. Bitte Seite neu laden.');
    return;
  }
  state.scan.detected = false;
  el.scanStage.dataset.state = 'idle';
  el.scanStage.dataset.camera = 'off';
  openModal(el.scanModal);
  loadHitsterDb().then(() => {
    populateDeckSelect();
    if (el.deckSelect) el.deckSelect.value = state.prefs.deckSku || 'auto';
  }).catch(() => {});
  await startScanCamera();
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function printGroupIcon(song) {
  return `<svg class="pc-group" aria-hidden="true"><use href="${song.group ? '#i-users' : '#i-user'}"></use></svg>`;
}


function printCardHtml(song, side, style = 'compact') {
  const color = genreColor(song.genre);
  const id = song.id.slice(1);
  const isCatalog = /^s\d+$/.test(song.id);
  const qrSrc = isCatalog ? (STATIC ? `qr/${song.id}.svg` : `/api/qr/${song.id}?base=${encodeURIComponent(location.origin)}`) : null;
  if (side === 'front') {
    return `<div class="print-card ${style === 'compact' ? 'compact' : ''}" style="--c:#8a8a92">
      <div class="pc-band"><span class="pc-kicker">HITSTER</span><span class="pc-band-note">WEB</span></div>
      <div class="pc-qr">${qrSrc ? `<img src="${qrSrc}" alt="QR-Code Karte ${song.id}" />` : '<span class="pc-qr-icon">♪</span>'}<span>${isCatalog ? 'Scan &amp; Play' : 'Spotify'}</span></div>
      <div class="pc-center">
        <div class="pc-vinyl"></div>
        <div class="pc-question">Wie heißt der Song?</div>
        <div class="pc-sub">30-Sekunden-Clip</div>
      </div>
      <div class="pc-foot"><span>Karte #${id}</span><span>Umdrehen</span></div>
    </div>`;
  }
  return `<div class="print-card pc-back ${style === 'compact' ? 'compact' : ''}" style="--c:${color}">
    <div class="pc-band"><span class="pc-kicker">AUFGELÖST</span><span class="pc-band-right">${printGroupIcon(song)}</span></div>
    <div class="pc-center">
      <div class="pc-year-label">Erschienen</div>
      <div class="pc-year">${song.year}</div>
      <div class="pc-title">${escapeHtml(song.title)}</div>
      <div class="pc-artist">${escapeHtml(song.artist)}</div>
      <div class="pc-cats">${songCategories(song).slice(0, 4).map((label) => `<span>${escapeHtml(label)}</span>`).join('')}</div>
    </div>
    <div class="pc-foot"><span>Karte #${id}</span><span>HITSTER</span></div>
  </div>`;
}

function printSheets(cards, side, style = 'compact') {
  const chunks = [];
  for (let i = 0; i < cards.length; i += 9) chunks.push(cards.slice(i, i + 9));
  return chunks
    .map((chunk) => `<section class="print-sheet ${side === 'back' ? 'backs' : 'fronts'} ${style === 'compact' ? 'compact' : ''}">${chunk.join('')}</section>`)
    .join('');
}

function openPrint() {
  el.printFilter.checked = state.filters.decade !== 'all' || state.filters.genres.length || state.filters.oneHit || state.filters.spotifyOnly;
  openModal(el.printModal);
}

async function doPrint() {
  const count = Math.max(1, Math.min(27, Number(el.printCount.value) || 9));
  trackEvent('print');
  const pool = el.printFilter.checked ? currentPool() : activeSongs();
  if (!pool.length) {
    showToast('Keine Karten für diese Filter.');
    return;
  }
  const songs = shuffle(pool).slice(0, count);
  const sides = el.printSides.value;
  const style = el.printStyle?.value || 'compact';
  const fronts = songs.map((s) => printCardHtml(s, 'front', style));
  const backs = songs.map((s) => printCardHtml(s, 'back', style));
  let html = '';
  if (sides === 'both' || sides === 'front') html += printSheets(fronts, 'front', style);
  if (sides === 'both' || sides === 'back') html += printSheets(backs, 'back', style);
  el.printRoot.innerHTML = html;
  closeModal(el.printModal);
  const images = [...el.printRoot.querySelectorAll('img')];
  await Promise.all(images.map((img) => (img.decode ? img.decode().catch(() => {}) : Promise.resolve())));
  window.print();
}

function loadCard(song) {
  state.current = song;
  state.roundSeen.add(song.id);
  saveRound();
  state.flipped = false;
  el.card.dataset.flipped = 'false';
  el.card.dataset.genre = song.genre;
  el.card.classList.remove('is-playing');
  document.body.classList.remove('is-playing');
  setFaceAccessibility(false);

  stopAudio();
  if (song.previewUrl) el.audio.src = song.previewUrl;
  else if (!STATIC && song.streamUrl) el.audio.src = song.streamUrl;
  resetTimer();

  setCardAccent(false);
  el.frontNumber.textContent = `Karte #${song.cardNumber || song.id.slice(1)}`;
  el.frontSub.textContent = state.mode === 'extension'
    ? 'Tippe für den Clip – die Auflösung kommt erst beim Umdrehen.'
    : 'Tippe auf die Karte, um den Clip zu starten.';
  el.backYear.textContent = String(song.year);
  el.backTitle.textContent = song.title;
  el.backArtist.textContent = song.artist;
  renderCardCategories(song);
  renderGroupIcon(song);
  updateFlipButton();
  updatePlayer();

  el.cardWrap.classList.remove('dealing');
  void el.cardWrap.offsetWidth;
  el.cardWrap.classList.add('dealing');

  el.spotifyBtn.disabled = false;
  el.playBtn.disabled = false;
  el.flipBtn.disabled = false;
  if (state.mode === 'extension') updateYearHint();
}

function setCardAccent(active) {
  const color = active && state.current ? genreColor(state.current.genre) : '#8a8a92';
  el.card.style.setProperty('--c', color);
  if (el.mediaPlayer) el.mediaPlayer.style.setProperty('--c', color);
}

function setFaceAccessibility(flipped) {
  el.cardFront.setAttribute('aria-hidden', flipped ? 'true' : 'false');
  el.cardBack.setAttribute('aria-hidden', flipped ? 'false' : 'true');
  if (flipped) {
    el.cardFront.setAttribute('inert', '');
    el.cardBack.removeAttribute('inert');
  } else {
    el.cardBack.setAttribute('inert', '');
    el.cardFront.removeAttribute('inert');
  }
}

function updateFlipButton() {
  el.flipBtn.innerHTML = `<svg><use href="#i-flip"></use></svg> ${state.flipped ? 'Zurück zur Vorderseite' : 'Karte umdrehen'}`;
  el.flipBtn.setAttribute('aria-pressed', state.flipped ? 'true' : 'false');
}

/* --------------------------------------------------------------------------
   Audio & timer
   -------------------------------------------------------------------------- */

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const sec = Math.floor(seconds % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function showPlayer() {
  if (!el.mediaPlayer) return;
  state.playerHidden = false;
  document.body.classList.add('player-open');
  el.mediaPlayer.hidden = false;
  requestAnimationFrame(() => el.mediaPlayer.classList.add('show'));
  updatePlayer();
}

function hidePlayer() {
  if (!el.mediaPlayer) return;
  el.mediaPlayer.classList.remove('show');
  document.body.classList.remove('player-open');
  el.mediaPlayer.hidden = true;
}

function updatePlayer() {
  if (!el.mediaPlayer || !state.current) return;
  const revealed = state.flipped;
  const song = state.current;
  el.mpKicker.textContent = state.mode === 'playlist' && state.playlist ? state.playlist.name
    : state.mode === 'extension' ? 'KARTEN-SCAN' : 'HITSTER CLIP';
  el.mpTitle.textContent = revealed ? song.title : 'Geheimnisvoller Song';
  el.mpArtist.textContent = revealed ? song.artist : 'Hör gut zu und rate mit';
  if (revealed && song.artUrl) {
    el.mpArt.src = song.artUrl;
    el.mpArt.hidden = false;
    el.mpVinyl.hidden = true;
  } else {
    el.mpArt.removeAttribute('src');
    el.mpArt.hidden = true;
    el.mpVinyl.hidden = false;
  }
  el.mpPlay.classList.toggle('is-playing', state.playing);
  el.mpPlay.setAttribute('aria-label', state.playing ? 'Clip pausieren' : 'Clip abspielen');
  el.mpEq.classList.toggle('is-playing', state.playing);
  updatePlayerProgress();
}

function updatePlayerProgress() {
  if (!el.mediaPlayer) return;
  const duration = Number.isFinite(el.audio.duration) && el.audio.duration > 0
    ? el.audio.duration
    : CLIP_SECONDS;
  const current = Number.isFinite(el.audio.currentTime) && el.audio.currentTime > 0
    ? el.audio.currentTime
    : Math.max(0, CLIP_SECONDS - state.timer.remaining);
  const ratio = Math.max(0, Math.min(1, current / duration));
  el.mpBar.style.width = `${(ratio * 100).toFixed(2)}%`;
  el.mpTime.textContent = formatTime(Math.min(current, duration));
  el.mpDuration.textContent = formatTime(duration);
}

function setPlaying(playing) {
  state.playing = playing;
  el.card.classList.toggle('is-playing', playing);
  document.body.classList.toggle('is-playing', playing);
  el.cardPlay.setAttribute('aria-pressed', playing ? 'true' : 'false');
  el.cardPlay.setAttribute('aria-label', playing ? 'Clip pausieren' : 'Clip abspielen');
  el.playLabel.textContent = playing ? 'Pausieren' : 'Clip abspielen';
  if (playing) showPlayer();
  updatePlayer();
}

async function resolveItunesPreview(song) {
  if (itunesCache.has(song.id)) return itunesCache.get(song.id);
  try {
    const url = song.itunesId
      ? `https://itunes.apple.com/lookup?id=${encodeURIComponent(song.itunesId)}&country=DE`
      : `https://itunes.apple.com/search?term=${encodeURIComponent(`${song.title} ${song.artist}`)}&entity=song&limit=10&country=DE`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const items = data.results || [];
    const nt = normText(song.title);
    const na = normText(song.artist);
    const match = items.find((t) => t.previewUrl
      && (normText(t.trackName) === nt || normText(t.trackName).includes(nt))
      && (normText(t.artistName).includes(na) || na.includes(normText(t.artistName))))
      || items.find((t) => t.previewUrl);
    const preview = match?.previewUrl || null;
    if (preview) itunesCache.set(song.id, preview);
    return preview;
  } catch {
    return null;
  }
}

async function playClip({ restart = false } = {}) {
  if (!state.current) return;
  if (state.playing) {
    if (!restart) return pauseClip();
    pauseClip();
  }
  if (restart) {
    try { el.audio.currentTime = 0; } catch { /* ignore */ }
    resetTimer();
  }
  if (!el.audio.getAttribute('src')) {
    el.frontSub.textContent = 'Clip wird geladen …';
    const url = await resolveItunesPreview(state.current);
    if (!url) {
      el.frontSub.textContent = 'Kein Clip gefunden. Nächste Karte?';
      showToast('Kein Clip für diesen Song gefunden.');
      return;
    }
    el.audio.src = url;
    el.frontSub.textContent = state.mode === 'extension'
      ? 'Tippe für den Clip – die Auflösung kommt erst beim Umdrehen.'
      : 'Tippe auf die Karte, um den Clip zu starten.';
  }
  if (state.timer.remaining <= 0.05) resetTimer();
  trackEvent('play');
  const promise = el.audio.play();
  if (promise?.catch) {
    promise
      .then(() => {
        setPlaying(true);
        startTimer();
        el.frontSub.textContent = 'Hör gut zu – umdrehen zeigt die Auflösung.';
      })
      .catch(() => {
        setPlaying(false);
        showToast('Clip konnte nicht geladen werden. Versuche „Nächste Karte“.');
      });
  } else {
    setPlaying(true);
    startTimer();
  }
}

function pauseClip({ keepTimer = false } = {}) {
  try { el.audio.pause(); } catch { /* ignore */ }
  setPlaying(false);
  if (!keepTimer) stopTimer();
}

function stopAudio() {
  try {
    el.audio.pause();
    el.audio.removeAttribute('src');
    el.audio.load();
  } catch { /* ignore */ }
  setPlaying(false);
  stopTimer();
}

function resetTimer() {
  stopTimer();
  state.timer.remaining = CLIP_SECONDS;
  updateTimerUI();
}

function startTimer() {
  stopTimer();
  state.timer.last = performance.now();
  state.timer.id = setInterval(tickTimer, 100);
  updateTimerUI();
}

function stopTimer() {
  if (state.timer.id) {
    clearInterval(state.timer.id);
    state.timer.id = null;
  }
}

function tickTimer() {
  const now = performance.now();
  const dt = (now - state.timer.last) / 1000;
  state.timer.last = now;
  state.timer.remaining = Math.max(0, state.timer.remaining - dt);
  updateTimerUI();
  if (state.timer.remaining <= 0) {
    stopTimer();
    pauseClip({ keepTimer: true });
    el.frontSub.textContent = 'Zeit ist um – jetzt umdrehen!';
  }
}

function updateTimerUI() {
  const remaining = state.timer.remaining;
  const ratio = Math.max(0, Math.min(1, remaining / CLIP_SECONDS));
  el.timer.textContent = String(Math.ceil(remaining));
  el.card.style.setProperty('--progress', ratio.toFixed(4));
  updatePlayerProgress();
}

/* --------------------------------------------------------------------------
   Flip / next
   -------------------------------------------------------------------------- */

function flipCard() {
  if (!state.current || state.transitioning) return;
  state.flipped = !state.flipped;
  el.card.dataset.flipped = state.flipped ? 'true' : 'false';
  setCardAccent(state.flipped);
  if (state.flipped) {
    pauseClip();
    stopTimer();
    state.stats.flipped += 1;
    saveStats();
    renderStats();
    trackEvent('flip');
  }
  setFaceAccessibility(state.flipped);
  updateFlipButton();
  updatePlayer();
  if (state.flipped) {
    // Give the 3D animation a moment, then focus the answer side.
    setTimeout(() => el.cardBack.querySelector('button')?.focus({ preventScroll: true }), 500);
  } else {
    setTimeout(() => el.cardPlay.focus({ preventScroll: true }), 450);
  }
}

function nextCard() {
  if (state.transitioning) return;
  const returnMode = state.returnMode || (state.version !== 'all' ? 'versions' : 'classic');
  if (state.extensionYear || state.mode === 'extension') {
    state.extensionYear = null;
    state.blindYear = false;
    state.returnMode = null;
    setMode(returnMode, { silent: true, reload: false });
  }
  const song = pickSong();
  if (!song) {
    showToast('Runde beendet – starte eine neue Runde.', 3600);
    return;
  }
  const reveal = () => {
    loadCard(song);
    state.stats.played += 1;
    saveStats();
    renderStats();
  };
  if (!state.flipped) {
    reveal();
    return;
  }
  // Turn the old card to its neutral front first. Only then put the next
  // song into the DOM, otherwise the new year is visible during the flip.
  state.flipped = false;
  el.card.dataset.flipped = 'false';
  setCardAccent(false);
  setFaceAccessibility(false);
  updateFlipButton();
  updatePlayer();
  state.transitioning = true;
  const delay = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 30 : 760;
  setTimeout(() => {
    state.transitioning = false;
    reveal();
  }, delay);
}

/* --------------------------------------------------------------------------
   Judging
   -------------------------------------------------------------------------- */

function judge(correct) {
  if (!state.current) return;
  trackEvent('judge', { correct });
  if (correct) {
    state.stats.correct += 1;
    state.stats.streak += 1;
    state.stats.bestStreak = Math.max(state.stats.bestStreak, state.stats.streak);
    showToast(`Richtig! ${state.stats.streak > 1 ? `${state.stats.streak}er-Serie 🔥` : '+1 Punkt 🎉'}`);
    confetti();
  } else {
    state.stats.wrong += 1;
    state.stats.streak = 0;
    showToast('Daneben – weiter geht’s!');
  }
  saveStats();
  renderStats();
}

function renderStats() {
  const judged = state.stats.correct + state.stats.wrong;
  el.statPlayed.textContent = String(state.stats.played);
  el.statCorrect.textContent = String(state.stats.correct);
  el.statRate.textContent = judged ? `${Math.round((state.stats.correct / judged) * 100)}%` : '–';
  el.statStreak.textContent = String(state.stats.streak);
}

function resetRound() {
  state.roundSeen = new Set();
  state.recent = [];
  state.stats = { played: 0, flipped: 0, correct: 0, wrong: 0, streak: 0, bestStreak: 0 };
  saveRound();
  saveStats();
  renderStats();
  const song = pickSong();
  if (song) {
    loadCard(song);
    state.stats.played += 1;
    saveStats();
    renderStats();
    showToast('Neue Runde – viel Spaß!');
  } else {
    showToast('Neue Runde – aber keine Karten für diese Filter.', 3600);
  }
}

/* --------------------------------------------------------------------------
   Playlist
   -------------------------------------------------------------------------- */

const PLAYLIST_CACHE_KEY = 'hitster-web-playlist-cache-v1';

function readPlaylistCache(raw) {
  try {
    const all = JSON.parse(localStorage.getItem(PLAYLIST_CACHE_KEY) || '{}');
    const entry = all[raw];
    if (!entry || Date.now() - entry.savedAt > 7 * 24 * 60 * 60 * 1000) return null;
    return entry.data?.songs?.length ? entry.data : null;
  } catch { return null; }
}

function writePlaylistCache(raw, data) {
  try {
    const all = JSON.parse(localStorage.getItem(PLAYLIST_CACHE_KEY) || '{}');
    all[raw] = { savedAt: Date.now(), data };
    const keys = Object.keys(all).sort((a, b) => all[b].savedAt - all[a].savedAt);
    for (const key of keys.slice(6)) delete all[key];
    localStorage.setItem(PLAYLIST_CACHE_KEY, JSON.stringify(all));
  } catch { /* private mode / quota: cache is optional */ }
}

function applyPlaylist(data, raw, { cached = false } = {}) {
  state.playlist = data;
  state.roundSeen = new Set([...state.roundSeen].filter((id) => !id.startsWith('p')));
  state.filters = { genres: [], decade: 'all', oneHit: false, spotifyOnly: false };
  if (el.oneHitToggle) el.oneHitToggle.checked = false;
  if (el.spotifyToggle) el.spotifyToggle.checked = false;
  state.mode = 'playlist';
  state.blindYear = false;
  setMode('playlist', { silent: true, reload: false });
  renderGenreChips();
  renderDecadeChips();
  updateFilterSummary();
  updatePlaylistStatus();
  renderCategories();
  el.playlistUrl.value = raw;
  const song = pickSong();
  if (song) {
    loadCard(song);
    state.stats.played += 1;
    saveStats();
    renderStats();
  }
  syncUrl();
  if (!cached) saveCurrentCategory({ silent: true });
  trackEvent('playlist');
  el.playlistStatus.textContent = `${data.name || 'Playlist'} · ${data.songs.length} Lieder${cached ? ' · aus dem Cache' : ''}`;
  showToast(cached ? `Playlist sofort aus dem Cache: ${data.name}` : `Playlist geladen: ${data.name}`, 3200);
}

async function loadPlaylist(input) {
  const raw = String(input || '').trim();
  if (!raw) {
    el.playlistStatus.textContent = 'Bitte einen Spotify-Playlist-Link einfügen.';
    return false;
  }
  if (STATIC && !API_BASE) {
    el.playlistStatus.textContent = 'Playlist-Modus braucht die Server-Version. Bitte die Vollversion öffnen.';
    return false;
  }
  const cached = readPlaylistCache(raw);
  if (cached) {
    applyPlaylist(cached, raw, { cached: true });
    return true;
  }
  el.playlistStatus.textContent = 'Playlist wird geladen …';
  try {
    let data = null;
    let lastError = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(API(`/api/playlist?url=${encodeURIComponent(raw)}`), { headers: { accept: 'application/json' } });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
        data = body;
        break;
      } catch (err) {
        lastError = err;
        if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 1200));
      }
    }
    if (!data) throw lastError || new Error('Playlist konnte nicht geladen werden.');
    if (!data.songs?.length) throw new Error('Keine Lieder mit Jahr gefunden.');
    writePlaylistCache(raw, data);
    applyPlaylist(data, raw);
    return true;
  } catch (err) {
    el.playlistStatus.textContent = `Playlist konnte nicht geladen werden: ${err.message}`;
    showToast('Playlist konnte nicht geladen werden.', 4200);
    return false;
  }
}

function clearPlaylist() {
  state.playlist = null;
  el.playlistUrl.value = '';
  state.mode = 'classic';
  setMode('classic', { silent: true, reload: false });
  updatePlaylistStatus();
  renderCategories();
  renderGenreChips();
  renderDecadeChips();
  updateFilterSummary();
  const song = pickSong();
  if (song) loadCard(song);
  syncUrl();
  showToast('Playlist geleert.');
}

/* --------------------------------------------------------------------------
   PWA / install
   -------------------------------------------------------------------------- */

function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
  navigator.serviceWorker.register('sw.js').catch((err) => console.warn('[sw]', err.message));
}

function bindInstall() {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    state.installPrompt = event;
    if (el.installBtn) el.installBtn.hidden = false;
  });
  window.addEventListener('appinstalled', () => {
    state.installPrompt = null;
    if (el.installBtn) el.installBtn.hidden = true;
    showToast('HITSTER Web ist installiert.');
  });
  if (el.installBtn) {
    el.installBtn.addEventListener('click', async () => {
      if (!state.installPrompt) {
        showToast('Installation über das Browser-Menü: „Zum Home-Bildschirm“.', 4200);
        return;
      }
      state.installPrompt.prompt();
      await state.installPrompt.userChoice.catch(() => null);
      state.installPrompt = null;
      el.installBtn.hidden = true;
    });
  }
}

/* --------------------------------------------------------------------------
   Spotify
   -------------------------------------------------------------------------- */

function spotifyUrl(song) {
  return song.spotifyId
    ? `https://open.spotify.com/track/${song.spotifyId}`
    : `https://open.spotify.com/search/${encodeURIComponent(`${song.title} ${song.artist}`)}`;
}

function openSpotify() {
  const song = state.current;
  if (!song) return;
  trackEvent('spotify');
  el.spotifySong.textContent = `${song.title} – ${song.artist} (${song.year})`;
  el.spotifyOpen.href = spotifyUrl(song);
  el.spotifyFrame.replaceChildren();

  if (song.spotifyId && /^[A-Za-z0-9]{22}$/.test(song.spotifyId)) {
    const iframe = document.createElement('iframe');
    iframe.src = `https://open.spotify.com/embed/track/${song.spotifyId}?utm_source=generator&theme=0`;
    iframe.width = '100%';
    iframe.height = '152';
    iframe.allow = 'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture';
    iframe.loading = 'lazy';
    iframe.title = `Spotify-Player: ${song.title} von ${song.artist}`;
    el.spotifyFrame.append(iframe);
  } else {
    const p = document.createElement('p');
    p.className = 'panel-sub';
    p.textContent = 'Für diesen Song ist kein direkter Spotify-Track hinterlegt. Der Button öffnet die Spotify-Suche.';
    el.spotifyFrame.append(p);
  }
  openModal(el.spotifyModal);
}

/* --------------------------------------------------------------------------
   Modals
   -------------------------------------------------------------------------- */

let lastFocus = null;

function openModal(modal) {
  lastFocus = document.activeElement;
  modal.hidden = false;
  document.body.style.overflow = 'hidden';
  setTimeout(() => modal.querySelector('[data-close]')?.focus({ preventScroll: true }), 40);
}

function closeModal(modal) {
  if (!modal || modal.hidden) return;
  modal.hidden = true;
  document.body.style.overflow = '';
  if (modal === el.spotifyModal) el.spotifyFrame.replaceChildren();
  if (modal === el.scanModal) stopScan();
  if (lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus({ preventScroll: true });
}

function closeAllModals() {
  closeModal(el.helpModal);
  closeModal(el.spotifyModal);
  closeModal(el.scanModal);
  closeModal(el.printModal);
}

/* --------------------------------------------------------------------------
   Confetti
   -------------------------------------------------------------------------- */

function confetti(count = 36) {
  const colors = ['#ff2d95', '#7c5cff', '#29e6ff', '#c6ff3d', '#ff9f1c', '#ffffff'];
  const layer = document.createElement('div');
  layer.className = 'confetti';
  layer.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < count; i++) {
    const piece = document.createElement('i');
    piece.style.left = `${50 + (Math.random() - 0.5) * 24}%`;
    piece.style.background = colors[i % colors.length];
    piece.style.setProperty('--dx', `${(Math.random() - 0.5) * 420}px`);
    piece.style.setProperty('--dy', `${180 + Math.random() * 340}px`);
    piece.style.setProperty('--rot', `${Math.random() * 720 - 360}deg`);
    piece.style.animationDelay = `${Math.random() * 0.12}s`;
    piece.style.width = `${4 + Math.random() * 6}px`;
    piece.style.height = `${6 + Math.random() * 8}px`;
    layer.append(piece);
  }
  document.body.append(layer);
  setTimeout(() => layer.remove(), 1800);
}

/* --------------------------------------------------------------------------
   Sound / prefs
   -------------------------------------------------------------------------- */

function applyPrefs() {
  el.audio.volume = state.prefs.volume;
  el.audio.muted = !state.prefs.soundOn;
  el.volume.value = String(Math.round(state.prefs.volume * 100));
  el.volumeValue.textContent = String(Math.round(state.prefs.volume * 100));
  el.soundToggle.querySelector('use').setAttribute('href', state.prefs.soundOn ? '#i-volume' : '#i-mute');
  el.soundToggle.setAttribute('aria-label', state.prefs.soundOn ? 'Ton ausschalten' : 'Ton einschalten');
}

function toggleSound() {
  state.prefs.soundOn = !state.prefs.soundOn;
  applyPrefs();
  savePrefs();
  showToast(state.prefs.soundOn ? 'Ton an' : 'Ton aus');
}

/* --------------------------------------------------------------------------
   Events
   -------------------------------------------------------------------------- */

function openHelp() {
  renderAnalytics();
  openModal(el.helpModal);
  trackEvent('help');
}

function showStart() {
  document.body.classList.remove('started', 'is-fullscreen');
  if (window.HitsterOnline?.close) window.HitsterOnline.close();
  closeAllModals();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function startApp(mode = 'classic') {
  if (mode === 'online') {
    if (window.HitsterOnline?.open) window.HitsterOnline.open();
    else showToast('Online-Modus lädt noch – bitte einen Moment.', 2600);
    return;
  }
  if (mode === 'print') {
    document.body.classList.add('started');
    openPrint();
    return;
  }
  if (mode === 'help') {
    openHelp();
    return;
  }
  if (!['classic', 'versions', 'playlist'].includes(mode)) return;
  document.body.classList.add('started');
  if (mode === 'playlist') {
    state.mode = 'playlist';
    setMode('playlist', { silent: true, reload: false });
    el.playlistUrl?.focus({ preventScroll: true });
  } else {
    setMode(mode, { silent: true, reload: false });
    const song = pickSong();
    if (song) loadCard(song);
  }
  el.gameLayout?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function toggleFullscreen() {
  const active = document.body.classList.contains('is-fullscreen');
  if (active) {
    document.body.classList.remove('is-fullscreen');
    if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
    showToast('Vollbild beendet.');
    return;
  }
  document.body.classList.add('is-fullscreen');
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
  } catch { /* CSS fullscreen still works */ }
  showToast('Vollbild aktiv – Esc beendet den Modus.');
}

function initCollapsiblePanels() {
  for (const block of $$('.panel-block')) {
    const head = $('.panel-head', block);
    if (!head || $('.panel-collapse', head)) continue;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'panel-collapse';
    button.setAttribute('aria-label', 'Bereich ein- oder ausklappen');
    button.setAttribute('aria-expanded', 'true');
    button.innerHTML = '<svg aria-hidden="true"><use href="#i-flip"></use></svg>';
    button.addEventListener('click', () => {
      const collapsed = block.classList.toggle('is-collapsed');
      button.setAttribute('aria-expanded', String(!collapsed));
    });
    head.append(button);
  }
}

function bindEvents() {
  el.cardPlay.addEventListener('click', (e) => {
    e.stopPropagation();
    if (state.flipped) flipCard();
    else playClip();
  });

  el.card.addEventListener('click', (e) => {
    if (e.target.closest('button, a, input, label')) return;
    if (state.flipped) flipCard();
    else playClip();
  });

  el.playBtn.addEventListener('click', () => playClip());
  el.flipBtn.addEventListener('click', flipCard);
  el.nextBtn.addEventListener('click', nextCard);
  el.spotifyBtn.addEventListener('click', openSpotify);
  el.judgeRight.addEventListener('click', () => judge(true));
  el.judgeWrong.addEventListener('click', () => judge(false));
  if (el.databaseLink) el.databaseLink.href = STATIC ? 'hitster-database.json' : '/api/database';
  el.helpBtn.addEventListener('click', openHelp);
  $('.brand')?.addEventListener('click', (event) => { event.preventDefault(); showStart(); });
  el.soundToggle.addEventListener('click', toggleSound);

  el.modeSwitch.addEventListener('click', (e) => {
    const action = e.target.closest('[data-action]');
    if (action) {
      if (action.dataset.action === 'online') startApp('online');
      if (action.dataset.action === 'print') openPrint();
      return;
    }
    const btn = e.target.closest('[data-mode]');
    if (btn) setMode(btn.dataset.mode);
  });
  el.startBtn?.addEventListener('click', () => { if (!el.scanModal.hidden) return; showStart(); });
  el.fullscreenBtn?.addEventListener('click', toggleFullscreen);
  $$('[data-start]').forEach((button) => button.addEventListener('click', () => startApp(button.dataset.start)));
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement) document.body.classList.remove('is-fullscreen');
  });
  initCollapsiblePanels();
  el.scanBtn.addEventListener('click', openScan);
  if (el.versionScanBtn) el.versionScanBtn.addEventListener('click', (event) => { event.preventDefault(); event.stopPropagation(); openScan(); });
  el.genreReset?.addEventListener('click', clearGenres);
  el.scanRetry?.addEventListener('click', startScanCamera);
  el.printBtn.addEventListener('click', openPrint);
  el.printGo.addEventListener('click', doPrint);

  el.resetFilters.addEventListener('click', () => {
    state.filters = { genres: [], decade: 'all', oneHit: false, spotifyOnly: false };
    el.oneHitToggle.checked = false;
    el.spotifyToggle.checked = false;
      afterFilterChange();
    showToast('Filter zurückgesetzt.');
  });


  el.playlistLoad.addEventListener('click', () => loadPlaylist(el.playlistUrl.value));
  el.playlistUrl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      loadPlaylist(el.playlistUrl.value);
    }
  });
  el.playlistClear.addEventListener('click', clearPlaylist);
  el.saveCategory?.addEventListener('click', saveCurrentCategory);
  el.customCategories?.addEventListener('click', (e) => {
    const remove = e.target.closest('[data-remove-category]');
    if (remove) return removeCategory(remove.dataset.removeCategory);
    const main = e.target.closest('[data-category-id]');
    if (main) activateCategory(main.dataset.categoryId);
  });

  el.deckSelect?.addEventListener('change', () => {
    state.prefs.deckSku = el.deckSelect.value;
    savePrefs();
  });
  el.scanFile?.addEventListener('change', async () => {
    const file = el.scanFile.files?.[0];
    if (file) await scanImageFile(file);
    el.scanFile.value = '';
  });

  el.mpPlay?.addEventListener('click', () => playClip());
  el.mpRestart?.addEventListener('click', () => playClip({ restart: true }));
  el.mpClose?.addEventListener('click', () => {
    pauseClip();
    hidePlayer();
    state.playerHidden = true;
  });

  el.oneHitToggle.addEventListener('change', () => {
    state.filters.oneHit = el.oneHitToggle.checked;
    if (!currentPool().length) {
      state.filters.oneHit = !state.filters.oneHit;
      el.oneHitToggle.checked = state.filters.oneHit;
      return showToast('Keine One-Hit-Wonder mit dieser Auswahl.');
    }
    afterFilterChange();
  });

  el.spotifyToggle.addEventListener('change', () => {
    state.filters.spotifyOnly = el.spotifyToggle.checked;
    if (!currentPool().length) {
      state.filters.spotifyOnly = !state.filters.spotifyOnly;
      el.spotifyToggle.checked = state.filters.spotifyOnly;
      return showToast('Keine Karten mit Spotify-Link in dieser Auswahl.');
    }
    afterFilterChange();
  });

  el.analyticsExport?.addEventListener('click', exportAnalytics);
  el.analyticsClear?.addEventListener('click', clearAnalytics);
  el.resetStats.addEventListener('click', resetRound);
  el.roundNew.addEventListener('click', resetRound);


  el.volume.addEventListener('input', () => {
    const v = Number(el.volume.value) / 100;
    state.prefs.volume = v;
    state.prefs.soundOn = v > 0;
    applyPrefs();
    savePrefs();
  });

  for (const modal of [el.helpModal, el.spotifyModal, el.scanModal, el.printModal]) {
    modal.addEventListener('click', (e) => {
      if (e.target.closest('[data-close]')) closeModal(modal);
    });
  }

  el.audio.addEventListener('ended', () => {
    setPlaying(false);
    stopTimer();
    el.frontSub.textContent = 'Clip zu Ende – umdrehen oder neu starten.';
    updatePlayer();
  });

  el.audio.addEventListener('error', () => {
    if (!state.current) return;
    setPlaying(false);
    stopTimer();
    showToast('Audio konnte nicht geladen werden. Nächste Karte?');
    updatePlayer();
  });

  el.audio.addEventListener('pause', () => {
    if (state.playing) setPlaying(false);
    updatePlayer();
  });

  el.audio.addEventListener('timeupdate', updatePlayerProgress);
  el.audio.addEventListener('loadedmetadata', updatePlayerProgress);

  el.audio.addEventListener('play', () => {
    if (!state.playing) setPlaying(true);
  });

  document.addEventListener('keydown', (e) => {
    const modalOpen = !el.helpModal.hidden || !el.spotifyModal.hidden || !el.scanModal.hidden || !el.printModal.hidden;
    if (e.key === 'Escape') {
      closeAllModals();
      return;
    }
    if (modalOpen) return;
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable) return;

    if (e.code === 'Space') {
      e.preventDefault();
      playClip();
    } else if (e.key === 'f' || e.key === 'F') {
      e.preventDefault();
      flipCard();
    } else if (e.key === 'n' || e.key === 'N') {
      e.preventDefault();
      nextCard();
    } else if (e.key === 'r' || e.key === 'R') {
      e.preventDefault();
      playClip({ restart: true });
    } else if (e.key === '?') {
      e.preventDefault();
      openModal(el.helpModal);
    }
  });

  window.addEventListener('pagehide', saveAnalytics);
  window.addEventListener('popstate', () => {
    readUrl();
    renderGenreChips();
    renderDecadeChips();
    updateFilterSummary();
    setMode(state.mode, { silent: true, reload: false, preserveYear: state.mode === 'extension' && !!state.extensionYear });
    if (state.initialPlaylist) {
      loadPlaylist(state.initialPlaylist);
    } else if (state.initialCard) {
      loadCardById(state.initialCard);
    } else if (state.mode === 'extension' && state.extensionYear) {
      applyYear(state.extensionYear, { silent: true });
    } else if (state.mode !== 'playlist') {
      const song = pickSong();
      if (song) loadCard(song);
    }
  });
}

/* --------------------------------------------------------------------------
   Init
   -------------------------------------------------------------------------- */

async function init() {
  const startRequested = new URLSearchParams(location.search).get('start') === '1';
  loadStats();
  loadPrefs();
  applyPrefs();
  loadRound();
  loadCategories();
  loadAnalytics();
  renderAnalytics();
  trackEvent('app_open');
  readUrl();
  renderStats();

  try {
    const res = await fetch(STATIC ? 'catalog.json' : '/api/catalog?v=3.0.0', { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    state.songs = data.songs || [];
    el.catalogPill.textContent = `${data.count} Karten`;
    if (el.footerCount) el.footerCount.textContent = data.count.toLocaleString('de-DE');
    if (!state.songs.length) throw new Error('Katalog leer');
  } catch (err) {
    console.error(err);
    el.catalogPill.textContent = 'Offline';
    el.frontSub.textContent = 'Katalog konnte nicht geladen werden. Bitte Server neu starten.';
    showToast('Katalog konnte nicht geladen werden.', 6000);
    return;
  }

  el.oneHitToggle.checked = state.filters.oneHit;
  el.spotifyToggle.checked = state.filters.spotifyOnly;
  renderGenreChips();
  renderDecadeChips();
  renderVersionChips();
  updateFilterSummary();
  bindEvents();
  bindInstall();
  registerServiceWorker();
  setMode(state.mode, { silent: true, reload: false, preserveYear: state.mode === 'extension' && !!state.extensionYear });

  if (state.initialPlaylist) {
    await loadPlaylist(state.initialPlaylist);
  } else if (state.initialHitster) {
    await handleScan({ hitster: state.initialHitster });
  } else if (state.initialCard) {
    await loadCardById(state.initialCard);
  } else if (state.mode === 'extension' && state.extensionYear) {
    applyYear(state.extensionYear, { silent: true });
  } else if (state.mode !== 'playlist') {
    const song = pickSong();
    if (song) {
      loadCard(song);
      state.stats.played += 1;
      saveStats();
      renderStats();
    }
  }

  if (!startRequested) document.body.classList.add('started');
  state.ready = true;
  window.HITSTER = {
    state,
    nextCard,
    flipCard,
    playClip,
    openSpotify,
    openHelp,
    loadCard,
    setMode,
    applyYear,
    randomYear,
    openPrint,
    openScan,
    loadCardById,
    parseScan,
    resetRound,
    resolveSpotify,
    handleScan,
    handleHitster,
    loadHitsterDb,
    loadPlaylist,
    scanImageFile,
    scanFrame,
    trackEvent,
    exportAnalytics,
    clearAnalytics,
    setVersion,
    versions: VERSIONS,
    versionMatches,
    versionYearPool,
    fameScore,
    API_BASE,
    STATIC,
    showToast,
    confetti,
    startApp,
    showStart,
  };
  window.dispatchEvent(new Event('hitster-ready'));
}

init();
