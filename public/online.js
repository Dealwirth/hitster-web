/* HITSTER Web – Online-Bingo (host-authoritative, PeerJS/WebRTC or BroadcastChannel demo). */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const NAME_KEY = 'hitster-web-online-name';
const online = {
  role: null, code: '', name: '', transport: null, peerId: '', players: [], connections: new Map(),
  settings: { rounds: 10, timer: 25, versionMode: 'fixed', version: 'party', difficultyMode: 'fixed', difficulty: 'easy' },
  phase: 'lobby', round: 0, song: null, audio: null, deadline: 0, timerId: null, tickId: null,
  answers: {}, votes: {}, choices: {}, card: null, marked: new Set(), selectedYear: null,
  winner: null, recent: [], localMode: new URLSearchParams(location.search).has('localonline'), screen: null,
};
const api = () => window.HITSTER;
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cleanCode = (v) => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
const cleanName = (v) => String(v || '').replace(/[<>&"']/g, '').replace(/\s+/g, ' ').trim().slice(0, 18);
const roomId = (code) => `hitster-bingo-${String(code).toLowerCase()}`;
const randomCode = () => [...crypto.getRandomValues(new Uint8Array(6))].map((b) => ALPHABET[b % ALPHABET.length]).join('');
const yearsPool = () => [...new Set((api()?.state?.songs || []).map((s) => s.year))].sort((a, b) => a - b);
const makeCard = () => {
  const pool = yearsPool();
  const picked = [];
  while (picked.length < 24 && pool.length) picked.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  return Array.from({ length: 25 }, (_, i) => (i === 12 ? { free: true, year: null } : { free: false, year: picked.shift() }));
};
const hit = (card, marked, i) => card[i]?.free || marked.has(i);
function hasBingo(card, marked) {
  for (let r = 0; r < 5; r++) if ([0, 1, 2, 3, 4].every((c) => hit(card, marked, r * 5 + c))) return true;
  for (let c = 0; c < 5; c++) if ([0, 1, 2, 3, 4].every((r) => hit(card, marked, r * 5 + c))) return true;
  return [0, 6, 12, 18, 24].every((i) => hit(card, marked, i)) || [4, 8, 12, 16, 20].every((i) => hit(card, marked, i));
}
const publicPlayers = () => online.players.map((p) => ({ id: p.id, name: p.name, connected: p.connected !== false, score: p.score || 0, bingo: Boolean(p.bingo) }));
const publicState = () => ({ code: online.code, phase: online.phase, round: online.round, settings: online.settings, players: publicPlayers(), votes: online.votes, answers: Object.keys(online.answers).length, winner: online.winner, deadline: online.deadline, versionLabel: api()?.versions?.[online.choices.version || online.settings.version]?.label || '', difficulty: online.choices.difficulty || online.settings.difficulty, audio: online.phase === 'playing' && online.song ? audioUrl(online.song) : null });
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
    <header class="online-top"><button class="btn btn-ghost btn-small" id="onlineBack" type="button">← Startseite</button><div><span class="eyebrow">ONLINE BINGO</span><h1>Gemeinsam spielen</h1></div><div class="online-room-badge" id="onlineRoomBadge" hidden>Raum <strong id="onlineRoomCode"></strong></div></header>
    <div class="online-lobby" id="onlineLobby">
      <div class="online-hero"><h2>Ein Raum, viele Geräte.</h2><p>Der Host öffnet den Raum, alle anderen kommen per Link oder QR-Code dazu. Jeder hört den Clip am eigenen Gerät. Kein Konto, kein eigener Server – die Verbindung läuft direkt zwischen den Geräten.</p></div>
      <form class="online-card online-form" id="onlineHostForm">
        <h2>Raum erstellen</h2>
        <label>Dein Name<input id="onlineHostName" maxlength="18" autocomplete="nickname" required placeholder="z. B. Alex" /></label>
        <div class="online-field-grid"><label>Runden<select id="onlineRounds"><option value="5">5 Runden</option><option value="10" selected>10 Runden</option><option value="15">15 Runden</option></select></label><label>Timer<select id="onlineTimerSelect"><option value="15">15 Sekunden</option><option value="25" selected>25 Sekunden</option><option value="35">35 Sekunden</option><option value="45">45 Sekunden</option></select></label></div>
        <label>Version<select id="onlineVersion"></select></label>
        <label>Version entscheiden<select id="onlineVersionMode"><option value="fixed">Host wählt</option><option value="ask">Spieler wählen</option></select></label>
        <label>Schwierigkeit<select id="onlineDifficulty"><option value="easy">Leicht – nur bekannte Hits</option><option value="hard">Schwer – alles</option></select></label>
        <label>Schwierigkeit entscheiden<select id="onlineDifficultyMode"><option value="fixed">Host wählt</option><option value="ask">Spieler wählen</option></select></label>
        <button class="btn btn-primary btn-wide" type="submit">Raum erstellen →</button><p class="online-error" id="onlineError" role="alert"></p>
      </form>
      <form class="online-card online-form" id="onlineJoinForm">
        <h2>Raum beitreten</h2><label>Dein Name<input id="onlineJoinName" maxlength="18" autocomplete="nickname" required placeholder="z. B. Sam" /></label><label>Raum-Code<input id="onlineJoinCode" maxlength="6" autocapitalize="characters" autocomplete="off" required placeholder="ABC123" /></label><button class="btn btn-accent btn-wide" type="submit">Beitreten →</button><p class="online-hint">Den Code findest du im Einladungslink oder im QR-Code des Hosts.</p>
      </form>
    </div>
    <div id="onlineRoom" hidden><div class="online-grid">
      <aside class="online-side">
        <div class="online-card"><h3>Einladung</h3><div class="online-invite-link"><input id="onlineInvite" readonly aria-label="Einladungslink" /><button class="btn btn-ghost btn-small" id="onlineCopy" type="button">Kopieren</button></div><img class="online-qr" id="onlineQr" alt="QR-Code zum Online-Raum" hidden /><p class="online-hint" id="onlineInviteHint">Link teilen – fertig.</p></div>
        <div class="online-card"><h3>Spieler <span class="panel-count" id="onlinePlayerCount">0</span></h3><ul class="online-players" id="onlinePlayers"></ul><div class="online-reactions" id="onlineReactions"><button type="button" data-reaction="😂">😂</button><button type="button" data-reaction="🔥">🔥</button><button type="button" data-reaction="👏">👏</button><button type="button" data-reaction="😱">😱</button><button type="button" data-reaction="🎉">🎉</button></div></div>
        <div class="online-card" id="onlineHostControls"><h3>Host-Steuerung</h3><p class="online-hint" id="onlineHostHint">Stelle die Grundeinstellungen ein und starte die erste Runde.</p><button class="btn btn-primary btn-wide" id="onlineStart" type="button">Spiel starten</button></div>
      </aside>
      <main class="online-main">
        <div class="online-panel" id="onlineWaiting"><h2 id="onlineWaitingTitle">Warte auf den Host …</h2><p class="online-hint" id="onlineWaitingText">Sobald der Host startet, erscheint hier deine Bingo-Karte.</p><div class="online-toast" id="onlineStatus" aria-live="polite"></div></div>
        <div class="online-panel" id="onlineGame" hidden>
          <div class="online-roundbar"><strong id="onlineRoundLabel">Runde 1</strong><span class="pill" id="onlineVersionLabel"></span><span class="pill" id="onlineDifficultyLabel"></span><span class="online-timer" id="onlineTimer">25<small>s</small></span></div>
          <div class="online-audio"><button class="online-play" id="onlinePlay" type="button" aria-label="Song abspielen"><svg><use href="#i-play"></use></svg></button><div class="online-audio-copy"><strong>Song läuft</strong><small>Hör zu und tippe dein Jahr an.</small></div><div class="online-progress"><i id="onlineProgress"></i></div></div>
          <div class="online-vote" id="onlineVote" hidden></div><div class="online-bingo" id="onlineBingo" aria-label="Bingo-Karte"></div><div class="online-toast" id="onlineGameStatus" aria-live="polite"></div><div class="online-reveal" id="onlineReveal" hidden></div><div class="online-score" id="onlineScore"></div>
        </div>
      </main>
    </div></div>
    <div class="online-toast" id="onlineGlobalStatus" aria-live="polite"></div>`;
  document.body.append(section); online.screen = section;
  const select = $('#onlineVersion', section);
  select.innerHTML = Object.entries(api()?.versions || {}).map(([id, v]) => `<option value="${esc(id)}">${esc(v.label)}</option>`).join('');
  select.value = 'party';
  $('#onlineBack', section).addEventListener('click', close);
  $('#onlineHostForm', section).addEventListener('submit', onCreateRoom);
  $('#onlineJoinForm', section).addEventListener('submit', onJoinRoom);
  $('#onlineStart', section).addEventListener('click', startNextRound);
  $('#onlinePlay', section).addEventListener('click', playOnlineAudio);
  $('#onlineCopy', section).addEventListener('click', copyInvite);
  $('#onlineReactions', section).addEventListener('click', (e) => { const b = e.target.closest('[data-reaction]'); if (b) { send('reaction', { emoji: b.dataset.reaction }); showReaction(b.dataset.reaction, online.name); } });
  $('#onlineBingo', section).addEventListener('click', (e) => { const b = e.target.closest('button[data-index]'); if (b) chooseYear(Number(b.dataset.index)); });
  return section;
}
function showScreen() { buildScreen(); online.screen.hidden = false; document.body.classList.add('online-active', 'started'); document.body.style.overflow = ''; }
function close() {
  online.transport?.close(); online.transport = null; online.role = null; online.phase = 'lobby'; stopTimers();
  if (online.screen) online.screen.hidden = true;
  document.body.classList.remove('online-active', 'started');
  const url = new URL(location.href); url.searchParams.delete('online');
  history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`); window.scrollTo({ top: 0, behavior: 'smooth' });
}
function open(prefillCode = '') {
  if (!api()?.state?.songs?.length) { setTimeout(() => open(prefillCode), 350); return; }
  showScreen(); online.name = localStorage.getItem(NAME_KEY) || '';
  $('#onlineHostName').value = online.name; $('#onlineJoinName').value = online.name;
  if (prefillCode) { $('#onlineJoinCode').value = cleanCode(prefillCode); $('#onlineJoinName').focus(); } else $('#onlineHostName').focus();
  $('#onlineLobby').hidden = false; $('#onlineRoom').hidden = true; $('#onlineError').textContent = '';
}

