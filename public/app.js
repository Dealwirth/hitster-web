/* ==========================================================================
   HITSTER Web – app logic
   Vanilla JS, no build step, no tracking, no login.
   ========================================================================== */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const CLIP_SECONDS = 25;
const STATS_KEY = 'hitster-web-stats-v1';
const BINGO_KEY = 'hitster-web-bingo-v1';
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

const BINGO = [
  { key: 'group', side: 'A', label: 'Gruppe oder Solo', short: 'Solo/Gruppe', color: '#a78bfa', icon: 'users', answer: (s) => (s.group ? 'Gruppe' : 'Solo') },
  { key: 'before2000', side: 'A', label: 'Vor 2000?', short: 'Vor 2000', color: '#22d3ee', icon: 'calendar', answer: (s) => (s.year < 2000 ? 'Ja' : 'Nein') },
  { key: 'pm4', side: 'A', label: '± 4 Jahre', short: '±4 Jahre', color: '#f472b6', icon: 'calendar', answer: (s) => String(s.year) },
  { key: 'decadeA', side: 'A', label: 'Dekade', short: 'Dekade', color: '#f59e0b', icon: 'calendar', answer: (s) => decadeLabel(s.year) },
  { key: 'pm2', side: 'A', label: '± 2 Jahre', short: '±2 Jahre', color: '#a3e635', icon: 'calendar', answer: (s) => String(s.year) },
  { key: 'title', side: 'B', label: 'Songtitel', short: 'Titel', color: '#60a5fa', icon: 'music', answer: (s) => s.title },
  { key: 'year', side: 'B', label: 'Exaktes Jahr', short: 'Jahr', color: '#facc15', icon: 'calendar', answer: (s) => String(s.year) },
  { key: 'artist', side: 'B', label: 'Interpret', color: '#fb7185', short: 'Interpret', icon: 'user', answer: (s) => s.artist },
  { key: 'decadeB', side: 'B', label: 'Dekade', short: 'Dekade', color: '#f59e0b', icon: 'calendar', answer: (s) => decadeLabel(s.year) },
  { key: 'pm3', side: 'B', label: '± 3 Jahre', short: '±3 Jahre', color: '#34d399', icon: 'calendar', answer: (s) => String(s.year) },
];

const BINGO_LINES = (() => {
  const lines = [];
  for (let r = 0; r < 5; r++) lines.push([0, 1, 2, 3, 4].map((c) => r * 5 + c));
  for (let c = 0; c < 5; c++) lines.push([0, 1, 2, 3, 4].map((r) => r * 5 + c));
  lines.push([0, 6, 12, 18, 24]);
  lines.push([4, 8, 12, 16, 20]);
  return lines;
})();

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
  bingo: { cells: [], marked: new Set(), celebrated: new Set() },
  prefs: { soundOn: true, volume: 0.85 },
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
  frontGenre: $('#frontGenre'),
  backGenre: $('#backGenre'),
  frontSub: $('#frontSub'),
  frontNumber: $('#frontNumber'),
  backNumber: $('#backNumber'),
  backYear: $('#backYear'),
  backDecade: $('#backDecade'),
  backTitle: $('#backTitle'),
  backArtist: $('#backArtist'),
  backMeta: $('#backMeta'),
  backArt: $('#backArt'),
  answersA: $('#answersA'),
  answersB: $('#answersB'),
  frontBingo: $('#frontBingo'),
  genreChips: $('#genreChips'),
  decadeChips: $('#decadeChips'),
  genreCount: $('#genreCount'),
  decadeCount: $('#decadeCount'),
  oneHitToggle: $('#oneHitToggle'),
  spotifyToggle: $('#spotifyToggle'),
  resetFilters: $('#resetFilters'),
  filterSummary: $('#filterSummary'),
  catalogPill: $('#catalogPill'),
  bingoBoard: $('#bingoBoard'),
  bingoLegend: $('#bingoLegend'),
  resetBingo: $('#resetBingo'),
  statPlayed: $('#statPlayed'),
  statCorrect: $('#statCorrect'),
  statRate: $('#statRate'),
  statStreak: $('#statStreak'),
  resetStats: $('#resetStats'),
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

