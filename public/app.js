/* ==========================================================================
   HITSTER Web – app logic
   Vanilla JS, no build step, no tracking, no login.
   ========================================================================== */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const CLIP_SECONDS = 30;
const VERSION = '4.2.0';
const STATIC = document.documentElement.dataset.static === 'true' || location.hostname.endsWith('github.io');
const API_BASE = (document.querySelector('meta[name="hitster-api"]')?.content || '').replace(/\/$/, '');
const API = (path) => `${API_BASE}${path}`;
const itunesCache = new Map();
const STATS_KEY = 'hitster-web-stats-v1';
const ROUND_KEY = 'hitster-web-round-v1';
const PREFS_KEY = 'hitster-web-prefs-v1';
const CATEGORIES_KEY = 'hitster-web-categories-v1';

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
  catalog: null,
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
  extensionYear: null,
  blindYear: false,
  initialCard: null,
  initialPlaylist: null,
  initialHitster: null,
  playlist: null,
  categories: [],
  hitsterDb: null,
  playerHidden: false,
  installPrompt: null,
  scan: { stream: null, raf: null, active: false, deckSku: 'auto' },
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
  backNumber: $('#backNumber'),
  backYear: $('#backYear'),
  backDecade: $('#backDecade'),
  backTitle: $('#backTitle'),
  backArtist: $('#backArtist'),
  backGroupIcon: $('#backGroupIcon'),
  backGroupLabel: $('#backGroupLabel'),
  backGroupTag: $('#backGroupTag'),
  backGenre: $('#backGenre'),
  backGenreTag: $('#backGenreTag'),
  backDecadeFact: $('#backDecadeFact'),
  backGroupFact: $('#backGroupFact'),
  backGenreFact: $('#backGenreFact'),
  bingoGroup: $('#bingoGroup'),
  bingoBefore: $('#bingoBefore'),
  bingoDecade: $('#bingoDecade'),
  bingoYear: $('#bingoYear'),
  bingoPlus2: $('#bingoPlus2'),
  bingoPlus3: $('#bingoPlus3'),
  bingoPlus4: $('#bingoPlus4'),
  bingoTitle: $('#bingoTitle'),
  bingoArtist: $('#bingoArtist'),
  bingoDecade2: $('#bingoDecade2'),
  backSource: $('#backSource'),
  modeSwitch: $('#modeSwitch'),
  extensionBar: $('#extensionBar'),
  scanBtn: $('#scanBtn'),
  yearHint: $('#yearHint'),
  printBtn: $('#printBtn'),
  printModal: $('#printModal'),
  printCount: $('#printCount'),
  printSides: $('#printSides'),
  printFilter: $('#printFilter'),
  printGo: $('#printGo'),
  printRoot: $('#printRoot'),
  scanModal: $('#scanModal'),
  scanVideo: $('#scanVideo'),
  scanCanvas: $('#scanCanvas'),
  scanStatus: $('#scanStatus'),
  scanLinkForm: $('#scanLinkForm'),
  scanLinkInput: $('#scanLinkInput'),
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

function matches(song, { ignoreGenres = false, ignoreDecade = false } = {}) {
  const f = state.filters;
  if (!ignoreGenres && f.genres.length && !songGenres(song).some((g) => f.genres.includes(g))) return false;
  if (!ignoreDecade && f.decade !== 'all' && `${Math.floor(song.year / 10) * 10}s` !== f.decade) return false;
  if (f.oneHit && !song.tags?.includes('onehit')) return false;
  if (f.spotifyOnly && !song.spotifyId) return false;
  return true;
}

function currentPool() {
  return activeSongs().filter((s) => matches(s));
}