function readSettings() {
  return { rounds: Number($('#onlineRounds').value) || 10, timer: Number($('#onlineTimerSelect').value) || 25, versionMode: $('#onlineVersionMode').value, version: $('#onlineVersion').value, difficultyMode: $('#onlineDifficultyMode').value, difficulty: $('#onlineDifficulty').value };
}
function onCreateRoom(event) {
  event.preventDefault();
  const name = cleanName($('#onlineHostName').value);
  if (!name) return showError('Bitte gib deinen Namen ein.');
  localStorage.setItem(NAME_KEY, name); online.name = name; online.role = 'host'; online.code = randomCode();
  online.settings = readSettings(); online.players = []; online.connections = new Map(); online.phase = 'lobby';
  online.round = 0; online.answers = {}; online.votes = {}; online.choices = {}; online.winner = null; online.recent = [];
  const player = { id: 'host', name, connected: true, score: 0, card: makeCard(), marked: new Set(), bingo: false };
  online.players.push(player); online.card = player.card; online.marked = player.marked;
  try {
    online.transport = createTransport(online.code, 'host', handleMessage); online.peerId = 'host';
    if (online.transport instanceof PeerTransport) online.transport.ready.then((id) => { online.peerId = id; }).catch((err) => showError(`Verbindung fehlgeschlagen: ${err.message || err}`));
  } catch (err) { return showError(`Raum konnte nicht erstellt werden: ${err.message || err}`); }
  showRoom(); broadcastState();
}
function onJoinRoom(event) {
  event.preventDefault();
  const name = cleanName($('#onlineJoinName').value), code = cleanCode($('#onlineJoinCode').value);
  if (!name) return showError('Bitte gib deinen Namen ein.');
  if (code.length !== 6) return showError('Der Raum-Code hat 6 Zeichen.');
  localStorage.setItem(NAME_KEY, name); online.name = name; online.role = 'player'; online.code = code;
  online.phase = 'lobby'; online.players = []; online.connections = new Map(); online.card = makeCard(); online.marked = new Set();
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
  if (message.type === '_close') { if (online.role === 'host') { const p = online.players.find((e) => e.id === from); if (p) { p.connected = false; broadcastState(); } } return; }
  if (message.type === '_open') { if (online.role === 'player') send('join', { name: online.name }); return; }
  if (online.role === 'host') return handleHostMessage(message, from);
  return handlePlayerMessage(message);
}
function handleHostMessage(message, from) {
  if (message.type === 'join') {
    const name = cleanName(message.payload?.name) || 'Gast';
    let player = online.players.find((p) => p.id === from);
    if (!player) { player = { id: from, name, connected: true, score: 0, card: makeCard(), marked: new Set(), bingo: false }; online.players.push(player); }
    player.name = name; player.connected = true;
    sendTo(from, 'welcome', { id: from, code: online.code, name: online.name, card: player.card, settings: online.settings, players: publicPlayers(), phase: online.phase });
    broadcastState(); return;
  }
  if (message.type === 'answer' && online.phase === 'playing') {
    const year = Number(message.payload?.year); if (Number.isInteger(year)) { online.answers[from] = year; broadcastState(); } return;
  }
  if (message.type === 'vote' && online.phase === 'choose') {
    online.votes[from] = { version: String(message.payload?.version || ''), difficulty: String(message.payload?.difficulty || '') };
    broadcastState(); render(); return;
  }
  if (message.type === 'reaction') {
    const emoji = String(message.payload?.emoji || '').slice(0, 4), player = online.players.find((p) => p.id === from);
    if (emoji) { send('reaction', { emoji, name: player?.name || 'Gast' }); showReaction(emoji, player?.name || 'Gast'); }
  }
}
function handlePlayerMessage(message) {
  if (message.type === 'welcome') {
    online.peerId = message.payload?.id || online.peerId; online.code = message.payload?.code || online.code;
    online.settings = message.payload?.settings || online.settings; online.players = message.payload?.players || [];
    online.phase = message.payload?.phase || 'lobby'; if (message.payload?.card) online.card = message.payload.card;
    showRoom(); render(); return;
  }
  if (message.type === 'state') {
    const next = message.payload || {};
    online.phase = next.phase || online.phase; online.round = next.round || online.round;
    online.settings = next.settings || online.settings; online.players = next.players || online.players;
    online.votes = next.votes || {}; online.winner = next.winner || null; online.deadline = next.deadline || online.deadline; online.audio = next.audio || online.audio;
    online.choices = { ...online.choices, version: next.version || online.choices.version, difficulty: next.difficulty || online.choices.difficulty };
    if (next.phase === 'lobby') { $('#onlineWaiting').hidden = false; $('#onlineGame').hidden = true; }
    if (next.phase === 'playing' && next.audio && !onlineAudio?.src) setupAudio(next.audio);
    render(); return;
  }
  if (message.type === 'round') {
    online.phase = 'playing'; online.round = message.payload?.round || online.round + 1;
    online.deadline = message.payload?.deadline || Date.now() + (online.settings.timer || 25) * 1000;
    online.selectedYear = null; online.choices = { version: message.payload?.version, difficulty: message.payload?.difficulty };
    $('#onlineWaiting').hidden = true; $('#onlineGame').hidden = false; $('#onlineReveal').hidden = true;
    setupAudio(message.payload?.audio); render(); startLocalTimer(); return;
  }
  if (message.type === 'reveal') {
    stopTimers(); online.phase = message.payload?.phase || 'reveal'; online.winner = message.payload?.winner || null;
    if (message.payload?.players) online.players = message.payload.players;
    const mine = online.players.find((p) => p.id === online.peerId); if (mine?.marked) online.marked = new Set(mine.marked);
    const reveal = $('#onlineReveal'); reveal.hidden = false;
    reveal.innerHTML = `<strong>${esc(message.payload?.year || '')}</strong><p>${esc(message.payload?.title || '')} · ${esc(message.payload?.artist || '')}</p>`;
    $('#onlineGameStatus').textContent = online.winner ? `Bingo für ${online.winner.name}!` : 'Jahr aufgedeckt. Der Host startet die nächste Runde.';
    render(); return;
  }
  if (message.type === 'ended') { stopTimers(); online.phase = 'ended'; online.winner = message.payload?.winner || null; if (message.payload?.players) online.players = message.payload.players; render(); return; }
  if (message.type === 'reaction') showReaction(message.payload?.emoji, message.payload?.name || 'Gast');
}

