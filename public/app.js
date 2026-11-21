/* ==========================================================================
   HITSTER Web – app logic
   Vanilla JS, no build step, no tracking, no login.
   ========================================================================== */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const CLIP_SECONDS = 25;
const STATIC = document.documentElement.dataset.static === 'true' || location.hostname.endsWith('github.io');
const itunesCache = new Map();
const STATS_KEY = 'hitster-web-stats-v1';
const ROUND_KEY = 'hitster-web-round-v1';
const PREFS_KEY = 'hitster-web-prefs-v1';

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
};


const state = {
  songs: [],
  catalog: null,
  filters: { genre: 'all', decade: 'all', oneHit: false, spotifyOnly: false },
  current: null,
  recent: [],
  flipped: false,
  playing: false,
  timer: { remaining: CLIP_SECONDS, id: null, last: 0 },
  stats: { played: 0, flipped: 0, correct: 0, wrong: 0, streak: 0, bestStreak: 0 },
  roundSeen: new Set(),
  prefs: { soundOn: true, volume: 0.85 },
  mode: 'classic',
  extensionYear: null,
  initialCard: null,
  scan: { stream: null, raf: null, active: false },
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
  ring: $('#ringFg'),
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
  backQrImg: $('#backQrImg'),
  frontYearBadge: $('#frontYearBadge'),
  frontGroupIcon: $('#frontGroupIcon'),
  backGroupIcon: $('#backGroupIcon'),
  modeSwitch: $('#modeSwitch'),
  extensionBar: $('#extensionBar'),
  yearInput: $('#yearInput'),
  yearGo: $('#yearGo'),
  yearRandom: $('#yearRandom'),
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
  footerCount: $('#footerCount'),
  genreChips: $('#genreChips'),
  decadeChips: $('#decadeChips'),
  genreCount: $('#genreCount'),
  decadeCount: $('#decadeCount'),
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

function matches(song, { ignoreGenre = false, ignoreDecade = false } = {}) {
  const f = state.filters;
  if (!ignoreGenre && f.genre !== 'all' && song.genre !== f.genre) return false;
  if (!ignoreDecade && f.decade !== 'all' && `${Math.floor(song.year / 10) * 10}s` !== f.decade) return false;
  if (f.oneHit && !song.tags?.includes('onehit')) return false;
  if (f.spotifyOnly && !song.spotifyId) return false;
  return true;
}

function currentPool() {
  return state.songs.filter((s) => matches(s));
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
    if (Array.isArray(raw)) state.roundSeen = new Set(raw.filter((id) => /^s\d{4}$/.test(id)));
  } catch { /* ignore */ }
}

function saveRound() {
  try { localStorage.setItem(ROUND_KEY, JSON.stringify([...state.roundSeen])); } catch { /* ignore */ }
}

/* --------------------------------------------------------------------------
   Rendering – chips
   -------------------------------------------------------------------------- */

function renderGenreChips() {
  const frag = document.createDocumentFragment();
  const entries = [{ key: 'all', ...GENRES.all }, ...Object.entries(GENRES).filter(([k]) => k !== 'all').map(([key, v]) => ({ key, ...v }))];
  for (const g of entries) {
    const count = state.songs.filter((s) => (g.key === 'all' || s.genre === g.key) && matches(s, { ignoreGenre: true })).length;
    if (!count && g.key !== state.filters.genre && g.key !== 'all') continue;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip' + (state.filters.genre === g.key ? ' active' : '');
    btn.dataset.genre = g.key;
    btn.style.setProperty('--c', g.color);
    btn.setAttribute('aria-pressed', state.filters.genre === g.key ? 'true' : 'false');
    btn.title = `${g.label} – ${count} Karten`;
    const label = document.createElement('span');
    label.textContent = g.label;
    const c = document.createElement('span');
    c.className = 'n';
    c.textContent = count;
    btn.append(label, c);
    btn.addEventListener('click', () => selectGenre(g.key));
    frag.append(btn);
  }
  el.genreChips.replaceChildren(frag);
  el.genreCount.textContent = `${state.songs.filter((s) => matches(s)).length}`;
}