function pickSong() {
  let pool = currentPool();
  if (state.mode === 'extension' && state.extensionYear) {
    pool = pool.filter((s) => s.year === state.extensionYear);
  }
  pool = pool.filter((s) => !state.roundSeen.has(s.id));
  if (!pool.length) return null;
  const fresh = pool.filter((s) => !state.recent.includes(s.id));
  const list = fresh.length ? fresh : pool;
  const song = list[Math.floor(Math.random() * list.length)];
  state.recent.push(song.id);
  if (state.recent.length > 80) state.recent.shift();
  return song;
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

/* --------------------------------------------------------------------------
   Rendering – chips
   -------------------------------------------------------------------------- */

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

function renderDifficultyChips() {}

function updateFilterSummary() {
  const parts = [];
  if (state.mode === 'playlist') parts.push(state.playlist?.name ? `Playlist: ${state.playlist.name}` : 'Playlist');
  if (state.filters.genres.length) parts.push(state.filters.genres.map(genreLabel).join(', '));
  if (state.filters.decade !== 'all') parts.push(state.filters.decade);
  if (state.mode === 'extension') parts.push('Mit Original');
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

function selectDecade(decade) {
  const before = state.filters.decade;
  state.filters.decade = decade;
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
  renderDifficultyChips();
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
  if (state.filters.genres.length) params.set('genre', state.filters.genres.join(','));
  if (state.filters.decade !== 'all') params.set('decade', state.filters.decade);
  if (state.filters.oneHit) params.set('onehit', '1');
  if (state.filters.spotifyOnly) params.set('spotify', '1');
  if (state.mode !== 'classic') params.set('mode', state.mode);
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
  state.extensionYear = null;
  state.blindYear = false;
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
  if (['classic', 'extension', 'playlist'].includes(mode)) state.mode = mode;
  const year = Number(p.get('year'));
  if (year >= 1950 && year <= 2030) {
    state.mode = 'extension';
    state.extensionYear = year;
    state.blindYear = true;
  }
  const card = p.get('card');
  if (card && /^s\d{4}$/.test(card)) state.initialCard = card;
  const hitster = p.get('hitster');
  if (hitster && /^[a-z]{2}\/\d{1,5}$/i.test(hitster)) {
    const [region, number] = hitster.toLowerCase().split('/');
    state.initialHitster = { region, card: number.padStart(5, '0') };
  }
  const playlist = p.get('playlist');
  if (playlist && /^[A-Za-z0-9]{22}$/.test(playlist)) {
    state.initialPlaylist = playlist;
    state.mode = 'playlist';
  }
}

/* --------------------------------------------------------------------------
   Rendering – card
   -------------------------------------------------------------------------- */

function renderGroupIcon(song) {
  const icon = song.group ? '#i-users' : '#i-user';
  const label = song.group ? 'Gruppe' : 'Solo';
  const node = el.backGroupIcon;
  if (!node) return;
  node.querySelector('use').setAttribute('href', icon);
  node.setAttribute('aria-label', label);
  node.setAttribute('title', label);
  el.backGroupLabel.textContent = label;
  el.backGroupTag.dataset.group = song.group ? 'group' : 'solo';
}


function yearPool(year) {
  return activeSongs().filter((s) => s.year === year && matches(s, { ignoreDecade: true }));
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

function saveCurrentCategory() {
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
  showToast(`Kategorie gespeichert: ${category.name}`, 3200);
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
  if (!['classic', 'extension', 'playlist'].includes(mode)) return;
  state.mode = mode;
  document.body.classList.remove('mode-classic', 'mode-extension', 'mode-playlist');
  document.body.classList.add(`mode-${mode}`);
  for (const btn of $$('.mode-btn', el.modeSwitch)) {
    const active = btn.dataset.mode === mode;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', active ? 'true' : 'false');
  }
  el.extensionBar.hidden = mode !== 'extension';
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
    if (!silent) showToast('Mit Original – Karte scannen.');
  } else if (mode === 'playlist') {
    state.extensionYear = null;
    state.blindYear = false;
    updatePlaylistStatus();
    if (!silent) showToast('Playlist-Modus');
  } else {
    state.extensionYear = null;
    state.blindYear = false;
    el.yearHint.textContent = 'Scanne eine echte Hitster-Karte – das Jahr bleibt verborgen und wir ziehen ein anderes Lied aus demselben Jahr.';
    if (!silent) showToast('Freies Spiel');
  }
  if (reload) {
    if (mode === 'playlist' && state.playlist) {
      const song = pickSong();
      if (song) loadCard(song);
    } else if (state.current) {
      loadCard(state.current);
    }
  }
  renderGenreChips();
  renderDecadeChips();
  renderDifficultyChips();
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

  const hit = t.match(/(?:https?:\/\/)?(?:www\.)?hitstergame\.com\/([a-z]{2})(?:-[a-z]{2})?\/(\d{1,5})/i);
  if (hit) return { hitster: { region: hit[1].toLowerCase(), card: hit[2].padStart(5, '0') } };

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

function resolveHitsterCard(region, card) {
  if (!state.hitsterDb) return null;
  const candidates = state.hitsterDb.gamesets.filter((set) => set.cards[card]);
  if (!candidates.length) return null;
  const selected = state.prefs.deckSku && state.prefs.deckSku !== 'auto'
    ? state.hitsterDb.gamesets.find((set) => set.sku === state.prefs.deckSku)
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

async function startBlindRound(result, label = 'Originalkarte') {
  if (!result?.year) return false;
  if (result.song?.id) {
    state.roundSeen.add(result.song.id);
    saveRound();
  }
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
  const mapping = resolveHitsterCard(parsed.region, parsed.card);
  if (!mapping) {
    el.scanStatus.textContent = 'Karte nicht im gewählten Set. Bitte anderes Kartenset wählen.';
    return false;
  }
  const count = mapping.candidates?.length || 1;
  el.scanStatus.textContent = `Kartenset: ${mapping.gameset.region} – ${mapping.gameset.name}${count > 1 ? ` · ${count} Sets passen zur Kartennummer` : ''}. Lied wird geladen …`;
  const known = state.hitsterDb?.tracks?.[mapping[0]];
  let result = null;
  if (known?.year) {
    result = {
      ...known,
      spotifyId: mapping[0],
      song: state.songs.find((song) => song.spotifyId === mapping[0]) || null,
      source: 'catalog',
    };
  } else {
    result = await resolveSpotify(mapping[0]);
  }
  if (!result?.year) {
    el.scanStatus.textContent = 'Originalkarte erkannt, aber kein Jahr gefunden. Bitte anderes Kartenset wählen oder erneut scannen.';
    return false;
  }
  return startBlindRound(result, mapping.gameset.name || 'Originalkarte');
}

async function handleScan(parsed) {
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

async function scanImageFile(file) {
  if (!file || !window.jsQR) return false;
  try {
    const bitmap = await createImageBitmap(file);
    const sizes = [[bitmap.width, bitmap.height], [Math.round(bitmap.width * 0.8), Math.round(bitmap.height * 0.8)]];
    for (const [w, h] of sizes) {
      const canvas = document.createElement('canvas');
      canvas.width = w * 2;
      canvas.height = h * 2;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(bitmap, (bitmap.width - w) / 2, (bitmap.height - h) / 2, w, h, 0, 0, canvas.width, canvas.height);
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = window.jsQR(img.data, canvas.width, canvas.height, { inversionAttempts: 'attemptBoth' });
      if (code?.data) {
        const parsed = parseScan(code.data);
        if (parsed) {
          closeModal(el.scanModal);
          return handleScan(parsed);
        }
      }
    }
    el.scanStatus.textContent = 'Kein lesbarer QR-Code im Bild gefunden.';
  } catch {
    el.scanStatus.textContent = 'Bild konnte nicht gelesen werden.';
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
  el.scanVideo.srcObject = null;
}

function scanFrame() {
  if (!state.scan.active) return;
  const video = el.scanVideo;
  if (video.readyState >= 2 && video.videoWidth) {
    const w = video.videoWidth;
    const h = video.videoHeight;
    el.scanCanvas.width = w;
    el.scanCanvas.height = h;
    const ctx = el.scanCanvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(video, 0, 0, w, h);
    const img = ctx.getImageData(0, 0, w, h);
    const code = window.jsQR ? window.jsQR(img.data, w, h, { inversionAttempts: 'attemptBoth' }) : null;
    if (code?.data) {
      const parsed = parseScan(code.data);
      if (parsed) {
        stopScan();
        closeModal(el.scanModal);
        handleScan(parsed);
        return;
      }
      el.scanStatus.textContent = 'QR-Code erkannt, aber kein Spotify-Link/Jahr. Bitte erneut scannen.';
    }
  }
  state.scan.raf = requestAnimationFrame(scanFrame);
}

async function openScan() {
  if (!window.jsQR) {
    showToast('QR-Scanner konnte nicht geladen werden. Bitte Seite neu laden.');
    return;
  }
  openModal(el.scanModal);
  loadHitsterDb().then(() => {
    populateDeckSelect();
    if (el.deckSelect) el.deckSelect.value = state.prefs.deckSku || 'auto';
  }).catch(() => {});
  if (!navigator.mediaDevices?.getUserMedia) {
    el.scanStatus.textContent = 'Kamera nicht verfügbar – nutze „Bild scannen“.';
    return;
  }
  el.scanStatus.textContent = 'Kamera wird gestartet …';
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
    state.scan.stream = stream;
    el.scanVideo.srcObject = stream;
    await el.scanVideo.play();
    el.scanStatus.textContent = 'Richte die Kamera auf den QR-Code deiner Hitster-Karte.';
    state.scan.active = true;
    scanFrame();
  } catch {
    el.scanStatus.textContent = 'Kamera nicht verfügbar oder Zugriff verweigert. Nutze „Bild scannen“.';
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function printGroupIcon(song) {
  return `<svg class="pc-group" aria-hidden="true"><use href="${song.group ? '#i-users' : '#i-user'}"></use></svg>`;
}


function printCardHtml(song, side) {
  const color = genreColor(song.genre);
  const id = song.id.slice(1);
  const isCatalog = /^s\d+$/.test(song.id);
  const qrSrc = isCatalog ? (STATIC ? `qr/${song.id}.svg` : `/api/qr/${song.id}?base=${encodeURIComponent(location.origin)}`) : null;
  if (side === 'front') {
    return `<div class="print-card" style="--c:#8a8a92">
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
  return `<div class="print-card pc-back" style="--c:${color}">
    <div class="pc-band"><span class="pc-kicker">AUFGELÖST</span><span class="pc-band-right">${printGroupIcon(song)}<span class="pc-genre">${escapeHtml(genreLabel(song.genre))}</span></span></div>
    <div class="pc-center">
      <div class="pc-year-label">Erschienen</div>
      <div class="pc-year">${song.year}</div>
      <div class="pc-decade">${decadeLabel(song.year)}</div>
      <div class="pc-title">${escapeHtml(song.title)}</div>
      <div class="pc-artist">${escapeHtml(song.artist)}</div>
      <div class="pc-meta">${song.group ? 'Gruppe' : 'Solo'} · ${escapeHtml(genreLabel(song.genre))}</div>
      <div class="pc-bingo">
        <div class="pc-bingo-cell"><small>Solo/Gruppe</small><strong>${song.group ? 'Gruppe' : 'Solo'}</strong></div>
        <div class="pc-bingo-cell"><small>Vor 2000?</small><strong>${song.year < 2000 ? 'Ja' : 'Nein'}</strong></div>
        <div class="pc-bingo-cell"><small>±4 Jahre</small><strong>${song.year}</strong></div>
        <div class="pc-bingo-cell"><small>Dekade</small><strong>${decadeLabel(song.year)}</strong></div>
        <div class="pc-bingo-cell"><small>±2 Jahre</small><strong>${song.year}</strong></div>
        <div class="pc-bingo-cell"><small>Titel</small><strong>${escapeHtml(song.title)}</strong></div>
        <div class="pc-bingo-cell"><small>Exaktes Jahr</small><strong>${song.year}</strong></div>
        <div class="pc-bingo-cell"><small>Interpret</small><strong>${escapeHtml(song.artist)}</strong></div>
        <div class="pc-bingo-cell"><small>Dekade</small><strong>${decadeLabel(song.year)}</strong></div>
        <div class="pc-bingo-cell"><small>±3 Jahre</small><strong>${song.year}</strong></div>
      </div>
    </div>
    <div class="pc-foot"><span>Karte #${id}</span><span>HITSTER</span></div>
  </div>`;
}

function printSheets(cards, side) {
  const chunks = [];
  for (let i = 0; i < cards.length; i += 9) chunks.push(cards.slice(i, i + 9));
  return chunks
    .map((chunk) => `<section class="print-sheet ${side === 'back' ? 'backs' : 'fronts'}">${chunk.join('')}</section>`)
    .join('');
}

function openPrint() {
  el.printFilter.checked = state.filters.decade !== 'all' || state.filters.genres.length || state.filters.oneHit || state.filters.spotifyOnly;
  openModal(el.printModal);
}

async function doPrint() {
  const count = Math.max(1, Math.min(27, Number(el.printCount.value) || 9));
  const pool = el.printFilter.checked ? currentPool() : activeSongs();
  if (!pool.length) {
    showToast('Keine Karten für diese Filter.');
    return;
  }
  const songs = shuffle(pool).slice(0, count);
  const sides = el.printSides.value;
  const fronts = songs.map((s) => printCardHtml(s, 'front'));
  const backs = songs.map((s) => printCardHtml(s, 'back'));
  let html = '';
  if (sides === 'both' || sides === 'front') html += printSheets(fronts, 'front');
  if (sides === 'both' || sides === 'back') html += printSheets(backs, 'back');
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
  el.frontNumber.textContent = `Karte #${song.id.slice(1)}`;
  el.frontSub.textContent = state.mode === 'extension'
    ? 'Tippe für den Clip – die Auflösung kommt erst beim Umdrehen.'
    : 'Tippe auf die Karte, um den Clip zu starten.';
  el.backNumber.textContent = `Karte #${song.id.slice(1)}`;
  el.backYear.textContent = String(song.year);
  el.backDecade.textContent = decadeLabel(song.year);
  el.backDecadeFact.textContent = decadeLabel(song.year);
  el.backTitle.textContent = song.title;
  el.backArtist.textContent = song.artist;
  el.backGenre.textContent = genreLabel(song.genre);
  el.backGenreFact.textContent = genreLabel(song.genre);
  el.backGroupFact.textContent = song.group ? 'Gruppe' : 'Solo';
  el.backGenreTag.style.setProperty('--c', genreColor(song.genre));
  if (el.bingoGroup) el.bingoGroup.textContent = song.group ? 'Gruppe' : 'Solo';
  if (el.bingoBefore) el.bingoBefore.textContent = song.year < 2000 ? 'Ja' : 'Nein';
  if (el.bingoDecade) el.bingoDecade.textContent = decadeLabel(song.year);
  if (el.bingoYear) el.bingoYear.textContent = String(song.year);
  if (el.bingoPlus2) el.bingoPlus2.textContent = String(song.year);
  if (el.bingoPlus3) el.bingoPlus3.textContent = String(song.year);
  if (el.bingoPlus4) el.bingoPlus4.textContent = String(song.year);
  if (el.bingoTitle) el.bingoTitle.textContent = song.title;
  if (el.bingoArtist) el.bingoArtist.textContent = song.artist;
  if (el.bingoDecade2) el.bingoDecade2.textContent = decadeLabel(song.year);
  el.backSource.textContent = song.source === 'spotify' ? 'Spotify' : 'Spotify · HITSTER';
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
    : state.mode === 'extension' ? 'MIT ORIGINAL' : 'HITSTER CLIP';
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
  if (!state.current) return;
  state.flipped = !state.flipped;
  el.card.dataset.flipped = state.flipped ? 'true' : 'false';
  setCardAccent(state.flipped);
  if (state.flipped) {
    pauseClip();
    stopTimer();
    state.stats.flipped += 1;
    saveStats();
    renderStats();
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
  const song = pickSong();
  if (!song) {
    showToast('Runde beendet – starte eine neue Runde.', 3600);
    return;
  }
  loadCard(song);
  state.stats.played += 1;
  saveStats();
  renderStats();
}

/* --------------------------------------------------------------------------
   Judging
   -------------------------------------------------------------------------- */

function judge(correct) {
  if (!state.current) return;
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
  el.playlistStatus.textContent = 'Playlist wird geladen …';
  try {
    const res = await fetch(API(`/api/playlist?url=${encodeURIComponent(raw)}`), { headers: { accept: 'application/json' } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    if (!data.songs?.length) throw new Error('Keine Lieder mit Jahr gefunden.');
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
    renderDifficultyChips();
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
    showToast(`Playlist geladen: ${data.name}`, 3600);
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
  renderDifficultyChips();
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
  el.helpBtn.addEventListener('click', () => openModal(el.helpModal));
  el.soundToggle.addEventListener('click', toggleSound);

  el.modeSwitch.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-mode]');
    if (btn) setMode(btn.dataset.mode);
  });
  el.scanBtn.addEventListener('click', openScan);
  el.genreReset?.addEventListener('click', clearGenres);
  el.scanLinkForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const raw = el.scanLinkInput?.value?.trim();
    const parsed = parseScan(raw);
    if (!parsed?.hitster) {
      el.scanStatus.textContent = 'Bitte einen Hitster-Kartenlink wie hitstergame.com/de/00052 einfügen.';
      return;
    }
    closeModal(el.scanModal);
    await handleScan(parsed);
  });
  el.printBtn.addEventListener('click', openPrint);
  el.printGo.addEventListener('click', doPrint);

  el.resetFilters.addEventListener('click', () => {
    state.filters = { genres: [], decade: 'all', oneHit: false, spotifyOnly: false };
    el.oneHitToggle.checked = false;
    el.spotifyToggle.checked = false;
    renderDifficultyChips();
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

  window.addEventListener('popstate', () => {
    readUrl();
    renderGenreChips();
    renderDecadeChips();
    renderDifficultyChips();
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
  loadStats();
  loadPrefs();
  applyPrefs();
  loadRound();
  loadCategories();
  readUrl();
  renderStats();

  try {
    const res = await fetch(STATIC ? 'catalog.json' : '/api/catalog?v=3.0.0', { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    state.catalog = data;
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
  renderDifficultyChips();
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

  state.ready = true;
  window.HITSTER = {
    state,
    nextCard,
    flipCard,
    playClip,
    openSpotify,
    openHelp: () => openModal(el.helpModal),
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
  };
}

init();