function startNextRound() {
  if (online.role !== 'host' || online.winner || online.phase === 'ended') return;
  if (online.phase === 'choose') return beginChosenRound();
  if (online.round >= online.settings.rounds && online.phase !== 'lobby') return endGame();
  if (online.settings.versionMode === 'ask' || online.settings.difficultyMode === 'ask') {
    online.phase = 'choose'; online.votes = {};
    online.choices = { version: online.settings.versionMode === 'ask' ? '' : online.settings.version, difficulty: online.settings.difficultyMode === 'ask' ? '' : online.settings.difficulty };
    send('state', publicState()); render(); return;
  }
  beginRound();
}
function beginChosenRound() {
  const votes = Object.values(online.votes);
  if (online.settings.versionMode === 'ask') {
    const counts = {}; for (const v of votes) if (v.version) counts[v.version] = (counts[v.version] || 0) + 1;
    online.choices.version = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || online.settings.version;
  }
  if (online.settings.difficultyMode === 'ask') {
    const counts = {}; for (const v of votes) if (v.difficulty) counts[v.difficulty] = (counts[v.difficulty] || 0) + 1;
    online.choices.difficulty = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || online.settings.difficulty;
  }
  beginRound();
}
function beginRound() {
  const version = online.choices.version || online.settings.version || 'party';
  const difficulty = online.choices.difficulty || online.settings.difficulty || 'easy';
  const songs = api()?.state?.songs || [];
  let pool = songs.filter((s) => api().versionMatches(s, version) && (s.previewUrl || s.itunesId || s.deezerId || s.spotifyId || s.streamUrl) && !online.recent.includes(s.id));
  if (!pool.length) pool = songs.filter((s) => api().versionMatches(s, version));
  if (difficulty === 'easy') { const ranked = [...pool].sort((a, b) => api().fameScore(b) - api().fameScore(a)); pool = ranked.slice(0, Math.max(30, Math.ceil(ranked.length * 0.45))); }
  if (!pool.length) return showError('Keine Lieder für diese Auswahl.');
  const song = pool[Math.floor(Math.random() * pool.length)];
  online.song = song; online.recent.push(song.id); if (online.recent.length > 80) online.recent.shift();
  online.round += 1; online.phase = 'playing'; online.answers = {}; online.votes = {}; online.winner = null; online.selectedYear = null;
  online.deadline = Date.now() + online.settings.timer * 1000;
  const audio = audioUrl(song);
  send('round', { round: online.round, audio, deadline: online.deadline, timer: online.settings.timer, version, difficulty });
  send('state', publicState());
  $('#onlineWaiting').hidden = true; $('#onlineGame').hidden = false; $('#onlineReveal').hidden = true;
  setupAudio(audio); render(); startHostTimer();
}
function startHostTimer() { stopTimers(); online.timerId = setTimeout(revealRound, online.settings.timer * 1000 + 250); online.tickId = setInterval(render, 400); }
function startLocalTimer() { stopTimers(); online.tickId = setInterval(render, 400); online.timerId = setTimeout(render, Math.max(0, online.deadline - Date.now()) + 100); }
function stopTimers() { clearTimeout(online.timerId); clearInterval(online.tickId); online.timerId = null; online.tickId = null; }
function revealRound() {
  if (online.role !== 'host' || online.phase !== 'playing' || !online.song) return;
  stopTimers(); const year = online.song.year;
  for (const player of online.players) {
    if (!player.card) player.card = makeCard(); if (!player.marked) player.marked = new Set();
    let correct = false;
    player.card.forEach((cell, i) => { if (cell.year === year) { player.marked.add(i); correct = true; } });
    if (online.answers[player.id] === year) { player.score = (player.score || 0) + 2; correct = true; }
    if (correct) player.score = (player.score || 0) + 1;
    player.bingo = hasBingo(player.card, player.marked);
    if (player.bingo && !online.winner) online.winner = { id: player.id, name: player.name };
  }
  online.phase = online.winner ? 'ended' : 'reveal';
  if (online.winner) api()?.confetti?.(80);
  const payload = { year, title: online.song.title, artist: online.song.artist, players: online.players.map((p) => ({ ...publicPlayers().find((e) => e.id === p.id), marked: [...p.marked] })), winner: online.winner, phase: online.phase };
  const reveal = $('#onlineReveal');
  reveal.hidden = false;
  reveal.innerHTML = `<strong>${esc(year)}</strong><p>${esc(online.song.title)} · ${esc(online.song.artist)}</p>`;
  send('reveal', payload); send('state', publicState()); if (online.winner) send('ended', { winner: online.winner, players: payload.players }); render();
}
function endGame() {
  online.phase = 'ended';
  if (!online.winner) { const sorted = [...online.players].sort((a, b) => (b.score || 0) - (a.score || 0)); online.winner = sorted[0] ? { id: sorted[0].id, name: sorted[0].name } : null; }
  send('ended', { winner: online.winner, players: online.players.map((p) => ({ ...publicPlayers().find((e) => e.id === p.id), marked: [...(p.marked || [])] })) });
  send('state', publicState()); api()?.confetti?.(70); render();
}
function chooseYear(index) {
  if (!online.card || online.phase !== 'playing' || online.selectedYear != null) return;
  const cell = online.card[index]; if (!cell || cell.free || cell.year == null) return;
  online.selectedYear = index;
  if (online.role === 'host') { online.answers.host = cell.year; broadcastState(); } else send('answer', { year: cell.year });
  render(); $('#onlineGameStatus').textContent = `Tipp gespeichert: ${cell.year}. Warte auf die Auflösung …`;
}