function renderDecadeChips() {
  const frag = document.createDocumentFragment();
  const decades = [...new Set(state.songs.map((s) => `${Math.floor(s.year / 10) * 10}s`))].sort();
  const all = document.createElement('button');
  all.type = 'button';
  all.className = 'chip' + (state.filters.decade === 'all' ? ' active' : '');
  all.dataset.decade = 'all';
  all.style.setProperty('--c', '#ff2d95');
  all.textContent = 'Alle';
  all.addEventListener('click', () => selectDecade('all'));
  frag.append(all);

  for (const d of decades) {
    const count = state.songs.filter((s) => `${Math.floor(s.year / 10) * 10}s` === d && matches(s, { ignoreDecade: true })).length;
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
  el.decadeCount.textContent = `${state.songs.filter((s) => matches(s)).length}`;
}

function updateFilterSummary() {
  const parts = [];
  if (state.filters.genre !== 'all') parts.push(genreLabel(state.filters.genre));
  if (state.mode === 'extension' && state.extensionYear) parts.push(`Jahr ${state.extensionYear}`);
  else if (state.filters.decade !== 'all') parts.push(state.filters.decade);
  if (state.filters.oneHit) parts.push('One-Hit-Wonder');
  if (state.filters.spotifyOnly) parts.push('mit Spotify');
  const count = currentPool().length;
  el.filterSummary.textContent = `${parts.length ? parts.join(' · ') : 'Alle Karten'} · ${count}`;
}

function selectGenre(genre) {
  const test = { ...state.filters, genre };
  const count = state.songs.filter((s) => {
    if (test.genre !== 'all' && s.genre !== test.genre) return false;
    if (test.decade !== 'all' && `${Math.floor(s.year / 10) * 10}s` !== test.decade) return false;
    if (test.oneHit && !s.tags?.includes('onehit')) return false;
    if (test.spotifyOnly && !s.spotifyId) return false;
    return true;
  }).length;
  if (!count) return showToast('Keine Karten mit dieser Kombination.');
  state.filters.genre = genre;
  afterFilterChange();
}

function selectDecade(decade) {
  const test = { ...state.filters, decade };
  const count = state.songs.filter((s) => {
    if (test.genre !== 'all' && s.genre !== test.genre) return false;
    if (test.decade !== 'all' && `${Math.floor(s.year / 10) * 10}s` !== test.decade) return false;
    if (test.oneHit && !s.tags?.includes('onehit')) return false;
    if (test.spotifyOnly && !s.spotifyId) return false;
    return true;
  }).length;
  if (!count) return showToast('Keine Karten mit dieser Kombination.');
  state.filters.decade = decade;
  if (state.mode === 'extension') {
    state.extensionYear = null;
    setMode('classic', { silent: true, reload: false });
  }
  afterFilterChange();
}

function afterFilterChange() {
  renderGenreChips();
  renderDecadeChips();
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
  if (state.filters.genre !== 'all') params.set('genre', state.filters.genre);
  if (state.filters.decade !== 'all') params.set('decade', state.filters.decade);
  if (state.filters.oneHit) params.set('onehit', '1');
  if (state.filters.spotifyOnly) params.set('spotify', '1');
  if (state.mode !== 'classic') params.set('mode', state.mode);
  if (state.mode === 'extension' && state.extensionYear) params.set('year', String(state.extensionYear));
  const qs = params.toString();
  history.replaceState(null, '', qs ? `?${qs}` : location.pathname);
}

function readUrl() {
  const p = new URLSearchParams(location.search);
  state.filters.genre = 'all';
  state.filters.decade = 'all';
  state.filters.oneHit = false;
  state.filters.spotifyOnly = false;
  state.mode = 'classic';
  state.extensionYear = null;
  state.initialCard = null;
  const genre = p.get('genre');
  const decade = p.get('decade');
  if (genre && GENRES[genre]) state.filters.genre = genre;
  if (decade && /^\d{4}s$/.test(decade)) state.filters.decade = decade;
  state.filters.oneHit = p.get('onehit') === '1';
  state.filters.spotifyOnly = p.get('spotify') === '1';
  const mode = p.get('mode');
  if (['classic', 'extension'].includes(mode)) state.mode = mode;
  const year = Number(p.get('year'));
  if (year >= 1950 && year <= 2024) {
    state.mode = 'extension';
    state.extensionYear = year;
  }
  const card = p.get('card');
  if (card && /^s\d{4}$/.test(card)) state.initialCard = card;
}

/* --------------------------------------------------------------------------
   Rendering – card
   -------------------------------------------------------------------------- */

function renderGroupIcon(song) {
  const icon = song.group ? '#i-users' : '#i-user';
  const label = song.group ? 'Gruppe' : 'Solo';
  for (const node of [el.frontGroupIcon, el.backGroupIcon]) {
    node.querySelector('use').setAttribute('href', icon);
    node.setAttribute('aria-label', label);
    node.setAttribute('title', label);
  }
}

function yearPool(year) {
  return state.songs.filter((s) => s.year === year && matches(s, { ignoreDecade: true }));
}

function updateYearHint() {
  if (!state.extensionYear) {
    el.yearHint.textContent = 'Jahr eingeben – wir ziehen ein anderes Lied aus demselben Jahr.';
    return;
  }
  const pool = yearPool(state.extensionYear);
  const unseen = pool.filter((s) => !state.roundSeen.has(s.id)).length;
  if (!pool.length) {
    el.yearHint.textContent = `Für ${state.extensionYear} ist kein Lied mit diesen Filtern dabei.`;
  } else if (!unseen) {
    el.yearHint.textContent = `Alle Lieder aus ${state.extensionYear} gespielt – starte eine neue Runde.`;
  } else {
    el.yearHint.textContent = `Jahr ${state.extensionYear} · ${unseen} Lieder in dieser Runde übrig.`;
  }
}

function setMode(mode, { silent = false, reload = true } = {}) {
  if (!['classic', 'extension'].includes(mode)) return;
  state.mode = mode;
  document.body.classList.remove('mode-classic', 'mode-extension');
  document.body.classList.add(`mode-${mode}`);
  for (const btn of $$('.mode-btn', el.modeSwitch)) {
    const active = btn.dataset.mode === mode;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', active ? 'true' : 'false');
  }
  el.extensionBar.hidden = mode !== 'extension';
  if (mode === 'extension' && state.filters.decade !== 'all') {
    state.filters.decade = 'all';
    renderDecadeChips();
  }
  if (mode === 'extension') {
    if (!state.extensionYear && state.current) state.extensionYear = state.current.year;
    if (state.extensionYear) el.yearInput.value = String(state.extensionYear);
    updateYearHint();
  } else {
    state.extensionYear = null;
    el.yearInput.value = '';
    el.yearHint.textContent = 'Jahr eingeben – wir ziehen ein Lied aus demselben Jahr.';
  }
  if (reload && state.current) loadCard(state.current);
  syncUrl();
  if (!silent) showToast(mode === 'classic' ? 'Freies Spiel' : 'Mit Original');
}

function applyYear(year, { silent = false } = {}) {
  year = Number(year);
  if (!Number.isInteger(year) || year < 1950 || year > 2024) {
    showToast('Bitte ein Jahr zwischen 1950 und 2024 eingeben.');
    return false;
  }
  state.extensionYear = year;
  state.mode = 'extension';
  setMode('extension', { silent: true, reload: false });
  const pool = yearPool(year);
  if (!pool.length) {
    showToast(`Kein Lied aus ${year} für diese Filter.`);
    updateYearHint();
    syncUrl();
    return false;
  }
  const unseen = pool.filter((s) => !state.roundSeen.has(s.id));
  if (!unseen.length) {
    showToast(`Alle Lieder aus ${year} in dieser Runde gespielt. Starte eine neue Runde.`, 3800);
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
  if (!silent) showToast(`Jahr ${year} · ${unseen.length} Lieder in dieser Runde übrig`);
  return true;
}

function randomYear() {
  const years = [...new Set(state.songs
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
    if (year >= 1950 && year <= 2024) return { year };
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
    if (n >= 1950 && n <= 2024) return { year: n };
  }
  return null;
}

async function resolveSpotify(id) {
  if (STATIC) {
    const direct = state.songs.find((s) => s.spotifyId === id);
    if (direct) return { year: direct.year, title: direct.title, artist: direct.artist, song: direct, source: 'catalog' };
    try {
      const target = encodeURIComponent(`https://open.spotify.com/track/${id}`);
      const res = await fetch(`https://open.spotify.com/oembed?url=${target}`, { headers: { accept: 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const title = data.title || '';
      const nt = normText(title);
      const song = state.songs.find((s) => normText(s.title) === nt)
        || (nt.length > 4 ? state.songs.find((s) => normText(s.title).includes(nt)) : null);
      return song
        ? { year: song.year, title: song.title, artist: song.artist, song, source: 'catalog' }
        : { year: null, title, artist: '', song: null, source: 'spotify' };
    } catch {
      return { year: null, title: '', artist: '', song: null, source: 'spotify' };
    }
  }
  try {
    const res = await fetch(`/api/resolve?spotify=${encodeURIComponent(id)}`, { headers: { accept: 'application/json' } });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function handleScan(parsed) {
  if (!parsed) return false;
  if (parsed.card) {
    showToast('Karte geladen.');
    await loadCardById(parsed.card);
    return true;
  }
  if (parsed.year) {
    setMode('extension', { silent: true, reload: false });
    applyYear(parsed.year);
    return true;
  }
  if (parsed.spotifyId) {
    el.scanStatus.textContent = 'Lied wird erkannt …';
    const result = await resolveSpotify(parsed.spotifyId);
    if (result?.year) {
      if (result.song?.id) {
        state.roundSeen.add(result.song.id);
        saveRound();
      }
      setMode('extension', { silent: true, reload: false });
      const ok = applyYear(result.year, { silent: true });
      const name = result.title ? `${result.title}${result.artist ? ` – ${result.artist}` : ''}` : 'Lied';
      if (ok) showToast(`Erkannt: ${name} (${result.year}) – anderes Lied aus ${result.year}.`, 4200);
      return true;
    }
    el.scanStatus.textContent = result?.title
      ? `Lied erkannt: ${result.title}${result.artist ? ` – ${result.artist}` : ''}. Bitte Jahr manuell eingeben.`
      : 'Lied nicht erkannt. Bitte Jahr manuell eingeben.';
    if (result?.title) showToast(`Erkannt: ${result.title} – Jahr bitte eingeben.`, 4200);
    return false;
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
    const code = window.jsQR ? window.jsQR(img.data, w, h, { inversionAttempts: 'dontInvert' }) : null;
    if (code?.data) {
      const parsed = parseScan(code.data);
      if (parsed) {
        stopScan();
        closeModal(el.scanModal);
        handleScan(parsed);
        return;
      }
      el.scanStatus.textContent = 'QR-Code erkannt, aber kein Spotify-Link/Jahr. Bitte Jahr manuell eingeben.';
    }
  }
  state.scan.raf = requestAnimationFrame(scanFrame);
}

async function openScan() {
  if (!navigator.mediaDevices?.getUserMedia) {
    showToast('Kamera nicht verfügbar. Bitte Jahr manuell eingeben.');
    return;
  }
  if (!window.jsQR) {
    showToast('QR-Scanner konnte nicht geladen werden. Bitte Jahr manuell eingeben.');
    return;
  }
  openModal(el.scanModal);
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
    el.scanStatus.textContent = 'Kamera nicht verfügbar oder Zugriff verweigert. Bitte Jahr manuell eingeben.';
    showToast('Kamera nicht verfügbar.');
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
  const qrSrc = STATIC ? `qr/${song.id}.svg` : `/api/qr/${song.id}?base=${encodeURIComponent(location.origin)}`;
  const band = `<div class="pc-band"><span class="pc-kicker">${side === 'front' ? 'HITSTER' : 'AUFGELÖST'}</span><span class="pc-band-right">${printGroupIcon(song)}</span></div>`;
  if (side === 'front') {
    return `<div class="print-card" style="--c:${color}">
      ${band}
      <div class="pc-qr"><img src="${qrSrc}" alt="QR-Code Karte ${song.id}" /><span>Scan &amp; Play</span></div>
      <div class="pc-center">
        <div class="pc-vinyl"></div>
        <div class="pc-question">Wie heißt der Song?</div>
        <div class="pc-sub">30-Sekunden-Clip</div>
      </div>
      <div class="pc-foot"><span>#${id}</span><span>Umdrehen</span></div>
    </div>`;
  }
  return `<div class="print-card pc-back" style="--c:${color}">
    ${band}
    <div class="pc-center">
      <div class="pc-year-label">Erschienen</div>
      <div class="pc-year">${song.year}</div>
      <div class="pc-decade">${decadeLabel(song.year)}</div>
      <div class="pc-title">${escapeHtml(song.title)}</div>
      <div class="pc-artist">${escapeHtml(song.artist)}</div>
    </div>
    <div class="pc-foot"><span>#${id}</span><span>HITSTER</span></div>
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
  el.printFilter.checked = state.filters.genre !== 'all' || state.filters.decade !== 'all' || state.filters.oneHit || state.filters.spotifyOnly;
  openModal(el.printModal);
}

async function doPrint() {
  const count = Math.max(1, Math.min(27, Number(el.printCount.value) || 9));
  const pool = el.printFilter.checked ? currentPool() : state.songs;
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
  if (!STATIC) el.audio.src = song.streamUrl;
  resetTimer();

  el.card.style.setProperty('--c', genreColor(song.genre));
  el.frontNumber.textContent = `#${song.id.slice(1)}`;
  el.frontSub.textContent = state.mode === 'extension'
    ? `Jahr ${song.year} – tippe für den Clip.`
    : 'Tippe auf die Karte, um den Clip zu starten.';
  el.frontYearBadge.hidden = state.mode !== 'extension';
  el.frontYearBadge.textContent = String(song.year);
  el.backNumber.textContent = `#${song.id.slice(1)}`;
  el.backYear.textContent = String(song.year);
  el.backDecade.textContent = decadeLabel(song.year);
  el.backTitle.textContent = song.title;
  el.backArtist.textContent = song.artist;
  el.backQrImg.src = STATIC ? `qr/${song.id}.svg` : `/api/qr/${song.id}?base=${encodeURIComponent(location.origin)}`;

  renderGroupIcon(song);
  updateFlipButton();

  el.cardWrap.classList.remove('dealing');
  void el.cardWrap.offsetWidth;
  el.cardWrap.classList.add('dealing');

  el.spotifyBtn.disabled = false;
  el.playBtn.disabled = false;
  el.flipBtn.disabled = false;
  if (state.mode === 'extension') updateYearHint();
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

function setPlaying(playing) {
  state.playing = playing;
  el.card.classList.toggle('is-playing', playing);
  document.body.classList.toggle('is-playing', playing);
  el.cardPlay.setAttribute('aria-pressed', playing ? 'true' : 'false');
  el.cardPlay.setAttribute('aria-label', playing ? 'Clip pausieren' : 'Clip abspielen');
  el.playLabel.textContent = playing ? 'Pausieren' : 'Clip abspielen';
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
  if (state.playing) return pauseClip();
  if (restart) {
    try { el.audio.currentTime = 0; } catch { /* ignore */ }
    resetTimer();
  }
  if (STATIC && !el.audio.getAttribute('src')) {
    el.frontSub.textContent = 'Clip wird geladen …';
    const url = await resolveItunesPreview(state.current);
    if (!url) {
      el.frontSub.textContent = 'Kein Clip gefunden. Nächste Karte?';
      showToast('Kein Clip für diesen Song gefunden.');
      return;
    }
    el.audio.src = url;
    el.frontSub.textContent = state.mode === 'extension'
      ? `Jahr ${state.current.year} – tippe für den Clip.`
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
  el.ring.style.strokeDashoffset = String(289 * (1 - ratio));
}

/* --------------------------------------------------------------------------
   Flip / next
   -------------------------------------------------------------------------- */

function flipCard() {
  if (!state.current) return;
  state.flipped = !state.flipped;
  el.card.dataset.flipped = state.flipped ? 'true' : 'false';
  if (state.flipped) {
    pauseClip();
    stopTimer();
    state.stats.flipped += 1;
    saveStats();
    renderStats();
  }
  setFaceAccessibility(state.flipped);
  updateFlipButton();
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
  el.yearGo.addEventListener('click', () => applyYear(el.yearInput.value));
  el.yearInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      applyYear(el.yearInput.value);
    }
  });
  el.yearRandom.addEventListener('click', randomYear);
  el.scanBtn.addEventListener('click', openScan);
  el.printBtn.addEventListener('click', openPrint);
  el.printGo.addEventListener('click', doPrint);

  el.resetFilters.addEventListener('click', () => {
    state.filters = { genre: 'all', decade: 'all', oneHit: false, spotifyOnly: false };
    el.oneHitToggle.checked = false;
    el.spotifyToggle.checked = false;
    afterFilterChange();
    showToast('Filter zurückgesetzt.');
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
      if (e.target.dataset.close) closeModal(modal);
    });
  }

  el.audio.addEventListener('ended', () => {
    setPlaying(false);
    stopTimer();
    el.frontSub.textContent = 'Clip zu Ende – umdrehen oder neu starten.';
  });

  el.audio.addEventListener('error', () => {
    if (!state.current) return;
    setPlaying(false);
    stopTimer();
    showToast('Audio konnte nicht geladen werden. Nächste Karte?');
  });

  el.audio.addEventListener('pause', () => {
    if (state.playing) setPlaying(false);
  });

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
    updateFilterSummary();
    setMode(state.mode, { silent: true, reload: false });
    if (state.initialCard) {
      loadCardById(state.initialCard);
    } else if (state.mode === 'extension' && state.extensionYear) {
      applyYear(state.extensionYear, { silent: true });
    } else {
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
  updateFilterSummary();
  bindEvents();
  setMode(state.mode, { silent: true, reload: false });

  if (state.initialCard) {
    await loadCardById(state.initialCard);
  } else if (state.mode === 'extension' && state.extensionYear) {
    applyYear(state.extensionYear, { silent: true });
  } else {
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
  };
}

init();
