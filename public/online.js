/* HITSTER Web – Online-Bingo 1:1 (host-authoritative, PeerJS/WebRTC or BroadcastChannel). */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const NAME_KEY = 'hitster-web-online-name';
const BINGO_MODES = {
  easy: {
    label: 'Einsteiger', side: 'A',
    desc: 'Fünf einfache Kategorien. Perfekt für den ersten Abend.',
    categories: [
      { id: 'solo', label: 'Solo oder Gruppe', short: 'Solo/Gruppe', icon: 'S/G', color: '#ff7aa8', ink: '#2a0715', question: 'Solo oder Gruppe?', type: 'choice', options: [{ value: 'solo', label: 'Solo' }, { value: 'group', label: 'Gruppe' }] },
      { id: 'before2000', label: 'Vor 2000?', short: 'Vor 2000?', icon: '00', color: '#ffd166', ink: '#2d2100', question: 'Erschien der Song vor 2000?', type: 'choice', options: [{ value: 'yes', label: 'Ja' }, { value: 'no', label: 'Nein' }] },
      { id: 'year4', label: '4 Jahre daneben', short: '±4 Jahre', icon: '±4', color: '#6ee7b7', ink: '#05251a', question: 'In welchem Jahr erschien der Song? ±4 zählt.', type: 'year', tolerance: 4 },
      { id: 'decade', label: 'Jahrzehnt', short: 'Jahrzehnt', icon: '10s', color: '#7dd3fc', ink: '#082333', question: 'Aus welchem Jahrzehnt ist der Song?', type: 'decade' },
      { id: 'year2', label: '2 Jahre daneben', short: '±2 Jahre', icon: '±2', color: '#c4a7ff', ink: '#1e1038', question: 'In welchem Jahr erschien der Song? ±2 zählt.', type: 'year', tolerance: 2 }
    ]
  },
  hard: {
    label: 'Expert', side: 'B',
    desc: 'Fünf präzise Kategorien für echte Musiknerds.',
    categories: [
      { id: 'title', label: 'Songtitel', short: 'Titel', icon: 'T', color: '#ff7aa8', ink: '#2a0715', question: 'Wie heißt der Song?', type: 'title' },
      { id: 'year', label: 'Exaktes Jahr', short: 'Exakt', icon: 'J', color: '#ffd166', ink: '#2d2100', question: 'In welchem Jahr erschien der Song?', type: 'year', tolerance: 0 },
      { id: 'artist', label: 'Interpret / Band', short: 'Interpret', icon: 'A', color: '#6ee7b7', ink: '#05251a', question: 'Wer singt oder spielt den Song?', type: 'artist' },
      { id: 'decade', label: 'Jahrzehnt', short: 'Jahrzehnt', icon: '10s', color: '#7dd3fc', ink: '#082333', question: 'Aus welchem Jahrzehnt ist der Song?', type: 'decade' },
      { id: 'year3', label: '3 Jahre daneben', short: '±3 Jahre', icon: '±3', color: '#c4a7ff', ink: '#1e1038', question: 'In welchem Jahr erschien der Song? ±3 zählt.', type: 'year', tolerance: 3 }
    ]
  }
};
const online = {
  role: null, code: '', name: '', transport: null, peerId: '', players: [], connections: new Map(),
  settings: { rounds: 15, timer: 25, markTimer: 12 }, phase: 'lobby', round: 0, category: null, song: null,
  audioUrl: '', startAt: 0, deadline: 0, answers: {}, correct: {}, pending: new Set(), revealAnswers: {},
  votes: {}, choices: { version: '', difficulty: '' }, card: null, marked: new Set(), answer: null,
  submitted: false, winner: null, recent: [], recentCategories: [], audioBlocked: false, audioUnlocked: false,
  screen: null, localMode: new URLSearchParams(location.search).has('localonline'), markDeadline: 0, wheelKey: '', wheelAngle: 0, audioError: '', audioPending: false, audioPlaying: false, audioFallbackTried: false, warningKey: '',
  timers: { phase: null, audio: null, round: null, tick: null, mark: null, countdown: null, next: null }
};
const api = () => window.HITSTER;
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cleanCode = (v) => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
const cleanName = (v) => String(v || '').replace(/[<>&"']/g, '').replace(/\s+/g, ' ').trim().slice(0, 18);
const roomId = (code) => `hitster-bingo-${String(code).toLowerCase()}`;
const randomCode = () => [...crypto.getRandomValues(new Uint8Array(6))].map((b) => ALPHABET[b % ALPHABET.length]).join('');
const shuffle = (list) => { const out = [...list]; for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; } return out; };
const myId = () => (online.role === 'host' ? 'host' : online.peerId);
const categoriesFor = (difficulty) => BINGO_MODES[difficulty]?.categories || BINGO_MODES.easy.categories;
const categoryById = (id) => categoriesFor(online.choices.difficulty || 'easy').find((c) => c.id === id) || null;
const publicCategory = (c) => c ? { id: c.id, label: c.label, short: c.short, icon: c.icon, color: c.color, ink: c.ink, question: c.question, type: c.type, options: c.options || [], tolerance: c.tolerance ?? null } : null;
const decadeOf = (year) => `${Math.floor(Number(year) / 10) * 10}s`;
const decadeLabel = (key) => String(key || '').replace(/s$/, 'er');
const versionLabel = (id) => api()?.versions?.[id]?.label || 'Version';
const difficultyLabel = (id) => (id === 'hard' ? 'Expert' : 'Einsteiger');
const publicPlayers = () => online.players.map((p) => ({ id: p.id, name: p.name, connected: p.connected !== false, score: p.score || 0, bingo: Boolean(p.bingo), marked: [...(p.marked || [])], correct: Boolean(online.correct[p.id]), pending: Boolean(online.pending?.has(p.id)) }));
const publicState = () => ({
  code: online.code, phase: online.phase, round: online.round, settings: online.settings,
  players: publicPlayers(), votes: online.votes, winner: online.winner,
  category: publicCategory(online.category), choices: online.choices,
  answersCount: Object.keys(online.answers || {}).length, startIn: online.startAt ? Math.max(0, online.startAt - Date.now()) : null,
  deadline: online.deadline || null, timer: online.settings.timer, markDeadline: online.markDeadline || null, markTimer: online.settings.markTimer, versionLabel: versionLabel(online.choices.version || 'party'),
  difficulty: online.choices.difficulty || '', difficultyLabel: difficultyLabel(online.choices.difficulty || 'easy')
});
const isPlayable = (song) => Boolean(song?.previewUrl || song?.itunesId || song?.deezerId || song?.spotifyId || song?.streamUrl);
const audioUrl = (song) => song?.previewUrl || ((api()?.API_BASE || '') ? `${api().API_BASE}/api/audio/${song.id}` : (song?.streamUrl || ''));
const spotifyLink = (song) => song?.spotifyId && /^[A-Za-z0-9]{22}$/.test(song.spotifyId) ? `https://open.spotify.com/track/${song.spotifyId}` : `https://open.spotify.com/search/${encodeURIComponent(`${song?.title || ''} ${song?.artist || ''}`.trim())}`;
function makeBingoCard(difficulty) {
  const ids = categoriesFor(difficulty).map((c) => c.id);
  const remaining = new Map(ids.map((id) => [id, 5]));
  const rowCounts = Array.from({ length: 5 }, () => new Map());
  const colCounts = Array.from({ length: 5 }, () => new Map());
  const cells = Array(25).fill(null);
  const canPlace = (id, row, col) => (remaining.get(id) || 0) > 0
    && (rowCounts[row].get(id) || 0) < 2
    && (colCounts[col].get(id) || 0) < 2;
  const place = (pos) => {
    if (pos === 25) return true;
    const row = Math.floor(pos / 5), col = pos % 5;
    const options = shuffle(ids.filter((id) => canPlace(id, row, col)));
    for (const id of options) {
      cells[pos] = id;
      remaining.set(id, remaining.get(id) - 1);
      rowCounts[row].set(id, (rowCounts[row].get(id) || 0) + 1);
      colCounts[col].set(id, (colCounts[col].get(id) || 0) + 1);
      if (place(pos + 1)) return true;
      remaining.set(id, remaining.get(id) + 1);
      rowCounts[row].set(id, rowCounts[row].get(id) - 1);
      colCounts[col].set(id, colCounts[col].get(id) - 1);
      cells[pos] = null;
    }
    return false;
  };
  if (place(0)) return cells;
  const order = shuffle(ids), offset = Math.floor(Math.random() * 5);
  return Array.from({ length: 25 }, (_, i) => order[(Math.floor(i / 5) + (i % 5) + offset) % 5]);
}
function hasBingo(marked) {
  for (let r = 0; r < 5; r++) if ([0, 1, 2, 3, 4].every((c) => marked.has(r * 5 + c))) return true;
  for (let c = 0; c < 5; c++) if ([0, 1, 2, 3, 4].every((r) => marked.has(r * 5 + c))) return true;
  return [0, 6, 12, 18, 24].every((i) => marked.has(i)) || [4, 8, 12, 16, 20].every((i) => marked.has(i));
}
function normalizeText(value) {
  return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\([^)]*\)|\[[^\]]*\]/g, ' ').replace(/\b(feat|ft|featuring|with|vs)\.?\b.*$/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
}
function similarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.92;
  const m = a.length, n = b.length, dp = Array.from({ length: m + 1 }, (_, i) => [i]);
  for (let j = 1; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return 1 - dp[m][n] / Math.max(m, n);
}
const CURRENT_YEAR = new Date().getFullYear();
function expandYear(raw) {
  const digits = String(raw ?? '').replace(/[^0-9]/g, '');
  if (!digits || digits.length > 4) return null;
  let year = Number(digits);
  if (digits.length <= 2) {
    const century = Math.floor(CURRENT_YEAR / 100) * 100;
    year = year <= CURRENT_YEAR % 100 ? century + year : century - 100 + year;
  }
  return year >= 1000 && year <= 2100 ? year : null;
}
function isCorrect(category, song, raw) {
  const value = String(raw ?? '').trim();
  if (!category || !song || !value) return false;
  if (category.type === 'choice') return value === (category.id === 'solo' ? (song.group ? 'group' : 'solo') : (song.year < 2000 ? 'yes' : 'no'));
  if (category.type === 'year') { const year = expandYear(value); return year != null && Math.abs(year - Number(song.year)) <= (category.tolerance || 0); }
  if (category.type === 'decade') {
    const full = value.match(/(19|20)\d{2}/)?.[0];
    const year = expandYear(full || value);
    return year != null && decadeOf(year) === decadeOf(song.year);
  }
  if (category.type === 'title') return similarity(normalizeText(value), normalizeText(song.title)) >= 0.8;
  if (category.type === 'artist') {
    const target = normalizeText(song.artist), answer = normalizeText(value);
    if (similarity(answer, target) >= 0.78) return true;
    const parts = target.split(/\s+(?:and|und|x|&|,)\s+|,|\s+feat\s+/).filter(Boolean);
    return parts.some((part) => part.length > 2 && similarity(answer, part) >= 0.84);
  }
  return false;
}
function formatAnswer(category, raw) {
  if (raw == null || raw === '') return '—';
  if (category?.type === 'choice') return category.options.find((o) => o.value === raw)?.label || String(raw);
  if (category?.type === 'decade') { const full = String(raw).match(/(19|20)\d{2}/)?.[0]; const year = expandYear(full || raw); return year != null ? decadeLabel(decadeOf(year)) : String(raw); }
  if (category?.type === 'year') { const year = expandYear(raw); return year != null ? String(year) : String(raw); }
  return String(raw);
}
function send(type, payload = {}, to = null) {
  if (!online.transport) return;
  const message = { type, payload, from: online.peerId };
  if (to) online.transport.sendTo(to, message); else online.transport.broadcast(message);
}
const sendTo = (id, type, payload = {}) => send(type, payload, id);
function showError(message) { const box = $('#onlineError'); if (box) box.textContent = message || ''; if (message) api()?.showToast(message, 4200); }