function formatDuration(seconds) {
  if (!seconds) return '–';
  const m = Math.floor(seconds / 60);
  const s = String(seconds % 60).padStart(2, '0');
  return `${m}:${s}`;
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
  const pool = currentPool();
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

function loadBingo() {
  try {
    const raw = JSON.parse(localStorage.getItem(BINGO_KEY) || 'null');
    if (raw && Array.isArray(raw.cells) && raw.cells.length === 25 && BINGO.every((b) => raw.cells.includes(b.key))) {
      state.bingo.cells = raw.cells;
      state.bingo.marked = new Set(Array.isArray(raw.marked) ? raw.marked : []);
      return;
    }
  } catch { /* ignore */ }
  resetBingo(false);
}

function saveBingo() {
  try {
    localStorage.setItem(BINGO_KEY, JSON.stringify({ cells: state.bingo.cells, marked: [...state.bingo.marked] }));
  } catch { /* ignore */ }
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
    c.className = 'count';
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
    c.className = 'count';
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
  if (state.filters.decade !== 'all') parts.push(state.filters.decade);
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
  afterFilterChange();
}

function afterFilterChange() {
  renderGenreChips();
  renderDecadeChips();
  updateFilterSummary();
  syncUrl();
  const song = pickSong();
  if (song) loadCard(song);
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
  const qs = params.toString();
  history.replaceState(null, '', qs ? `?${qs}` : location.pathname);
}

function readUrl() {
  const p = new URLSearchParams(location.search);
  const genre = p.get('genre');
  const decade = p.get('decade');
  if (genre && GENRES[genre]) state.filters.genre = genre;
  if (decade && /^\d{4}s$/.test(decade)) state.filters.decade = decade;
  state.filters.oneHit = p.get('onehit') === '1';
  state.filters.spotifyOnly = p.get('spotify') === '1';
}

/* --------------------------------------------------------------------------
   Rendering – card
   -------------------------------------------------------------------------- */

function renderFrontBingo() {
  const frag = document.createDocumentFragment();
  for (const b of BINGO) {
    const chip = document.createElement('div');
    chip.className = 'mini-chip';
    chip.style.setProperty('--c', b.color);
    chip.title = `${b.side === 'A' ? 'Anfänger' : 'Experten'}: ${b.label}`;
    const dot = document.createElement('span');
    dot.className = 'dot';
    const txt = document.createElement('span');
    txt.className = 'txt';
    txt.textContent = b.short;
    chip.append(dot, txt);
    frag.append(chip);
  }
  el.frontBingo.replaceChildren(frag);
}

function renderAnswers(song) {
  const build = (side, target) => {
    const frag = document.createDocumentFragment();
    for (const b of BINGO.filter((x) => x.side === side)) {
      const li = document.createElement('li');
      const label = document.createElement('span');
      label.textContent = b.label;
      const answer = document.createElement('strong');
      answer.textContent = b.answer(song);
      answer.title = b.answer(song);
      li.append(label, answer);
      frag.append(li);
    }
    target.replaceChildren(frag);
  };
  build('A', el.answersA);
  build('B', el.answersB);
}

function renderMeta(song) {
  const items = [
    ['Album', song.album || '–'],
    ['Dauer', formatDuration(song.duration)],
    ['Besetzung', song.group ? 'Gruppe' : 'Solo'],
    ['Genre', genreLabel(song.genre)],
  ];
  const frag = document.createDocumentFragment();
  for (const [k, v] of items) {
    const div = document.createElement('div');
    const span = document.createElement('span');
    span.textContent = k;
    const strong = document.createElement('strong');
    strong.textContent = v;
    strong.title = v;
    div.append(span, strong);
    frag.append(div);
  }
  el.backMeta.replaceChildren(frag);
}

function renderArt(song) {
  const old = el.backArt.querySelector('img');
  if (old) old.remove();
  if (!song.artUrl) return;
  const img = document.createElement('img');
  img.src = song.artUrl;
  img.alt = `Cover von ${song.title} – ${song.artist}`;
  img.loading = 'lazy';
  img.decoding = 'async';
  img.addEventListener('error', () => img.remove());
  el.backArt.append(img);
}

function loadCard(song) {
  state.current = song;
  state.flipped = false;
  el.card.dataset.flipped = 'false';
  el.card.dataset.genre = song.genre;
  el.card.classList.remove('is-playing');
  document.body.classList.remove('is-playing');
  setFaceAccessibility(false);

  stopAudio();
  el.audio.src = song.streamUrl;
  resetTimer();

  el.frontGenre.textContent = genreLabel(song.genre).toUpperCase();
  el.frontNumber.textContent = `#${song.id.slice(1)}`;
  el.frontSub.textContent = 'Tippe auf die Karte, um den Clip zu starten.';
  el.backGenre.textContent = `${genreLabel(song.genre)} · ${decadeLabel(song.year)}`;
  el.backNumber.textContent = `#${song.id.slice(1)}`;
  el.backYear.textContent = String(song.year);
  el.backDecade.textContent = decadeLabel(song.year);
  el.backTitle.textContent = song.title;
  el.backArtist.textContent = song.artist;

  renderFrontBingo();
  renderAnswers(song);
  renderMeta(song);
  renderArt(song);
  updateFlipButton();

  el.cardWrap.classList.remove('dealing');
  void el.cardWrap.offsetWidth;
  el.cardWrap.classList.add('dealing');

  el.spotifyBtn.disabled = false;
  el.playBtn.disabled = false;
  el.flipBtn.disabled = false;
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

function playClip({ restart = false } = {}) {
  if (!state.current) return;
  if (state.playing) return pauseClip();
  if (restart) {
    try { el.audio.currentTime = 0; } catch { /* ignore */ }
    resetTimer();
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
    showToast('Keine Karte für diese Filter. Setze die Filter zurück.');
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

/* --------------------------------------------------------------------------
   Bingo scorecard
   -------------------------------------------------------------------------- */

function resetBingo(animate = true) {
  const pool = [];
  for (let i = 0; i < 25; i++) pool.push(BINGO[i % BINGO.length]);
  state.bingo.cells = shuffle(pool).map((b) => b.key);
  state.bingo.marked = new Set();
  state.bingo.celebrated = new Set();
  saveBingo();
  renderBingo();
  if (animate) showToast('Neue Bingo-Scorecard – viel Glück!');
}

function renderBingo() {
  const frag = document.createDocumentFragment();
  state.bingo.cells.forEach((key, index) => {
    const def = BINGO.find((b) => b.key === key) || BINGO[0];
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'bingo-cell' + (state.bingo.marked.has(index) ? ' marked' : '');
    cell.dataset.index = String(index);
    cell.style.setProperty('--c', def.color);
    cell.title = `${def.side === 'A' ? 'Anfänger' : 'Experten'}: ${def.label}${state.bingo.marked.has(index) ? ' (markiert)' : ''}`;
    cell.setAttribute('aria-pressed', state.bingo.marked.has(index) ? 'true' : 'false');
    cell.setAttribute('aria-label', `${def.short} – ${def.label}${state.bingo.marked.has(index) ? ', markiert' : ''}`);
    const dot = document.createElement('span');
    dot.className = 'dot';
    const lbl = document.createElement('span');
    lbl.className = 'lbl';
    lbl.textContent = def.short;
    cell.append(dot, lbl);
    cell.addEventListener('click', () => toggleBingo(index));
    frag.append(cell);
  });
  el.bingoBoard.replaceChildren(frag);

  const legend = document.createDocumentFragment();
  for (const b of BINGO) {
    const item = document.createElement('div');
    item.className = 'legend-item';
    item.style.setProperty('--c', b.color);
    const dot = document.createElement('span');
    dot.className = 'dot';
    const label = document.createElement('span');
    label.textContent = `${b.side} · ${b.label}`;
    item.append(dot, label);
    legend.append(item);
  }
  el.bingoLegend.replaceChildren(legend);
}

function toggleBingo(index) {
  if (state.bingo.marked.has(index)) state.bingo.marked.delete(index);
  else state.bingo.marked.add(index);
  saveBingo();
  renderBingo();
  checkBingo();
}

function checkBingo() {
  for (const line of BINGO_LINES) {
    if (!line.every((i) => state.bingo.marked.has(i))) continue;
    const sig = line.join('-');
    if (state.bingo.celebrated.has(sig)) continue;
    state.bingo.celebrated.add(sig);
    for (const i of line) {
      el.bingoBoard.querySelector(`[data-index="${i}"]`)?.classList.add('in-line');
    }
    showToast('BINGO! Fünf in einer Reihe – HITSTER! 🎉', 4200);
    confetti(60);
    setTimeout(() => {
      for (const i of line) el.bingoBoard.querySelector(`[data-index="${i}"]`)?.classList.remove('in-line');
    }, 2800);
  }
}

/* --------------------------------------------------------------------------
   Spotify
   -------------------------------------------------------------------------- */

function openSpotify() {
  const song = state.current;
  if (!song) return;
  el.spotifySong.textContent = `${song.title} – ${song.artist} (${song.year})`;
  el.spotifyOpen.href = song.spotifyUrl;
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
  if (lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus({ preventScroll: true });
}

function closeAllModals() {
  closeModal(el.helpModal);
  closeModal(el.spotifyModal);
}

/* --------------------------------------------------------------------------
   Confetti
   -------------------------------------------------------------------------- */

function confetti(count = 36) {
  const colors = ['#ff2d95', '#7c5cff', '#29e6ff', '#c6ff3d', '#ff9f1c', '#ffffff'];
  const layer = document.createElement('div');
  layer.className = 'confetti-layer';
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

  el.resetStats.addEventListener('click', () => {
    state.stats = { played: 0, flipped: 0, correct: 0, wrong: 0, streak: 0, bestStreak: 0 };
    saveStats();
    renderStats();
    showToast('Statistik zurückgesetzt.');
  });

  el.resetBingo.addEventListener('click', () => resetBingo(true));

  el.volume.addEventListener('input', () => {
    const v = Number(el.volume.value) / 100;
    state.prefs.volume = v;
    state.prefs.soundOn = v > 0;
    applyPrefs();
    savePrefs();
  });

  for (const modal of [el.helpModal, el.spotifyModal]) {
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
    const modalOpen = !el.helpModal.hidden || !el.spotifyModal.hidden;
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
    const song = pickSong();
    if (song) loadCard(song);
  });
}

/* --------------------------------------------------------------------------
   Init
   -------------------------------------------------------------------------- */

async function init() {
  loadStats();
  loadPrefs();
  applyPrefs();
  loadBingo();
  readUrl();
  renderStats();

  try {
    const res = await fetch('/api/catalog', { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    state.catalog = data;
    state.songs = data.songs || [];
    el.catalogPill.textContent = `${data.count} Karten`;
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
  renderBingo();
  renderFrontBingo();
  bindEvents();

  const song = pickSong();
  if (song) {
    loadCard(song);
    state.stats.played += 1;
    saveStats();
    renderStats();
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
  };
}

init();
