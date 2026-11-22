# AGENTS.md – repository memory

## What this is
Unofficial, ad-free, login-free HITSTER-style music party game and card expansion.
Node/Express backend + vanilla JS/CSS frontend. No frontend build step.
4,860 curated songs (1950–2026), 21 genres, 8 decades, 300 chart hits + 63 curated classics + 181 Songseeker rock/metal songs + 36 oldie fillers + 159 soundtrack/one-hit pool cards. Every year 1950–2026 has at least 10 songs.
Modes: **Online-Bingo** (primary, host-authoritative PeerJS/BroadcastChannel room), **Freies Spiel** (classic), **Versionen** (13 broad presets such as Guilty Pleasures, Party & Dance, Rock & Metal) and **Playlist** (Spotify playlist, all tracks). The app opens on the mode landing page by default; `?play=1` starts free play directly and `?online` opens the Bingo lobby. Online Bingo follows the official game 1:1: every player has a 5×5 color card with each of five categories exactly five times, all players vote version + song familiarity + difficulty (Einsteiger Seite A / Expert Seite B), the host spins a category, the clip plays synchronized, and a correct answer lets the player mark a matching-color cell. The host configures answer time and mark time; all players answered -> immediate reveal, all pending marks done -> automatic next round, and the mark window ends with five blinks plus a random valid cell. Two-digit years expand contextually (84 -> 1984, 06 -> 2006). There is no fixed round limit: play continues until a full row/column/diagonal; then the room votes whether to continue until the next Bingo. Song pools are classified as known / mixed / unknown; Bingo defaults to known and can be changed in setup. Bingo versions: Party & Dance, Rock & Metal, Deutsch, Guilty Pleasures, One-Hit-Wonder, Oldies, 90s Party, Love & Heartbreak, Film & Musical, Summer Hits, Charts & Neu, Bangers. Real Hitster QR scans remain available from every mode; they use the card year but draw a different song from that year. The card front is deliberately neutral (no year, title, genre, group or QR);
the back shows the large release year, title, artist, solo/band icon and all matching music/Bingo category chips. Current version: **4.12.0**. The classic card is flipped by tapping it; swiping (or `N`) draws and auto-plays the next card; the old next/flip buttons are removed. A familiarity filter (Alle/Bekannt/Gemixt/Unbekannt) is URL-synced in free play and versions. Online Bingo uses a five-color spinning wheel with a central disco ball; every Bingo card has each category exactly five times, at most twice per row/column, and a randomized layout. Every version preset exposes at least 500 cards.
A fixed vinyl player shows cover, progress, pause/replay and hides the title until flip. Local analytics aggregate versions, genres, modes, decades, scans and actions in `localStorage`; they are never uploaded.
Own playlists can be saved as local categories. Genre, decade, version and familiarity chips filter the catalog and are URL-synced.

## Commands
- `npm start` – serve on `PORT` (default 12000), binds 0.0.0.0.
- `npm test` – 32 catalog + API + range + Songseeker card tests.
- `npm run test:e2e` – 38 Playwright E2E checks; needs Chromium at `/usr/bin/chromium`
  or `CHROMIUM_PATH`.
- `npm run test:v4` – blind scan, deck selection, full playlist, own categories,
  PWA and print; needs Chromium and network for Spotify/MusicBrainz.
- `npm run test:v5` – all 51,208 official cards, 4,860-song catalog, genre chips,
  card/SKU deep links (different same-year song), new audio and the full 664-track playlist.
- `npm run test:online` – landing page, version pools, database route, playlist
  browser cache, online bingo host/player, QR and audio; server on 12000.
- `npm run test:static` – builds and serves `docs/`, checks blind card, real QR,
  PWA and runtime errors against a local API.