function showRoom() {
  $('#onlineLobby').hidden = true; $('#onlineRoom').hidden = false;
  const badge = $('#onlineRoomBadge'); badge.hidden = false; $('#onlineRoomCode').textContent = online.code;
  const local = new URLSearchParams(location.search).has('localonline') ? '&localonline=1' : '';
  const invite = `${location.origin}${location.pathname}?online=${online.code}${local}`;
  $('#onlineInvite').value = invite;
  const qr = $('#onlineQr');
  const apiBase = api()?.API_BASE || (api()?.STATIC ? '' : location.origin);
  qr.src = apiBase ? `${apiBase}/api/qr?text=${encodeURIComponent(invite)}` : `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(invite)}`;
  qr.hidden = false;
  $('#onlineInviteHint').textContent = online.role === 'host' ? 'Teile den Link – jeder tritt mit seinem Namen bei.' : 'Du bist im Raum. Viel Spaß!';
  $('#onlineHostControls').hidden = online.role !== 'host';
  render();
}
function render() {
  if (!online.screen || online.screen.hidden) return;
  const isHost = online.role === 'host', players = online.players || [];
  $('#onlinePlayerCount').textContent = String(players.length);
  $('#onlinePlayers').innerHTML = players.map((p) => `<li><span class="dot"></span><span>${esc(p.name)}</span>${p.id === (online.role === 'host' ? 'host' : online.peerId) ? ' <small>(du)</small>' : ''}<strong style="margin-left:auto">${p.score || 0}</strong></li>`).join('') || '<li>Noch niemand da.</li>';
  $('#onlineRoundLabel').textContent = online.phase === 'lobby' ? 'Lobby' : `Runde ${Math.min(online.round || 1, online.settings.rounds)} / ${online.settings.rounds}`;
  $('#onlineVersionLabel').textContent = api()?.versions?.[online.choices.version || online.settings.version]?.label || 'Version';
  $('#onlineDifficultyLabel').textContent = (online.choices.difficulty || online.settings.difficulty) === 'easy' ? 'Leicht' : 'Schwer';
  const remaining = online.phase === 'playing' ? Math.max(0, Math.ceil((online.deadline - Date.now()) / 1000)) : online.settings.timer;
  $('#onlineTimer').innerHTML = `${remaining}<small>s</small>`;
  $('#onlineWaiting').hidden = online.phase !== 'lobby' && online.phase !== 'ended';
  $('#onlineGame').hidden = online.phase === 'lobby';
  $('#onlineWaitingTitle').textContent = online.phase === 'ended' ? 'Spiel beendet' : online.phase === 'choose' ? 'Entscheidung läuft' : isHost ? 'Bereit?' : 'Warte auf den Host …';
  $('#onlineWaitingText').textContent = online.phase === 'ended' ? (online.winner ? `${online.winner.name} gewinnt!` : 'Danke fürs Spielen.') : online.phase === 'choose' ? 'Version und Schwierigkeit werden abgestimmt. Der Host startet gleich.' : isHost ? 'Du kannst die erste Runde starten.' : 'Sobald der Host startet, erscheint hier deine Bingo-Karte.';
  $('#onlineStart').hidden = !isHost || !['lobby', 'reveal', 'choose'].includes(online.phase) || Boolean(online.winner);
  $('#onlineStart').textContent = online.phase === 'lobby' ? 'Spiel starten' : online.phase === 'choose' ? 'Runde starten' : 'Nächste Runde';
  if (online.phase === 'choose') renderVote(); else $('#onlineVote').hidden = true;
  renderBingo(); renderReveal(); renderScore();
  if (online.phase === 'ended') $('#onlineGameStatus').textContent = online.winner ? `🏆 ${online.winner.name} hat Bingo!` : 'Spiel beendet.';
}
function renderVote() {
  const isHost = online.role === 'host', vote = $('#onlineVote'); vote.hidden = false;
  const myVote = online.votes[online.peerId] || {};
  const versions = Object.entries(api()?.versions || {}).filter(([id]) => id !== 'all');
  vote.innerHTML = `<label class="online-field">Version<select id="onlineVoteVersion">${versions.map(([id, v]) => `<option value="${esc(id)}" ${myVote.version === id ? 'selected' : ''}>${esc(v.label)}</option>`).join('')}</select></label><label class="online-field">Schwierigkeit<select id="onlineVoteDifficulty"><option value="easy" ${myVote.difficulty === 'easy' ? 'selected' : ''}>Leicht</option><option value="hard" ${myVote.difficulty === 'hard' ? 'selected' : ''}>Schwer</option></select></label><button class="btn btn-primary" id="onlineVoteSend" type="button">${isHost ? 'Auswahl übernehmen' : 'Abstimmen'}</button>`;
  $('#onlineVoteSend').addEventListener('click', () => {
    const version = $('#onlineVoteVersion').value, difficulty = $('#onlineVoteDifficulty').value;
    if (isHost) { online.choices = { version, difficulty }; online.votes[online.peerId] = { version, difficulty }; broadcastState(); render(); }
    else { online.votes[online.peerId] = { version, difficulty }; send('vote', { version, difficulty }); $('#onlineGameStatus').textContent = 'Stimme gespeichert. Der Host startet die Runde.'; }
  });
}
function renderBingo() {
  const card = online.card || [], grid = $('#onlineBingo');
  grid.innerHTML = card.map((cell, i) => {
    const marked = cell.free || online.marked.has(i);
    return `<button type="button" data-index="${i}" class="${online.selectedYear === i ? 'selected' : ''} ${marked ? 'hit' : ''}" ${cell.free || online.phase !== 'playing' || online.selectedYear != null ? 'disabled' : ''}>${cell.free ? 'FREI' : cell.year ?? ''}</button>`;
  }).join('');
  grid.classList.toggle('online-bingo-win', Boolean(online.winner && online.winner.id === (online.role === 'host' ? 'host' : online.peerId)));
}
function renderReveal() {
  if (online.phase !== 'reveal' && online.phase !== 'ended') { $('#onlineReveal').hidden = true; return; }
  if (!$('#onlineReveal').innerHTML) { $('#onlineReveal').hidden = false; $('#onlineReveal').innerHTML = `<strong>${online.winner ? 'Bingo!' : 'Aufgelöst'}</strong><p>${online.winner ? `${esc(online.winner.name)} hat eine Bingo-Reihe.` : 'Der Host startet die nächste Runde.'}</p>`; }
}
function renderScore() {
  const sorted = [...online.players].sort((a, b) => (b.score || 0) - (a.score || 0));
  $('#onlineScore').innerHTML = sorted.length ? sorted.map((p, i) => `<div><span>${i + 1}. ${esc(p.name)}${p.bingo ? ' · BINGO' : ''}</span><strong>${p.score || 0} Pkt.</strong></div>`).join('') : '';
}