class BroadcastTransport {
  constructor(code, role, onMessage) {
    this.role = role; this.id = `${role}-${crypto.randomUUID?.() || Math.random().toString(36).slice(2)}`;
    this.channel = new BroadcastChannel(roomId(code)); this.onMessage = onMessage;
    this.channel.onmessage = (event) => {
      const data = event.data;
      if (!data || data.from === this.id) return;
      if (this.role !== 'host' && data.to && data.to !== this.id) return;
      this.onMessage(data, data.from);
    };
  }
  sendTo(id, message) { this.channel.postMessage({ ...message, from: this.id, to: id }); }
  broadcast(message) { this.channel.postMessage({ ...message, from: this.id }); }
  close() { this.channel.close(); }
}
class PeerTransport {
  constructor(code, role, onMessage) {
    this.role = role; this.onMessage = onMessage; this.connections = new Map(); this.hostId = roomId(code);
    this.peer = new Peer(role === 'host' ? this.hostId : undefined, { debug: 1 });
    this.id = this.hostId;
    this.ready = new Promise((resolve, reject) => {
      this.peer.on('open', (id) => {
        this.id = id;
        if (role === 'player') this._attach(this.peer.connect(this.hostId, { reliable: true }), this.hostId, true);
        resolve(id);
      });
      this.peer.on('error', (err) => { reject(err); this.onMessage({ type: '_error', payload: { message: err.message || String(err) } }, null); });
    });
    if (role === 'host') this.peer.on('connection', (conn) => { this._attach(conn, conn.peer, false); this.onMessage({ type: '_peer', payload: { id: conn.peer } }, conn.peer); });
  }
  _attach(conn, id, isHostConnection) {
    this.connections.set(id, conn);
    conn.on('data', (data) => this.onMessage(data, id));
    conn.on('open', () => { if (isHostConnection) this.onMessage({ type: '_open', payload: {} }, this.hostId); });
    conn.on('close', () => { this.connections.delete(id); this.onMessage({ type: '_close', payload: { id } }, id); });
    conn.on('error', (err) => this.onMessage({ type: '_error', payload: { message: err.message } }, id));
  }
  sendTo(id, message) { const conn = this.connections.get(id); if (conn?.open) conn.send(message); }
  broadcast(message) { for (const conn of this.connections.values()) if (conn.open) conn.send(message); }
  close() { try { this.peer.destroy(); } catch { /* ignore */ } this.connections.clear(); }
}
function createTransport(code, role, onMessage) {
  if (online.localMode || typeof Peer === 'undefined') return new BroadcastTransport(code, role, onMessage);
  return new PeerTransport(code, role, onMessage);
}