- `npm run test:a11y` – axe-core audit; server on 12000.
- `npm run test:audio` – 36 random clips + all iTunes/m4a headers + 24 fallback playbacks; server on 12000.
- `npm run test:small` – 320 px overflow/card/flip check; server on 12000.
- `npm run screenshots` – write `docs/screenshot-*.png`.
- `npm run build:static` – build `docs/` for GitHub Pages (catalog, `hitster-db.json`,
  `hitster-database.json`, `hitster-cards.json`, 4,860 QR SVGs, `online.js`, PWA).
  Set `PUBLIC_API_BASE` for playlist/Spotify resolution and online QR.
- `npm run build:database` – `data/hitster-database.json` with all songs, categories,
  version/year coverage and download metadata.
- `npm run build:catalog` – `data/songs.source.tsv` → `data/catalog.json`.
- `npm run build:charts` – add current iTunes chart hits to `data/catalog.json`.
- `npm run import:cards` – Songseeker CSVs → `public/hitster-cards.json`.
- `npm run add:rock` – add missing Songseeker Rock/Metal songs to the catalog.
- `npm run add:years` – fill years below ten songs with curated oldies and iTunes/Deezer previews.
- `npm run add:versions` – expand the Movie and One-Hit pools to at least 200 cards. The app/database layer additionally fills every preset to at least 500 cards.
- `npm run repair:versions` – resolve previews/art for imported pool cards and keep the Movie pool at 200.
- `scripts/serve-watchdog.sh` – restart loop for production; logs to `server.log`.

## Architecture
- `server/index.js` – Express, CSP/security headers,
  `/api/{health,catalog,random,song,audio,art,qr,resolve,spotify/track,playlist,database}`;
  `GET /api/qr?text=` for invite QR codes; playlist disk cache (`data/.cache/playlists`, 7 days);
  MusicBrainz year/group cache with retries, iTunes year fallback. Bingo API removed.
- `server/catalog.js` – loads `data/catalog.json`, filters, random pick; precomputes `publicSongs` for `/api/catalog`.
- `server/audio.js` – Deezer preview first, iTunes fallback, disk+LRU cache,
  HTTP Range, 800 MB prune. Direct sources and search APIs run in parallel.
- `public/app.js` – state, audio, 30 s timer, 3D flip, decade/one-hit/Spotify,
  genre and version filters, blind scan/year mode, real Hitster QR scanner with deck
  selector, Spotify playlist mode, fixed media player, PWA install, print builder,
  URL deep links (`?card=`, `?year=`, `?mode=versions&version=guilty`), local
  analytics and localStorage stats/prefs/round.
- `public/styles.css` – neutral front, genre accent only after flip, vinyl/tonearm,
  media player, playlist/categories, online bingo, start screen, PWA install,
  54/84 and 59/91 print CSS, reduced motion.
- `public/index.html` – SVG sprite, blind card front, info back with category chips,
  start screen, mode switch (incl. Online/Drucken), version/genre panels, scan/print/help
  modals, media player, `#printRoot`.
- `public/online.js` – online bingo UI, host-authoritative state, PeerJS WebRTC transport,
  BroadcastChannel fallback (`?localonline=1`), lobby/room/vote/reveal/score, QR invite.
- `public/vendor/peerjs.min.js` – vendored PeerJS; no CDN at runtime.
- `public/manifest.webmanifest`, `public/sw.js`, `public/icons/` – installable PWA.
- `public/vendor/jsqr.js` – vendored QR decoder; no external CDN.
- `scripts/build-static.js` – GitHub Pages build in `docs/`: relative assets,
  slim `catalog.json` with art/popularity, `hitster-db.json`, pre-generated
  `qr/<id>.svg`, PWA assets, `data-static="true"`, `hitster-api` meta.

## Data format
`data/songs.source.tsv` lines: `year|genre|G/S|artist|title|tags`
- `G` group/duo/feature, `S` solo; tags comma-separated (`onehit`, `cover`).
- Genres: pop, rock, indie, electronic, hiphop, rnb, funk, metal, punk, country,
  folk, jazz, schlager, deutschpop, deutschrap, latin, reggae, film, klassik,
  ndw, ska.