let onlineAudio = null;
function audioUrl(song) { const base = api()?.API_BASE || ''; return song.previewUrl || (base ? `${base}/api/audio/${song.id}` : (song.streamUrl || '')); }
function setupAudio(url) {
  if (!onlineAudio) { onlineAudio = new Audio(); onlineAudio.preload = 'auto'; onlineAudio.addEventListener('timeupdate', () => { const bar = $('#onlineProgress'); if (bar && onlineAudio.duration) bar.style.width = `${Math.min(100, (onlineAudio.currentTime / onlineAudio.duration) * 100)}%`; }); }
  onlineAudio.pause(); onlineAudio.src = url || ''; onlineAudio.currentTime = 0; $('#onlinePlay')?.classList.remove('is-playing');
}
function playOnlineAudio() {
  if (!onlineAudio?.src) return;
  if (onlineAudio.paused) onlineAudio.play().then(() => $('#onlinePlay')?.classList.add('is-playing')).catch(() => api()?.showToast('Audio konnte nicht gestartet werden.', 3000));
  else { onlineAudio.pause(); $('#onlinePlay')?.classList.remove('is-playing'); }
}
function broadcastState() { if (online.role === 'host') send('state', publicState()); render(); }
function showReaction(emoji, name) { const layer = document.createElement('div'); layer.className = 'online-reaction-float'; layer.textContent = `${emoji} ${name}`; document.body.append(layer); setTimeout(() => layer.remove(), 2200); }
async function copyInvite() { try { await navigator.clipboard.writeText($('#onlineInvite').value); api()?.showToast('Einladungslink kopiert.', 2200); } catch { $('#onlineInvite').select(); document.execCommand?.('copy'); api()?.showToast('Link markiert – bitte kopieren.', 2600); } }

function boot() {
  buildScreen();
  const code = cleanCode(new URLSearchParams(location.search).get('online') || '');
  if (code) open(code);
  window.HitsterOnline = { open, close, state: online };
}
if (window.HITSTER) boot(); else window.addEventListener('hitster-ready', boot, { once: true });