function buildScreen() {
  if (online.screen) return online.screen;
  const section = document.createElement('section');
  section.className = 'online-screen'; section.id = 'onlineScreen'; section.hidden = true;
  section.innerHTML = `
    <header class="online-top">
      <button class="btn btn-ghost btn-small online-back" id="onlineBack" type="button">← Startseite</button>
      <div class="online-wordmark"><span>HITSTER</span><strong>BINGO</strong><small>ONLINE</small></div>
      <div class="online-top-actions">
        <button class="online-text-btn" id="onlineHowBtn" type="button">Spielregeln</button>
        <div class="online-room-badge" id="onlineRoomBadge" hidden><span>RAUM</span><strong id="onlineRoomCode"></strong><button id="onlineCopyCode" type="button" aria-label="Raum-Code kopieren">Kopieren</button></div>
      </div>
    </header>

    <div class="online-lobby" id="onlineLobby">
      <div class="online-hero">
        <div class="online-hero-copy">
          <span class="online-kicker">DIE MUSIKPARTY FÜR DEINE RUNDE</span>
          <h1>HITSTER <em>BINGO</em></h1>
          <p>Discokugel drehen, Song hören, Antwort eintippen. Wer zuerst eine Reihe auf seiner Farbkarte voll hat, ruft <strong>BINGO</strong>.</p>
          <div class="online-hero-chips"><span>4.860 Hits</span><span>5 Farben</span><span>2–10 Spieler</span><span>ohne Login</span></div>
          <div class="online-hero-actions"><button class="online-cta" id="onlineScrollHost" type="button">Raum erstellen <span>→</span></button><button class="online-cta online-cta-ghost" id="onlineScrollJoin" type="button">Raum beitreten</button></div>
        </div>
        <div class="online-hero-art" aria-hidden="true">
          <div class="online-orbit online-orbit-a"></div><div class="online-orbit online-orbit-b"></div>
          <div class="online-hero-ball"><i></i><b></b><span>H</span></div>
          <div class="online-hero-note note-a">POP</div><div class="online-hero-note note-b">2000s</div><div class="online-hero-note note-c">BINGO!</div>
        </div>
      </div>

      <div class="online-lobby-grid">
        <form class="online-card online-form online-create" id="onlineHostForm">
          <div class="online-create-head"><span class="online-step">01</span><div><span class="online-kicker">HOST-MODUS</span><h2>Raum erstellen</h2><p>Du bist der DJ. Teile den Code, alle anderen kommen dazu.</p></div><span class="online-create-live"><i></i>LIVE</span></div>
          <label class="online-name-field"><span>Dein Name</span><div class="online-input-wrap"><span class="online-input-icon">@</span><input id="onlineHostName" maxlength="18" autocomplete="nickname" required placeholder="z. B. Alex" /></div></label>
          <div class="online-setup-label"><span>SPIEL-SETUP</span><small>Du legst die Regie fest</small></div>
          <div class="online-field-grid">
            <label class="online-setting"><span class="online-setting-icon">↻</span><span><b>Runden</b><select id="onlineRounds"><option value="10">10 Runden</option><option value="15" selected>15 Runden</option><option value="20">20 Runden</option></select></span></label>
            <label class="online-setting"><span class="online-setting-icon">◷</span><span><b>Antwortzeit</b><select id="onlineTimerSelect"><option value="15">15 Sekunden</option><option value="25" selected>25 Sekunden</option><option value="35">35 Sekunden</option></select></span></label>
            <label class="online-setting"><span class="online-setting-icon">✦</span><span><b>Kreuzen</b><select id="onlineMarkTimerSelect"><option value="6">6 Sekunden</option><option value="10">10 Sekunden</option><option value="12" selected>12 Sekunden</option><option value="20">20 Sekunden</option></select></span></label>
          </div>
          <div class="online-create-note"><span>✦</span><p><strong>Danach entscheidet ihr gemeinsam:</strong> Version und Schwierigkeit. Der Rest läuft automatisch.</p></div>
          <button class="btn btn-primary btn-wide online-create-btn" type="submit"><span>Raum erstellen</span><span>→</span></button>
          <p class="online-error" id="onlineError" role="alert"></p>
        </form>

        <form class="online-card online-form online-join" id="onlineJoinForm">
          <div class="online-card-head"><span class="online-step">02</span><div><h2>Raum beitreten</h2><p>Mit Code oder Einladungslink.</p></div></div>
          <label>Dein Name<input id="onlineJoinName" maxlength="18" autocomplete="nickname" required placeholder="z. B. Sam" /></label>
          <label>Raum-Code<input id="onlineJoinCode" maxlength="6" autocapitalize="characters" autocomplete="off" required placeholder="ABC123" /></label>
          <button class="btn btn-accent btn-wide" type="submit">Beitreten →</button>
          <p class="online-hint">Den Code findest du im Einladungslink oder im QR-Code des Hosts.</p>
          <div class="online-join-note"><span>✓</span><span><strong>Kein Login nötig</strong><small>Einfach Code eingeben – dein Name genügt.</small></span></div>
        </form>
      </div>

      <div class="online-steps">
        <div class="online-step-card"><span class="online-step-num">01</span><strong>1. Drehen</strong><p>Die Discokugel wählt eine Kategorie – für alle gleich.</p></div>
        <div class="online-step-card"><span class="online-step-num">02</span><strong>2. Hören &amp; tippen</strong><p>Der Song läuft bei allen gleichzeitig. 25 Sekunden für die Antwort.</p></div>
        <div class="online-step-card"><span class="online-step-num">03</span><strong>3. Kreuzen</strong><p>Richtig? Setze dein Kreuz auf ein Feld in der Kategoriefarbe.</p></div>
        <div class="online-step-card"><span class="online-step-num">04</span><strong>4. Bingo</strong><p>Die erste vollständige Reihe gewinnt – waagerecht, senkrecht oder diagonal.</p></div>
      </div>
    </div>

    <div id="onlineRoom" hidden>
      <div class="online-room-head">
        <div class="online-room-code"><span>RAUM-CODE</span><strong id="onlineRoomCodeBig">------</strong><button class="online-text-btn" id="onlineCopyCodeBig" type="button">Code kopieren</button></div>
        <div class="online-invite"><label for="onlineInvite">Einladungslink</label><div class="online-invite-row"><input id="onlineInvite" readonly aria-label="Einladungslink" /><button class="btn btn-ghost btn-small" id="onlineCopy" type="button">Link kopieren</button><button class="online-qr-toggle" id="onlineQrToggle" type="button" aria-label="QR-Code anzeigen">QR</button></div><img class="online-qr" id="onlineQr" alt="QR-Code zum Online-Raum" hidden /></div>
      </div>

      <div class="online-grid">
        <aside class="online-side">
          <div class="online-card online-players-card"><div class="online-card-head"><h3>Spieler <span class="panel-count" id="onlinePlayerCount">0</span></h3><span class="online-live-dot" title="Live verbunden"></span></div><ul class="online-players" id="onlinePlayers"></ul><div class="online-reactions" id="onlineReactions" aria-label="Reaktionen"><button type="button" data-reaction="☺" aria-label="Lächeln">☺</button><button type="button" data-reaction="♥" aria-label="Herz">♥</button><button type="button" data-reaction="★" aria-label="Stern">★</button><button type="button" data-reaction="!" aria-label="Überraschung">!</button><button type="button" data-reaction="♪" aria-label="Musik">♪</button></div></div>
          <div class="online-card" id="onlineHostControls"><h3>Host</h3><p class="online-hint" id="onlineHostHint">Lade Spieler ein und starte dann die Abstimmung.</p><button class="btn btn-primary btn-wide" id="onlineStart" type="button">Spiel vorbereiten</button></div>
                  </aside>

        <main class="online-main">
          <div class="online-panel online-waiting" id="onlineWaiting"><span class="online-waiting-icon">H</span><h2 id="onlineWaitingTitle">Raum ist offen</h2><p class="online-hint" id="onlineWaitingText">Teile den Link. Sobald alle da sind, startet der Host die Abstimmung.</p><div class="online-toast" id="onlineStatus" aria-live="polite"></div></div>

          <section class="online-setup" id="onlineSetup" hidden>
            <div class="online-setup-head"><span class="online-kicker">SPIELVORBEREITUNG</span><h2>Was spielt ihr heute?</h2><p>Jede Stimme zählt. Version und Schwierigkeit wählt die ganze Runde – nicht nur der Host.</p></div>
            <div class="online-setup-block"><div class="online-block-head"><h3>Version</h3><span id="onlineVersionVoteCount"></span></div><div class="online-vote-grid" id="onlineVersionVote"></div></div>
            <div class="online-setup-block"><div class="online-block-head"><h3>Schwierigkeit</h3><span id="onlineDifficultyVoteCount"></span></div><div class="online-difficulty-grid" id="onlineDifficultyVote"></div></div>
            <div class="online-vote-footer"><div id="onlineVoteProgress" class="online-vote-progress"></div><button class="btn btn-ghost" id="onlineForceStart2" type="button" hidden>Ohne Warten starten</button></div>
            <div class="online-vote-result" id="onlineVoteResult" hidden></div>
          </section>

          <section class="online-game" id="onlineGame" hidden>
            <div class="online-roundbar">
              <div class="online-round-title"><span class="online-kicker">RUNDE</span><strong id="onlineRoundLabel">1 / 15</strong></div>
              <span class="online-pill" id="onlineVersionLabel"></span><span class="online-pill" id="onlineDifficultyLabel"></span>
              <div class="online-timer" id="onlineTimer">25<small>s</small></div>
            </div>
            <div class="online-game-grid">
              <div class="online-game-main">
                <div class="online-spin-card">
                  <div class="online-wheel" id="onlineWheel" aria-hidden="true"><div class="online-wheel-disc" id="onlineWheelDisc"><span class="online-wheel-lines"></span></div><div class="online-wheel-pointer"></div><div class="online-wheel-hub"><div class="online-disco" id="onlineDisco"><div class="online-disco-shine"></div><div class="online-disco-grid"></div><span class="online-disco-letter">H</span></div></div></div>
                  <div class="online-category-card" id="onlineCategoryCard"><span class="online-kicker">KATEGORIE</span><strong id="onlineCategoryLabel">Dreht …</strong><small id="onlineCategoryQuestion">Die Discokugel entscheidet.</small></div>
                </div>
                <div class="online-audio" id="onlineAudio" hidden><button class="online-play" id="onlinePlay" type="button" aria-label="Song abspielen"><svg><use href="#i-play"></use></svg></button><div class="online-audio-copy"><strong id="onlineAudioTitle">Song für alle</strong><small id="onlineAudioHint">Gleich geht es los.</small></div><div class="online-progress"><i id="onlineProgress"></i></div></div>
                <div class="online-audio-gate" id="onlineAudioGate" hidden><div><strong>Ton ist blockiert</strong><small id="onlineAudioGateHint">Dein Browser braucht einen Tipp, damit der Song startet.</small></div><button class="online-audio-gate-btn" id="onlineAudioGateBtn" type="button">Ton aktivieren</button></div>
                <div class="online-answer" id="onlineAnswerBox" hidden></div>
                <div class="online-toast" id="onlineGameStatus" aria-live="polite"></div>
                <div class="online-reveal" id="onlineReveal" hidden></div>
              </div>
              <aside class="online-card-panel">
                <div class="online-card-head"><div><span class="online-kicker">DEINE KARTE</span><strong id="onlineCardName">Bingo</strong></div><span id="onlineCardProgress">0 / 25</span></div>
                <div class="online-mark-timer" id="onlineMarkTimer" hidden></div>
                <div class="online-bingo" id="onlineBingo" aria-label="Bingo-Karte"></div>
                <div class="online-legend" id="onlineLegend"></div>
                <details class="online-leaderboard" id="onlineLeaderboard"><summary><span>Rangliste</span><b id="onlineLeaderboardSummary">0 Pkt.</b></summary><div class="online-score" id="onlineScore"></div></details>
              </aside>
            </div>
          </section>
        </main>
      </div>
    </div>

    <div class="online-modal" id="onlineRulesModal" hidden><div class="online-modal-card" role="dialog" aria-modal="true" aria-labelledby="onlineRulesTitle"><button class="online-modal-close" id="onlineRulesClose" type="button" aria-label="Schließen">×</button><span class="online-kicker">SO FUNKTIONIERT'S</span><h2 id="onlineRulesTitle">Hitster Bingo</h2><p>Eine Person ist DJ. Alle anderen spielen mit. Die Discokugel zeigt eine Kategorie, der Song läuft für alle gleichzeitig, und ihr tippt eure Antwort ein.</p><div class="online-rules-grid"><div><h3>Einsteiger · Seite A</h3><ul>${BINGO_MODES.easy.categories.map((c) => `<li><i style="--c:${c.color}"></i><strong>${esc(c.label)}</strong><span>${esc(c.question)}</span></li>`).join('')}</ul></div><div><h3>Expert · Seite B</h3><ul>${BINGO_MODES.hard.categories.map((c) => `<li><i style="--c:${c.color}"></i><strong>${esc(c.label)}</strong><span>${esc(c.question)}</span></li>`).join('')}</ul></div></div><p class="online-hint">Richtig? Dann setzt du ein Kreuz auf ein freies Feld in der Farbe der Kategorie. Wer zuerst fünf in einer Reihe hat – waagerecht, senkrecht oder diagonal – gewinnt.</p></div></div>
    <div class="online-toast" id="onlineGlobalStatus" aria-live="polite"></div>`;
  document.body.append(section); online.screen = section;
  section.addEventListener('submit', (event) => {
    if (event.target.id === 'onlineAnswerForm') { event.preventDefault(); submitAnswer($('#onlineAnswerInput')?.value ?? ''); }
  });
  section.addEventListener('click', (event) => {
    const answer = event.target.closest('[data-answer]'); if (answer) return submitAnswer(answer.dataset.answer);
    const version = event.target.closest('[data-vote-version]'); if (version) return submitVote(version.dataset.voteVersion, online.votes[myId()]?.difficulty || 'easy');
    const difficulty = event.target.closest('[data-vote-difficulty]'); if (difficulty) return submitVote(online.votes[myId()]?.version || 'party', difficulty.dataset.voteDifficulty);
    const cell = event.target.closest('#onlineBingo button[data-index]'); if (cell) return onCellClick(Number(cell.dataset.index));
  });
  $('#onlineBack', section).addEventListener('click', close);
  $('#onlineHostForm', section).addEventListener('submit', onCreateRoom);
  $('#onlineJoinForm', section).addEventListener('submit', onJoinRoom);
  $('#onlineStart', section).addEventListener('click', primaryAction);
  $('#onlineForceStart2', section).addEventListener('click', finishVotes);
  $('#onlineCopy', section).addEventListener('click', () => copyText($('#onlineInvite').value, 'Einladungslink kopiert.'));
  $('#onlineCopyCode', section).addEventListener('click', () => copyText(online.code, 'Raum-Code kopiert.'));
  $('#onlineCopyCodeBig', section).addEventListener('click', () => copyText(online.code, 'Raum-Code kopiert.'));
  $('#onlineQrToggle', section).addEventListener('click', () => { const qr = $('#onlineQr'); qr.hidden = !qr.hidden; });
  $('#onlineHowBtn', section).addEventListener('click', () => { $('#onlineRulesModal').hidden = false; });
  $('#onlineRulesClose', section).addEventListener('click', () => { $('#onlineRulesModal').hidden = true; });
  $('#onlineRulesModal', section).addEventListener('click', (event) => { if (event.target.id === 'onlineRulesModal') event.currentTarget.hidden = true; });
  $('#onlinePlay', section).addEventListener('click', playOnlineAudio);
  $('#onlineAudioGateBtn', section).addEventListener('click', playOnlineAudio);
  section.addEventListener('pointerdown', unlockAudio, { passive: true });
  $('#onlineScrollHost', section).addEventListener('click', () => $('#onlineHostName')?.focus());
  $('#onlineScrollJoin', section).addEventListener('click', () => $('#onlineJoinName')?.focus());
  $('#onlineReactions', section).addEventListener('click', (event) => { const button = event.target.closest('[data-reaction]'); if (button) { send('reaction', { emoji: button.dataset.reaction }); showReaction(button.dataset.reaction, online.name); } });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !$('#onlineRulesModal')?.hidden) $('#onlineRulesModal').hidden = true; });
  return section;
}
function showScreen() { buildScreen(); online.screen.hidden = false; document.body.classList.add('online-active', 'started'); document.body.style.overflow = ''; }
function resetWheel() { online.wheelKey = ''; online.wheelAngle = 0; const wheel = $('#onlineWheel'); if (wheel) wheel.style.setProperty('--wheel-end', '0deg'); $('#onlineWheelDisc')?.classList.remove('is-spinning'); }
function close() {
  online.transport?.close(); online.transport = null; online.role = null; online.phase = 'lobby'; stopTimers();
  onlineAudio?.pause();
  if (online.screen) online.screen.hidden = true;
  document.body.classList.remove('online-active', 'started');
  const url = new URL(location.href); url.searchParams.delete('online'); url.searchParams.delete('play');
  history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`); window.scrollTo({ top: 0, behavior: 'smooth' });
}
function open(prefillCode = '') {
  if (!api()?.state?.songs?.length) { setTimeout(() => open(prefillCode), 350); return; }
  online.transport?.close(); online.transport = null; online.role = null; online.phase = 'lobby';
  resetWheel(); showScreen(); online.name = localStorage.getItem(NAME_KEY) || '';
  $('#onlineHostName').value = online.name; $('#onlineJoinName').value = online.name;
  $('#onlineLobby').hidden = false; $('#onlineRoom').hidden = true; $('#onlineSetup').hidden = true; $('#onlineGame').hidden = true;
  $('#onlineRoomBadge').hidden = true; $('#onlineError').textContent = ''; $('#onlineQr').hidden = true;
  if (prefillCode) { $('#onlineJoinCode').value = cleanCode(prefillCode); $('#onlineJoinName').focus(); } else $('#onlineHostName').focus();
  unlockAudio();
}

function readSettings() {
  return { rounds: Number($('#onlineRounds').value) || 15, timer: Number($('#onlineTimerSelect').value) || 25, markTimer: Number($('#onlineMarkTimerSelect').value) || 12 };
}
function onCreateRoom(event) {
  event.preventDefault(); unlockAudio();
  const name = cleanName($('#onlineHostName').value);
  if (!name) return showError('Bitte gib deinen Namen ein.');
  localStorage.setItem(NAME_KEY, name); online.name = name; online.role = 'host'; online.code = randomCode();
  online.settings = readSettings(); online.players = []; online.connections = new Map(); online.phase = 'lobby';
  resetWheel(); online.round = 0; online.answers = {}; online.correct = {}; online.pending = new Set(); online.votes = {};
  online.choices = { version: '', difficulty: '' }; online.winner = null; online.recent = []; online.recentCategories = [];
  const player = { id: 'host', name, connected: true, score: 0, card: null, marked: new Set(), bingo: false, correct: false };
  online.players.push(player); online.card = null; online.marked = player.marked;
  try {
    online.transport = createTransport(online.code, 'host', handleMessage); online.peerId = 'host';
    if (online.transport instanceof PeerTransport) online.transport.ready.then((id) => { online.peerId = id; }).catch((err) => showError(`Verbindung fehlgeschlagen: ${err.message || err}`));
  } catch (err) { return showError(`Raum konnte nicht erstellt werden: ${err.message || err}`); }
  showRoom(); broadcastState();
}
function onJoinRoom(event) {
  event.preventDefault(); unlockAudio();
  const name = cleanName($('#onlineJoinName').value), code = cleanCode($('#onlineJoinCode').value);
  if (!name) return showError('Bitte gib deinen Namen ein.');
  if (code.length !== 6) return showError('Der Raum-Code hat 6 Zeichen.');
  localStorage.setItem(NAME_KEY, name); online.name = name; online.role = 'player'; online.code = code;
  online.phase = 'lobby'; online.players = []; online.connections = new Map(); online.card = null; online.marked = new Set();
  try {
    online.transport = createTransport(code, 'player', handleMessage); online.peerId = online.transport.id || 'player';
    if (online.transport instanceof PeerTransport) online.transport.ready.then((id) => { online.peerId = id; send('join', { name }); }).catch((err) => showError(`Raum nicht erreichbar: ${err.message || err}`));
    else send('join', { name });
  } catch (err) { return showError(`Beitritt fehlgeschlagen: ${err.message || err}`); }
  showRoom(); $('#onlineWaitingTitle').textContent = 'Verbinde mit dem Raum …'; $('#onlineWaitingText').textContent = 'Gleich geht es los.';
}
function handleMessage(message, from) {
  if (!message?.type) return;
  if (message.type === '_error') return showError(message.payload?.message || 'Verbindungsfehler');
  if (message.type === '_peer') { if (online.role === 'host') online.connections.set(from, from); return; }
  if (message.type === '_close') { if (online.role === 'host') { const p = online.players.find((e) => e.id === from); if (p) { p.connected = false; broadcastState(); maybeRevealEarly(); } } return; }
  if (message.type === '_open') { if (online.role === 'player') send('join', { name: online.name }); return; }
  if (online.role === 'host') return handleHostMessage(message, from);
  return handlePlayerMessage(message);
}
function handleHostMessage(message, from) {
  if (message.type === 'join') {
    const name = cleanName(message.payload?.name) || 'Gast';
    let player = online.players.find((p) => p.id === from);
    if (!player && online.players.length >= 10) { sendTo(from, 'full', {}); return; }
    if (!player) { player = { id: from, name, connected: true, score: 0, card: null, marked: new Set(), bingo: false, correct: false }; online.players.push(player); }
    player.name = name; player.connected = true;
    if (!player.card && online.choices.difficulty && ['countdown', 'spinning', 'playing', 'reveal', 'ended'].includes(online.phase)) player.card = makeBingoCard(online.choices.difficulty);
    sendTo(from, 'welcome', { id: from, code: online.code, name: online.name, card: player.card, settings: online.settings, players: publicPlayers(), phase: online.phase, votes: online.votes, choices: online.choices, category: publicCategory(online.category), round: online.round, winner: online.winner, correct: online.correct, markDeadline: online.markDeadline });
    broadcastState(); return;
  }
  if (message.type === 'answer' && online.phase === 'playing') {
    const value = String(message.payload?.value ?? '').slice(0, 80).trim();
    if (value) { online.answers[from] = { value, at: Date.now() }; broadcastState(); maybeRevealEarly(); }
    return;
  }
  if (message.type === 'vote' && online.phase === 'setup') {
    const version = String(message.payload?.version || ''), difficulty = String(message.payload?.difficulty || '');
    if (api()?.versions?.[version] && BINGO_MODES[difficulty]) { online.votes[from] = { version, difficulty }; broadcastState(); if (allVoted()) setTimeout(finishVotes, 450); }
    return;
  }
  if (message.type === 'mark' && online.phase === 'reveal') { hostMark(from, Number(message.payload?.index)); return; }
  if (message.type === 'reaction') {
    const emoji = String(message.payload?.emoji || '').slice(0, 4), player = online.players.find((p) => p.id === from);
    if (emoji) { send('reaction', { emoji, name: player?.name || 'Gast' }); showReaction(emoji, player?.name || 'Gast'); }
  }
}
function handlePlayerMessage(message) {
  if (message.type === 'welcome') {
    online.peerId = message.payload?.id || online.peerId; online.code = message.payload?.code || online.code;
    online.settings = message.payload?.settings || online.settings; online.players = message.payload?.players || [];
    online.phase = message.payload?.phase || 'lobby'; online.votes = message.payload?.votes || {};
    online.choices = message.payload?.choices || online.choices; online.category = message.payload?.category || online.category;
    online.round = message.payload?.round || online.round; online.winner = message.payload?.winner || null;
    online.correct = message.payload?.correct || {}; online.markDeadline = message.payload?.markDeadline || 0;
    online.pending = new Set((online.players || []).filter((p) => p.pending).map((p) => p.id));
    if (message.payload?.card) online.card = message.payload.card;
    const mine = online.players.find((p) => p.id === online.peerId); if (mine?.marked) online.marked = new Set(mine.marked);
    showRoom(); render(); return;
  }
  if (message.type === 'cards') {
    online.card = message.payload?.card || online.card; online.marked = new Set(); online.submitted = false; online.answer = null;
    render(); return;
  }
  if (message.type === 'state') {
    const next = message.payload || {};
    online.phase = next.phase || online.phase; online.round = next.round || online.round;
    online.settings = next.settings || online.settings; online.players = next.players || online.players;
    online.votes = next.votes || {}; online.winner = next.winner || null; online.choices = next.choices || online.choices;
    online.category = next.category || online.category; online.correct = next.players ? Object.fromEntries(next.players.map((p) => [p.id, Boolean(p.correct)])) : online.correct;
    online.pending = new Set((online.players || []).filter((p) => p.pending).map((p) => p.id));
    if (next.deadline) online.deadline = next.deadline;
    if (next.markDeadline) online.markDeadline = next.markDeadline;
    const mine = online.players.find((p) => p.id === online.peerId); if (mine?.marked) online.marked = new Set(mine.marked);
    render(); return;
  }
  if (message.type === 'round') { applyRound(message.payload || {}); return; }
  if (message.type === 'reveal') {
    stopTimers(); online.phase = message.payload?.phase || 'reveal'; online.winner = message.payload?.winner || null;
    online.category = message.payload?.category || online.category; online.song = message.payload?.song || online.song;
    online.correct = message.payload?.correct || {}; online.revealAnswers = message.payload?.answers || {}; online.markDeadline = message.payload?.markDeadline || online.markDeadline;
    if (message.payload?.players) online.players = message.payload.players;
    online.pending = new Set((online.players || []).filter((p) => p.pending).map((p) => p.id));
    const mine = online.players.find((p) => p.id === online.peerId); if (mine?.marked) online.marked = new Set(mine.marked);
    render(); return;
  }
  if (message.type === 'ended') { stopTimers(); online.phase = 'ended'; online.winner = message.payload?.winner || null; if (message.payload?.players) online.players = message.payload.players; render(); return; }
  if (message.type === 'full') { showError('Dieser Raum ist voll (maximal 10 Spieler).'); return; }
  if (message.type === 'reaction') showReaction(message.payload?.emoji, message.payload?.name || 'Gast');
}

function primaryAction() {
  if (online.role !== 'host') return;
  unlockAudio();
  if (online.phase === 'lobby' || online.phase === 'ended') return startSetup();
  if (online.phase === 'setup') return finishVotes();
  if (online.phase === 'reveal') return beginRound();
}
function startSetup() {
  if (online.role !== 'host') return;
  stopTimers(); resetWheel();
  online.phase = 'setup'; online.round = 0; online.votes = {}; online.choices = { version: '', difficulty: '' };
  online.answers = {}; online.correct = {}; online.pending = new Set(); online.revealAnswers = {}; online.winner = null;
  online.category = null; online.song = null; online.startAt = 0; online.deadline = 0; online.markDeadline = 0; online.warningKey = ''; online.audioError = ''; online.audioPending = false; online.answer = null; online.submitted = false;
  online.card = null; online.marked = new Set(); online.recent = []; online.recentCategories = [];
  for (const player of online.players) { player.score = 0; player.card = null; player.marked = new Set(); player.bingo = false; player.correct = false; }
  send('state', publicState()); render();
}
function submitVote(version, difficulty) {
  if (online.phase !== 'setup') return;
  if (!api()?.versions?.[version] || !BINGO_MODES[difficulty]) return;
  unlockAudio();
  const vote = { version, difficulty };
  online.votes[myId()] = vote;
  if (online.role === 'host') { broadcastState(); if (allVoted()) setTimeout(finishVotes, 450); }
  else { send('vote', vote); render(); }
}
function activePlayers() { return online.players.filter((p) => p.connected !== false); }
function allAnswered() { const active = activePlayers(); return active.length > 0 && active.every((p) => online.answers[p.id]); }
function maybeRevealEarly() {
  if (online.role !== 'host' || online.phase !== 'playing' || !allAnswered()) return;
  clearTimeout(online.timers.round);
  online.timers.round = setTimeout(revealRound, 180);
}
function allVoted() {
  const active = activePlayers();
  return active.length > 0 && active.every((p) => online.votes[p.id]?.version && online.votes[p.id]?.difficulty);
}
function tally(key, fallback) {
  const counts = {};
  for (const vote of Object.values(online.votes)) if (vote[key]) counts[vote[key]] = (counts[vote[key]] || 0) + 1;
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return fallback;
  if (entries[1] && entries[1][1] === entries[0][1]) {
    const hostVote = online.votes.host?.[key];
    if (hostVote && counts[hostVote] === entries[0][1]) return hostVote;
  }
  return entries[0][0];
}
function finishVotes() {
  if (online.role !== 'host' || online.phase !== 'setup') return;
  clearTimeout(online.timers.countdown);
  const version = tally('version', online.votes.host?.version || 'party');
  const difficulty = tally('difficulty', online.votes.host?.difficulty || 'easy');
  online.choices = { version, difficulty };
  for (const player of online.players) { player.card = makeBingoCard(difficulty); player.marked = new Set(); player.score = 0; player.bingo = false; player.correct = false; if (player.id === 'host') { online.card = player.card; online.marked = player.marked; } else sendTo(player.id, 'cards', { card: player.card, difficulty }); }
  online.phase = 'countdown'; online.countdownStarted = Date.now(); online.winner = null; online.answers = {}; online.correct = {}; online.pending = new Set();
  send('state', publicState()); render();
  online.timers.countdown = setTimeout(beginRound, 3200);
}
function pickCategory() {
  const cats = categoriesFor(online.choices.difficulty || 'easy');
  const fresh = cats.filter((c) => !online.recentCategories.includes(c.id));
  const category = (fresh.length ? fresh : cats)[Math.floor(Math.random() * (fresh.length || cats.length))];
  online.recentCategories.push(category.id); if (online.recentCategories.length > 2) online.recentCategories.shift();
  return category;
}
function pickSong() {
  const version = online.choices.version || 'party', difficulty = online.choices.difficulty || 'easy';
  const songs = api()?.state?.songs || [];
  let pool = songs.filter((s) => api().versionMatches(s, version) && isPlayable(s) && s.title && s.artist && Number.isFinite(Number(s.year)));
  if (!pool.length) pool = songs.filter((s) => isPlayable(s) && s.title && s.artist);
  const ranked = [...pool].sort((a, b) => api().fameScore(b) - api().fameScore(a));
  const ratio = difficulty === 'easy' ? 0.5 : 0.85;
  let known = ranked.slice(0, Math.max(40, Math.ceil(ranked.length * ratio)));
  let fresh = known.filter((s) => !online.recent.includes(s.id));
  if (!fresh.length) fresh = known;
  return fresh[Math.floor(Math.random() * fresh.length)] || null;
}
function beginRound() {
  if (online.role !== 'host' || !['countdown', 'reveal'].includes(online.phase)) return;
  if (online.round >= online.settings.rounds) return endGame();
  const category = pickCategory(), song = pickSong();
  if (!song) return showError('Keine Lieder für diese Auswahl.');
  online.round += 1; online.category = category; online.song = song; online.audioUrl = audioUrl(song);
  online.phase = 'spinning'; online.answers = {}; online.correct = {}; online.pending = new Set(); online.revealAnswers = {}; online.winner = null;
  online.answer = null; online.submitted = false; online.audioBlocked = false; online.audioError = ''; online.audioPending = false; online.audioPlaying = false; online.audioFallbackTried = false; online.markDeadline = 0; online.warningKey = ''; online.startIn = 3200; online.startAt = Date.now() + online.startIn; online.deadline = online.startAt + online.settings.timer * 1000;
  online.recent.push(song.id); if (online.recent.length > 100) online.recent.shift();
  const payload = { round: online.round, startIn: online.startIn, timer: online.settings.timer, audio: online.audioUrl, category: publicCategory(category), version: online.choices.version, difficulty: online.choices.difficulty };
  send('round', payload); send('state', publicState());
  setupAudio(online.audioUrl); render(); scheduleHostRound(online.startIn);
}
function applyRound(payload) {
  stopTimers();
  online.phase = 'spinning'; online.round = payload.round || online.round + 1;
  online.category = payload.category || online.category; online.startIn = payload.startIn || 4200;
  online.startAt = Date.now() + online.startIn; online.deadline = online.startAt + (payload.timer || online.settings.timer) * 1000;
  online.answers = {}; online.correct = {}; online.pending = new Set(); online.revealAnswers = {}; online.winner = null;
  online.answer = null; online.submitted = false; online.audioBlocked = false; online.audioError = ''; online.audioPending = false; online.audioPlaying = false; online.audioFallbackTried = false; online.markDeadline = 0; online.warningKey = '';
  setupAudio(payload.audio); render(); scheduleClientRound(online.startIn);
}
function scheduleHostRound(startIn) {
  clearRoundTimers();
  online.timers.phase = setTimeout(() => {
    if (online.phase !== 'spinning') return;
    online.phase = 'playing'; render(); startHostTimer(); playScheduledAudio();
  }, startIn);
  online.timers.tick = setInterval(render, 300);
}
function scheduleClientRound(startIn) {
  clearRoundTimers();
  online.timers.phase = setTimeout(() => {
    if (online.phase !== 'spinning') return;
    online.phase = 'playing'; render(); playScheduledAudio(); startClientTimer();
  }, startIn);
  online.timers.tick = setInterval(render, 300);
}
function startHostTimer() { online.timers.round = setTimeout(revealRound, Math.max(0, online.deadline - Date.now())); }
function startClientTimer() { online.timers.round = setTimeout(render, Math.max(0, online.deadline - Date.now()) + 200); }
function eligibleCells(player, categoryId = online.category?.id) {
  return (player?.card || []).map((cat, index) => (cat === categoryId && !player.marked.has(index) ? index : -1)).filter((index) => index >= 0);
}
function randomCell(player, categoryId = online.category?.id) {
  const cells = eligibleCells(player, categoryId);
  if (!cells.length) return null;
  const buffer = new Uint32Array(1); crypto.getRandomValues(buffer);
  return cells[buffer[0] % cells.length];
}
function scheduleNextRound(delay = 1800) {
  if (online.role !== 'host' || online.phase !== 'reveal' || online.winner) return;
  clearTimeout(online.timers.next);
  online.timers.next = setTimeout(() => {
    online.timers.next = null;
    if (online.phase === 'reveal' && !online.winner) beginRound();
  }, delay);
}
function autoMarkPending() {
  if (online.role !== 'host' || online.phase !== 'reveal') return;
  for (const playerId of [...online.pending]) {
    const player = online.players.find((p) => p.id === playerId);
    const index = randomCell(player);
    if (index == null) { online.pending.delete(playerId); continue; }
    hostMark(playerId, index, true);
    if (online.phase === 'ended') return;
  }
  if (online.phase === 'reveal') { broadcastState(); scheduleNextRound(2200); }
}
function revealRound() {
  if (online.role !== 'host' || online.phase !== 'playing' || !online.song) return;
  stopTimers();
  const category = online.category, song = online.song;
  online.correct = {}; online.revealAnswers = {}; online.pending = new Set();
  for (const player of online.players) {
    const raw = online.answers[player.id]?.value ?? '';
    const ok = isCorrect(category, song, raw);
    player.correct = ok; online.correct[player.id] = ok; online.revealAnswers[player.id] = formatAnswer(category, raw);
    if (ok && eligibleCells(player).length) online.pending.add(player.id);
  }
  online.phase = 'reveal';
  online.markDeadline = Date.now() + Math.max(3, Number(online.settings.markTimer) || 12) * 1000;
  online.warningKey = '';
  const payload = { phase: 'reveal', category: publicCategory(category), song: { year: song.year, title: song.title, artist: song.artist, group: Boolean(song.group), spotifyId: song.spotifyId || '' }, correct: online.correct, answers: online.revealAnswers, players: publicPlayers(), winner: null, markDeadline: online.markDeadline, markTimer: online.settings.markTimer };
  send('reveal', payload); send('state', publicState()); render();
  if (!online.pending.size) scheduleNextRound(3200);
  else online.timers.mark = setTimeout(autoMarkPending, Math.max(0, online.markDeadline - Date.now()));
}
function hostMark(playerId, index, auto = false) {
  if (online.role !== 'host' || online.phase !== 'reveal' || !online.correct[playerId]) return;
  if (!online.pending.has(playerId)) return;
  const player = online.players.find((p) => p.id === playerId); if (!player?.card || player.marked.has(index)) return;
  if (player.card[index] !== online.category?.id) return;
  if (!auto && online.markDeadline && Date.now() > online.markDeadline + 600) return;
  player.marked.add(index); player.score = (player.score || 0) + 1; online.pending.delete(playerId);
  if (playerId === 'host') online.marked = player.marked;
  player.bingo = hasBingo(player.marked);
  if (player.bingo && !online.winner) {
    online.winner = { id: player.id, name: player.name }; online.phase = 'ended'; stopTimers();
    api()?.confetti?.(90);
    send('ended', { winner: online.winner, players: publicPlayers() }); send('state', publicState()); render(); return;
  }
  broadcastState();
  if (online.pending.size === 0) scheduleNextRound(2400);
}
function onCellClick(index) {
  const me = online.players.find((p) => p.id === myId());
  const pending = online.role === 'host' ? online.pending.has('host') : Boolean(me?.pending);
  if (online.phase !== 'reveal' || !online.correct[myId()] || !pending) return;
  if (online.markDeadline && Date.now() > online.markDeadline + 600) return;
  if (online.card?.[index] !== online.category?.id || online.marked.has(index)) return;
  if (online.role === 'host') hostMark('host', index); else send('mark', { index });
}
function endGame() {
  if (online.role !== 'host') return;
  stopTimers(); online.phase = 'ended';
  if (!online.winner) { const sorted = [...online.players].sort((a, b) => (b.score || 0) - (a.score || 0)); online.winner = sorted[0] ? { id: sorted[0].id, name: sorted[0].name } : null; }
  send('ended', { winner: online.winner, players: publicPlayers() }); send('state', publicState()); api()?.confetti?.(70); render();
}

function submitAnswer(value) {
  if (online.phase !== 'playing' || online.submitted) return;
  const clean = String(value ?? '').trim().slice(0, 80);
  if (!clean) { $('#onlineGameStatus').textContent = 'Bitte gib zuerst eine Antwort ein.'; return; }
  online.answer = clean; online.submitted = true;
  if (online.role === 'host') { online.answers.host = { value: clean, at: Date.now() }; broadcastState(); maybeRevealEarly(); }
  else send('answer', { value: clean });
  render(); $('#onlineGameStatus').textContent = 'Tipp gespeichert. Warte auf die Auflösung …';
}
function showRoom() {
  $('#onlineLobby').hidden = true; $('#onlineRoom').hidden = false;
  $('#onlineRoomBadge').hidden = false; $('#onlineRoomCode').textContent = online.code; $('#onlineRoomCodeBig').textContent = online.code;
  const local = new URLSearchParams(location.search).has('localonline') ? '&localonline=1' : '';
  const invite = `${location.origin}${location.pathname}?online=${online.code}${local}`;
  $('#onlineInvite').value = invite;
  const qr = $('#onlineQr');
  const apiBase = api()?.API_BASE || (api()?.STATIC ? '' : location.origin);
  qr.onerror = () => { if (!qr.dataset.fallback) { qr.dataset.fallback = '1'; qr.src = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(invite)}`; } };
  qr.src = apiBase ? `${apiBase}/api/qr?text=${encodeURIComponent(invite)}` : `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(invite)}`;
  qr.hidden = true; qr.dataset.fallback = '';
  $('#onlineHostControls').hidden = online.role !== 'host';
  render();
}
function render() {
  if (!online.screen || online.screen.hidden) return;
  const isHost = online.role === 'host', players = online.players || [], phase = online.phase;
  const gamePhases = ['spinning', 'playing', 'reveal', 'ended'];
  $('#onlinePlayerCount').textContent = String(players.length);
  $('#onlinePlayers').innerHTML = players.map((p) => {
    const vote = online.votes[p.id];
    const badge = phase === 'setup' ? (vote ? '<span class="online-player-state done">✓</span>' : '<span class="online-player-state">…</span>') : p.correct && phase === 'reveal' ? '<span class="online-player-state done">✓</span>' : p.bingo ? '<span class="online-player-state bingo">B</span>' : '';
    return `<li><span class="dot ${p.connected === false ? 'offline' : ''}"></span><span class="online-player-name">${esc(p.name)}${p.id === myId() ? ' <small>(du)</small>' : ''}</span>${badge}<strong>${p.score || 0}</strong></li>`;
  }).join('') || '<li class="online-empty">Noch niemand da.</li>';
  $('#onlineWaiting').hidden = phase !== 'lobby' || isHost;
  $('#onlineSetup').hidden = !['setup', 'countdown'].includes(phase);
  $('#onlineGame').hidden = !gamePhases.includes(phase);
  online.screen.classList.toggle('is-game', gamePhases.includes(phase));
  const start = $('#onlineStart');
  start.hidden = !isHost || !['lobby', 'ended'].includes(phase);
  start.textContent = phase === 'lobby' ? 'Spiel vorbereiten' : 'Nochmal spielen';
  $('#onlineForceStart2').hidden = !isHost || phase !== 'setup';
  $('#onlineHostControls').hidden = !isHost || ['spinning', 'playing', 'reveal'].includes(phase);
  const hint = phase === 'lobby' ? (isHost ? 'Lade Spieler ein. Danach startest du die gemeinsame Abstimmung.' : 'Warte, bis der Host die Abstimmung startet.')
    : phase === 'setup' ? 'Alle wählen Version und Schwierigkeit. Danach geht es automatisch los.'
    : phase === 'countdown' ? 'Die Runde startet gleich …'
    : phase === 'reveal' ? (online.pending.size ? 'Kreuzen läuft. Die nächste Runde startet automatisch.' : 'Nächste Runde startet automatisch …')
    : phase === 'ended' ? 'Noch eine Runde?'
    : isHost ? 'Du bist der Host. Die Discokugel dreht für alle.' : 'Hör zu und tippe deine Antwort ein.';
  $('#onlineHostHint').textContent = hint;
  if (phase === 'lobby') {
    $('#onlineWaitingTitle').textContent = isHost ? 'Raum ist offen' : 'Warte auf den Host …';
    $('#onlineWaitingText').textContent = isHost ? 'Teile den Link oder Code. Wenn alle da sind, startest du die gemeinsame Auswahl.' : 'Der Host startet gleich die Abstimmung.';
  }
  if (['setup', 'countdown'].includes(phase)) renderSetup();
  if (gamePhases.includes(phase)) renderGame();
  $('#onlineRoomCode').textContent = online.code;
}
function voteCount(key, value) { return Object.values(online.votes || {}).filter((v) => v[key] === value).length; }
function renderSetup() {
  const myVote = online.votes[myId()] || {};
  const versions = Object.entries(api()?.versions || {}).filter(([id]) => id !== 'all');
  $('#onlineVersionVote').innerHTML = versions.map(([id, v]) => `<button class="online-vote-option ${myVote.version === id ? 'selected' : ''}" type="button" data-vote-version="${esc(id)}" aria-pressed="${myVote.version === id}" style="--opt:${v.color}"><span class="online-vote-icon">${esc((v.short || v.label || '?').slice(0, 2))}</span><span><strong>${esc(v.label)}</strong><small>${esc(v.desc || '')}</small></span><b>${voteCount('version', id) || ''}</b></button>`).join('');
  $('#onlineDifficultyVote').innerHTML = Object.entries(BINGO_MODES).map(([id, mode]) => `<button class="online-difficulty-option ${myVote.difficulty === id ? 'selected' : ''}" type="button" data-vote-difficulty="${id}" aria-pressed="${myVote.difficulty === id}"><span class="online-diff-mark">${id === 'easy' ? 'A' : 'B'}</span><span><strong>${mode.label} · Seite ${mode.side}</strong><small>${mode.desc}</small></span><b>${voteCount('difficulty', id) || ''}</b></button>`).join('');
  const voted = Object.keys(online.votes || {}).filter((id) => online.players.some((p) => p.id === id && p.connected !== false)).length;
  const active = online.players.filter((p) => p.connected !== false).length;
  $('#onlineVoteProgress').innerHTML = `<strong>${voted} / ${active}</strong> haben gewählt${voted >= active && active ? ' · Startet automatisch …' : ''}`;
  $('#onlineVoteResult').hidden = online.phase !== 'countdown';
  if (online.phase === 'countdown') {
    const remaining = Math.max(1, Math.ceil((3200 - (Date.now() - (online.countdownStarted || Date.now()))) / 1000));
    $('#onlineVoteResult').innerHTML = `<span>Eure Wahl</span><strong>${esc(versionLabel(online.choices.version))} · ${esc(difficultyLabel(online.choices.difficulty))}</strong><b>${remaining}</b>`;
  }
}
function legendHtml() {
  return categoriesFor(online.choices.difficulty || 'easy').map((c) => `<div class="online-legend-row"><i style="--c:${c.color}"></i><span><strong>${esc(c.label)}</strong><small>${esc(c.question)}</small></span></div>`).join('');
}
function renderGame() {
  const phase = online.phase, category = online.category, isHost = online.role === 'host';
  $('#onlineRoundLabel').textContent = `${Math.min(online.round || 1, online.settings.rounds)} / ${online.settings.rounds}`;
  $('#onlineVersionLabel').textContent = versionLabel(online.choices.version || 'party');
  $('#onlineDifficultyLabel').textContent = difficultyLabel(online.choices.difficulty || 'easy');
  const spinning = phase === 'spinning';
  const disco = $('#onlineDisco'); disco.classList.toggle('is-spinning', spinning); disco.classList.toggle('is-playing', phase === 'playing');
  const wheel = $('#onlineWheel'), wheelDisc = $('#onlineWheelDisc'), wheelCats = categoriesFor(online.choices.difficulty || 'easy');
  if (wheel) {
    wheelCats.forEach((cat, index) => wheel.style.setProperty(`--w${index}`, cat.color));
    const index = category ? wheelCats.findIndex((cat) => cat.id === category.id) : -1;
    if (category && index >= 0) {
      wheel.style.setProperty('--cat', category.color);
      $('#onlineCategoryCard').style.setProperty('--cat', category.color);
      $('.online-spin-card')?.style.setProperty('--cat', category.color);
      const key = `${online.round}:${category.id}`;
      if (online.wheelKey !== key) {
        online.wheelKey = key;
        const current = online.wheelAngle || 0;
        const targetSegment = (360 - index * 72) % 360;
        const delta = (targetSegment - (current % 360) + 360) % 360;
        online.wheelAngle = current + 360 * 5 + delta;
        wheel.style.setProperty('--wheel-end', `${online.wheelAngle}deg`);
        if (wheelDisc) {
          wheelDisc.classList.remove('is-spinning'); void wheelDisc.offsetWidth; wheelDisc.classList.add('is-spinning');
        }
      }
    }
  }
  $('#onlineCategoryLabel').textContent = spinning ? 'Dreht …' : category?.label || 'Kategorie';
  $('#onlineCategoryQuestion').textContent = spinning ? 'Die Discokugel entscheidet für alle.' : category?.question || '';
  const remaining = phase === 'playing' ? Math.max(0, Math.ceil((online.deadline - Date.now()) / 1000)) : phase === 'spinning' ? Math.max(0, Math.ceil((online.startAt - Date.now()) / 1000)) : 0;
  const me = online.players.find((p) => p.id === myId());
  const markPending = phase === 'reveal' && (isHost ? online.pending.has('host') : Boolean(me?.pending));
  const markLeft = markPending && online.markDeadline ? Math.max(0, Math.ceil((online.markDeadline - Date.now()) / 1000)) : 0;
  $('#onlineTimer').innerHTML = phase === 'playing' ? `${remaining}<small>s</small>` : phase === 'spinning' ? `${Math.max(1, remaining)}<small>s</small>` : phase === 'reveal' ? '✓<small>aufgelöst</small>' : '★<small>Bingo</small>';
  const audio = $('#onlineAudio');
  audio.hidden = !['spinning', 'playing'].includes(phase) || !online.audioUrl;
  if (!audio.hidden) {
    $('#onlineAudioTitle').textContent = phase === 'spinning' ? 'Song startet gleich' : 'Song läuft für alle';
    $('#onlineAudioHint').textContent = online.audioError ? 'Audio-Fehler – noch einmal antippen.' : online.audioBlocked ? 'Ton antippen, falls dein Browser blockiert.' : phase === 'playing' ? 'Hör zu und antworte unten.' : phase === 'reveal' ? 'Auflösung unten.' : 'Discokugel dreht …';
    $('#onlinePlay').classList.toggle('is-blocked', online.audioBlocked);
    $('#onlinePlay').setAttribute('aria-label', online.audioBlocked ? 'Ton aktivieren' : 'Song abspielen');
  }
  const gate = $('#onlineAudioGate');
  gate.hidden = !(phase === 'playing' && (online.audioBlocked || (!online.audioUnlocked && !online.audioPlaying)));
  if (!gate.hidden) {
    $('#onlineAudioGateHint').textContent = online.audioError || 'Dein Browser braucht einen Tipp, damit der Song startet.';
    $('#onlineAudioGateBtn').textContent = online.audioError ? 'Audio neu laden' : 'Ton aktivieren';
  }
  const markBox = $('#onlineMarkTimer');
  markBox.hidden = !markPending;
  if (markPending) {
    markBox.innerHTML = `<span>Kreuz setzen</span><strong>${markLeft}s</strong><small>danach zufällig</small>`;
    const warning = markLeft > 0 && markLeft <= 3;
    const key = `${online.round}:${online.markDeadline}`;
    if (warning && online.warningKey !== key) {
      online.warningKey = key;
      const grid = $('#onlineBingo'); grid.classList.remove('is-warning'); void grid.offsetWidth; grid.classList.add('is-warning');
      setTimeout(() => grid.classList.remove('is-warning'), 3200);
    }
  }
  renderAnswerForm();
  renderBingo();
  renderReveal();
  renderScore();
  $('#onlineCardName').textContent = online.name || 'Deine Karte';
  const marks = online.marked?.size || 0; $('#onlineCardProgress').textContent = `${marks} / 25`;
  if (phase === 'spinning') $('#onlineGameStatus').textContent = 'Die Discokugel dreht …';
  else if (phase === 'playing') { const count = Object.keys(online.answers || {}).length; $('#onlineGameStatus').textContent = `${count} / ${online.players.filter((p) => p.connected !== false).length} haben getippt.`; }
  else if (phase === 'reveal') {
    if (markPending) $('#onlineGameStatus').textContent = 'Richtig! Setze dein Kreuz in der Kategoriefarbe – danach wird zufällig gesetzt.';
    else if (online.correct[myId()]) $('#onlineGameStatus').textContent = 'Kreuz gesetzt. Nächste Runde startet automatisch …';
    else $('#onlineGameStatus').textContent = 'Schade – diesmal kein Kreuz. Die Auflösung steht unten.';
  }
  else if (phase === 'ended') $('#onlineGameStatus').textContent = online.winner ? `${online.winner.name} hat BINGO!` : 'Spiel beendet.';
  $('#onlineLegend').innerHTML = legendHtml();
}