- Years should be original release / first public performance (Hitster rule).
- `public/hitster-db.json`: official Jumbo gamesets (176), card number → Spotify
  id + `ArtistType: solo|group`. The QR only encodes region + card number; the
  deck is ambiguous and is selected in the scanner.

## Key decisions / caveats
- **Round:** `state.roundSeen` is a persisted Set of song ids. `pickSong` and
  `applyYear` exclude it, so a round never repeats a card. `resetRound()` clears
  it plus stats and draws a new card.
- **Scan:** `parseScan` accepts real `hitstergame.com/<region>/<card>` QR codes,
  `?card=`, `?year=`, bare years, Spotify track/playlist URLs/URIs and bare
  22-char Spotify ids. `/api/resolve` matches the catalog by Spotify id, then
  Spotify embed, then oEmbed. MusicBrainz `first-release-date` corrects
  compilation reissue years; iTunes is a fallback when MusicBrainz is rate-limited.
  The app excludes the scanned song and draws a different song from the same year;
  the card's own title/artist is never shown as the answer.
- **Blind rule:** the UI must never expose the year/title/genre/group before flip:
  no front badge, no hint, no toast, no URL `year=`, and no year input. Print is
  the exception (backs contain the answer).
- **Node audio:** always proxied (`/api/audio/:id`) because Deezer preview URLs
  are signed and expire. Static GitHub Pages mode resolves iTunes previews in the
  browser (`itunesId`/search) and uses pre-generated `qr/` SVGs.
- Spotify needs no API credentials. Playlist fetching uses the public Pathfinder
  query with a guest token from a public embed; no user login. Track ids come from the open CSV
  `gabminamedez/spotify-data` (gitignored). Missing ids fall back to Spotify search.
- The Spotify dataset's `year` is often a reissue year; do NOT use it to correct
  catalog years. Use curated years; anchors are tested. For unknown scans use
  MusicBrainz `first-release-date` before Spotify releaseDate.
- `npm test` excludes E2E.
- CSP allows remote `https:` images/media for Spotify/Deezer covers and previews;
  `frame-src https://open.spotify.com`; no inline scripts.
- `/api/catalog` cached 1 day; versioned assets 1 year. `publicSong` exposes
  `artUrl`, `popularity`, `deezerId`, `source` for v4 cards; still no album/duration.
- `tests/a11y.mjs` uses `bypassCSP` because axe is injected inline.
- QR cards encode `${base}/?card=<id>`; `base` is `location.origin` (Node) or the
  GitHub Pages URL (static build). Print cards are 59×91 mm, 3×3 per A4 page;
  back sheets use `direction: rtl` for duplex long-edge alignment.
- No online multiplayer, accounts, or server-side game state. Stats/round and
  aggregated analytics are local-only; analytics can be exported or cleared in help.
- `window.HITSTER` exposes state/actions for tests; keep it harmless (no secrets).
- Songseeker card metadata lives in `data/songseeker/` (MIT, 18 decks, 5,192 cards)
  and is compiled by `scripts/import-songseeker.js` into `public/hitster-cards.json`.
  The scanner uses it for exact title/artist/year/group; never replace those years
  with Spotify reissue years. The played track is a different song from the same year.
  Rock/Metal expansion: `scripts/add-songseeker-rock.js`; oldie fillers:
  `scripts/add-year-fillers.js`.
- The static build has no `/api/*` of its own; it uses `catalog.json`,
  `hitster-db.json`, `hitster-cards.json`, `qr/`, iTunes previews and a
  configurable `hitster-api` meta for Spotify playlist/track resolution. Without
  that API, catalogue, QR scan, audio fallback and print still work.

## Style
German UI copy, informal “du”. No ads, no external tracking, no login. Keep the card the
visual center: neutral black front; on the back only the large release year,
song title, artist and a solo/band icon top right. No Bingo answers, no source
footer, no genre chips. Front must stay spoiler-free.