function renderAnswerForm() {
  const box = $('#onlineAnswerBox');
  if (online.phase !== 'playing' || !online.category) { box.hidden = true; return; }
  box.hidden = false;
  const key = `${online.round}:${online.category.id}:${online.submitted ? 'done' : 'open'}`;
  if (box.dataset.key === key) return;
  box.dataset.key = key;
  const cat = online.category;
  if (online.submitted) {
    box.innerHTML = `<div class="online-answer-saved"><span>✓</span><div><strong>Tipp gespeichert</strong><small>${esc(formatAnswer(cat, online.answer))} · warte auf die Auflösung …</small></div></div>`;
    return;
  }
  let fields = '';
  if (cat.type === 'choice') fields = `<div class="online-answer-choices">${cat.options.map((o) => `<button type="button" class="online-answer-choice" data-answer="${esc(o.value)}">${esc(o.label)}</button>`).join('')}</div>`;
  else if (cat.type === 'decade') fields = `<div class="online-answer-choices online-decades">${['1950s', '1960s', '1970s', '1980s', '1990s', '2000s', '2010s', '2020s'].map((d) => `<button type="button" class="online-answer-choice" data-answer="${d}">${decadeLabel(d)}</button>`).join('')}</div>`;
  else if (cat.type === 'year') fields = `<form class="online-answer-form" id="onlineAnswerForm"><input id="onlineAnswerInput" inputmode="numeric" pattern="[0-9]*" maxlength="4" placeholder="z. B. 98 oder 1998" aria-label="Jahr" autocomplete="off" /><button class="online-answer-submit" type="submit">Tipp abgeben</button></form><small class="online-input-hint">2 Ziffern reichen: 84 = 1984, 06 = 2006.</small>`;
  else fields = `<form class="online-answer-form" id="onlineAnswerForm"><input id="onlineAnswerInput" maxlength="80" placeholder="${cat.type === 'title' ? 'Songtitel …' : 'Interpret oder Band …'}" aria-label="${esc(cat.label)}" autocomplete="off" /><button class="online-answer-submit" type="submit">Tipp abgeben</button></form>`;
  box.innerHTML = `<div class="online-answer-head"><span class="online-kicker">DEINE ANTWORT</span><strong>${esc(cat.question)}</strong></div>${fields}`;
  $('#onlineAnswerInput')?.focus({ preventScroll: true });
}
function renderBingo() {
  const grid = $('#onlineBingo'), card = online.card || [];
  if (!card.length) { grid.innerHTML = '<div class="online-bingo-empty">Deine Karte erscheint nach der Abstimmung.</div>'; return; }
  const me = online.players.find((p) => p.id === myId());
  const pending = online.role === 'host' ? online.pending.has('host') : Boolean(me?.pending);
  const canMark = online.phase === 'reveal' && Boolean(online.correct[myId()]) && pending;
  const signature = JSON.stringify([card, [...online.marked], online.phase, online.category?.id || '', canMark, online.winner?.id || '']);
  if (grid.dataset.signature === signature) return;
  grid.dataset.signature = signature;
  grid.innerHTML = card.map((catId, index) => {
    const cat = categoryById(catId) || { color: '#ddd', ink: '#111', short: '?', icon: '♪', label: '?' };
    const marked = online.marked.has(index);
    const eligible = canMark && catId === online.category?.id && !marked;
    return `<button type="button" data-index="${index}" class="online-cell ${marked ? 'is-marked' : ''} ${eligible ? 'is-eligible' : ''}" style="--cell:${cat.color};--cell-ink:${cat.ink}" ${eligible ? '' : 'disabled'} aria-label="${esc(cat.label)}${marked ? ', markiert' : ''}"><span class="online-cell-icon">${cat.icon}</span><span class="online-cell-label">${esc(cat.short)}</span>${marked ? '<b class="online-cell-check">✓</b>' : ''}</button>`;
  }).join('');
  grid.classList.toggle('online-bingo-win', Boolean(online.winner && online.winner.id === myId()));
}
function renderReveal() {
  const box = $('#onlineReveal');
  if (!['reveal', 'ended'].includes(online.phase) || !online.song) { box.hidden = true; return; }
  box.hidden = false;
  const cat = online.category, song = online.song, correct = online.correct[myId()];
  const own = online.revealAnswers?.[myId()] || '—';
  const winner = online.winner;
  box.innerHTML = `<div class="online-reveal-head"><span class="online-kicker">AUFGELÖST</span><strong>${esc(song.year)}</strong><p>${esc(song.title)} · ${esc(song.artist)}</p></div><div class="online-reveal-answer ${correct ? 'is-right' : 'is-wrong'}"><span>${correct ? '✓' : '×'}</span><div><strong>${correct ? 'Richtig!' : 'Leider falsch'}</strong><small>Deine Antwort: ${esc(formatAnswer(cat, own))}</small></div></div>${winner ? `<div class="online-winner"><span>★</span><strong>${esc(winner.name)} hat BINGO!</strong><small>Erste vollständige Reihe.</small></div>` : `<p class="online-hint">${correct ? 'Wähle ein freies Feld in der Farbe der Kategorie.' : 'Der Host startet die nächste Runde.'}</p>`}<a class="online-spotify-link" href="${esc(spotifyLink(song))}" target="_blank" rel="noopener">Song auf Spotify öffnen ↗</a>`;
}
function renderScore() {
  const sorted = [...online.players].sort((a, b) => (b.score || 0) - (a.score || 0));
  $('#onlineScore').innerHTML = sorted.length ? sorted.map((p, i) => `<div class="${p.id === myId() ? 'is-me' : ''}"><span>${i + 1}. ${esc(p.name)}${p.bingo ? ' · <b>BINGO</b>' : ''}</span><strong>${p.score || 0} Pkt.</strong></div>`).join('') : '';
  const me = sorted.find((p) => p.id === myId());
  $('#onlineLeaderboardSummary').textContent = me ? `${me.score || 0} Pkt. · Platz ${sorted.indexOf(me) + 1}` : '';
}
function broadcastState() { if (online.role === 'host') send('state', publicState()); render(); }
function showReaction(emoji, name) { const layer = document.createElement('div'); layer.className = 'online-reaction-float'; layer.textContent = `${emoji} ${name}`; document.body.append(layer); setTimeout(() => layer.remove(), 2200); }
async function copyText(text, message) {
  try { await navigator.clipboard.writeText(text); api()?.showToast(message, 2200); }
  catch { const input = $('#onlineInvite'); input.value = text; input.select(); document.execCommand?.('copy'); api()?.showToast(message, 2600); }
}

let onlineAudio = null;
async function resolveItunesAudio() {
  if (online.audioFallbackTried || !online.song) return false;
  online.audioFallbackTried = true;
  const song = online.song;
  const match = (item) => item?.previewUrl && /song|music/i.test(item.kind || 'song');
  try {
    let data = null;
    if (song.itunesId) data = await fetch(`https://itunes.apple.com/lookup?id=${encodeURIComponent(song.itunesId)}&country=DE`).then((r) => r.json());
    let item = data?.results?.find(match);
    if (!item) {
      data = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(`${song.title} ${song.artist}`)}&entity=song&limit=8&country=DE`).then((r) => r.json());
      item = data?.results?.find(match);
    }
    if (!item?.previewUrl) return false;
    online.audioUrl = item.previewUrl;
    setupAudio(item.previewUrl);
    return true;
  } catch { return false; }
}
const SILENT_AUDIO = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
function ensureAudio() {
  if (onlineAudio) return onlineAudio;
  onlineAudio = new Audio(); onlineAudio.preload = 'auto'; onlineAudio.setAttribute('playsinline', ''); onlineAudio.style.display = 'none'; document.body.append(onlineAudio);
  onlineAudio.addEventListener('timeupdate', () => { const bar = $('#onlineProgress'); if (bar && onlineAudio.duration) bar.style.width = `${Math.min(100, (onlineAudio.currentTime / onlineAudio.duration) * 100)}%`; });
  onlineAudio.addEventListener('playing', () => {
    if (!onlineAudio.getAttribute('src') || onlineAudio.src.startsWith('data:')) return;
    online.audioError = ''; online.audioBlocked = false; online.audioPending = false; online.audioPlaying = true;
    $('#onlinePlay')?.classList.add('is-playing'); render();
  });
  onlineAudio.addEventListener('error', () => {
    if (!onlineAudio.getAttribute('src') || onlineAudio.src.startsWith('data:')) return;
    online.audioError = onlineAudio.error?.message || 'Audio konnte nicht geladen werden.';
    online.audioBlocked = true; render();
    if (!online.audioFallbackTried) resolveItunesAudio().then((ok) => { if (ok && online.phase === 'playing') playScheduledAudio(); });
  });
  return onlineAudio;
}
function unlockAudio() {
  if (online.audioUnlocked) return;
  const audio = ensureAudio();
  if (online.phase === 'playing' && audio.src && !audio.src.startsWith('data:')) return;
  if (!audio.paused && audio.src && !audio.src.startsWith('data:')) return;
  audio.muted = true; audio.src = SILENT_AUDIO;
  audio.play().then(() => {
    audio.pause(); audio.muted = false; audio.removeAttribute('src'); online.audioUnlocked = true;
  }).catch(() => { audio.muted = false; });
}
function setupAudio(url) {
  const audio = ensureAudio(); audio.pause(); audio.muted = false; audio.src = url || ''; audio.currentTime = 0;
  if (url) audio.load();
  online.audioError = ''; online.audioBlocked = false; online.audioPending = false; online.audioPlaying = false;
  $('#onlineProgress')?.style.setProperty('width', '0%'); $('#onlinePlay')?.classList.remove('is-playing');
}
function playScheduledAudio() {
  const audio = ensureAudio(); if (!audio.src || audio.src.startsWith('data:') || online.audioError) return;
  audio.currentTime = 0;
  audio.play().then(() => { online.audioBlocked = false; online.audioPending = false; $('#onlinePlay')?.classList.add('is-playing'); render(); })
    .catch(() => { online.audioBlocked = true; render(); });
}
async function playOnlineAudio() {
  if (!online.audioUrl) return;
  if (online.phase === 'spinning') { online.audioPending = true; online.audioBlocked = false; api()?.showToast('Ton aktiviert – der Song startet gleich.', 2200); render(); return; }
  if (online.audioError) { const resolved = await resolveItunesAudio(); if (!resolved) setupAudio(online.audioUrl); }
  const audio = ensureAudio(); if (!audio.src) setupAudio(online.audioUrl);
  if (audio.paused) audio.play().then(() => { online.audioBlocked = false; $('#onlinePlay')?.classList.add('is-playing'); render(); }).catch(() => { online.audioBlocked = true; render(); api()?.showToast('Audio konnte nicht gestartet werden. Bitte noch einmal tippen.', 3000); });
  else { audio.pause(); $('#onlinePlay')?.classList.remove('is-playing'); }
}
function clearRoundTimers() { clearTimeout(online.timers.phase); clearTimeout(online.timers.audio); clearTimeout(online.timers.round); clearTimeout(online.timers.mark); clearTimeout(online.timers.next); clearInterval(online.timers.tick); online.timers.phase = online.timers.audio = online.timers.round = online.timers.mark = online.timers.next = online.timers.tick = null; }
function stopTimers() { clearRoundTimers(); clearTimeout(online.timers.countdown); online.timers.countdown = null; }

function boot() {
  buildScreen();
  const params = new URLSearchParams(location.search);
  const code = cleanCode(params.get('online') || '');
  if (params.has('online')) open(code.length === 6 ? code : '');
  window.HitsterOnline = { open, close, state: online, debug: { isCorrect, expandYear, makeBingoCard, hasBingo, hostMark, randomCell, autoMarkPending, scheduleNextRound, revealRound, beginRound, endGame, render, audio: ensureAudio, online } };
}
if (window.HITSTER) boot(); else window.addEventListener('hitster-ready', boot, { once: true });
