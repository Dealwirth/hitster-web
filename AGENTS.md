# AGENTS.md – repository memory

## What this is
Unofficial, ad-free, login-free HITSTER-style music party game and card expansion.
Node/Express backend + vanilla JS/CSS frontend. No frontend build step.
4,421 curated songs (1950–2026), 20 genres, 8 decades, 2,618 Spotify IDs + 300 chart hits.
Three modes: **Freies Spiel** (classic), **Mit Original** (real Hitster QR scan only,
blind draw from the same year) and **Playlist** (Spotify playlist, all tracks). The card
front is deliberately neutral (no year, title, genre, group or QR); the back
reveals year, title, artist, genre, group/solo and source, each exactly once.
A fixed vinyl player shows cover, progress, pause/replay and hides the title until flip.
Own playlists can be saved as local categories; no auto genre filter and no
difficulty/Bekanntheit UI.

## Commands
- `npm start` – serve on `PORT` (default 12000), binds 0.0.0.0.
- `npm test` – 29 catalog + API + range tests.
- `npm run test:e2e` – 32 Playwright E2E checks; needs Chromium at `/usr/bin/chromium`
  or `CHROMIUM_PATH`.
- `npm run test:v4` – blind scan, deck selection, full playlist, own categories,
  PWA and print; needs Chromium and network for Spotify/MusicBrainz.
- `npm run test:static` – builds and serves `docs/`, checks blind card, real QR,
  PWA and runtime errors against a local API.
- `npm run test:a11y` – axe-core audit; server on 12000.
- `npm run test:audio` – 36 random clips + all iTunes/m4a headers + 24 fallback playbacks; server on 12000.
- `npm run test:small` – 320 px overflow/card/flip check; server on 12000.
- `npm run screenshots` – write `docs/screenshot-*.png`.
- `npm run build:static` – build `docs/` for GitHub Pages (catalog, `hitster-db.json`,
  4,421 QR SVGs, PWA). Set `PUBLIC_API_BASE` for playlist/Spotify resolution.
- `npm run build:catalog` – `data/songs.source.tsv` → `data/catalog.json`.
- `npm run build:charts` – add current iTunes chart hits to `data/catalog.json`.
- `scripts/serve-watchdog.sh` – restart loop for production; logs to `server.log`.

## Architecture
- `server/index.js` – Express, CSP/security headers,
  `/api/{health,catalog,random,song,bingo,audio,art,qr,resolve,spotify/track,playlist}`;
  MusicBrainz year/group cache.
- `server/catalog.js` – loads `data/catalog.json`, filters, random pick, Bingo
  answers (API compatibility only); precomputes `publicSongs` for `/api/catalog`.
- `server/audio.js` – Deezer preview first, iTunes fallback, disk+LRU cache,
  HTTP Range, 800 MB prune. Direct sources and search APIs run in parallel.
- `public/app.js` – state, audio, 30 s timer, 3D flip, decade/one-hit/Spotify
  filters, blind extension mode, real Hitster QR scanner with deck selector,
  Spotify playlist mode, fixed media player, PWA install, print builder, URL deep
  links (`?card=`, `?year=`, `?mode=playlist&playlist=`), localStorage
  stats/prefs/round.
- `public/styles.css` – neutral front, genre accent only after flip, vinyl/tonearm,
  media player, playlist/categories, PWA install, 59/91 aspect, 3×3 print CSS,
  reduced motion.
- `public/index.html` – SVG sprite, blind card front, info back, 3-way mode switch,
  extension/playlist bars, scan/print/help modals, media player, `#printRoot`.
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
  compilation reissue years. The app excludes the scanned song and draws a
  different song from the same year.
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
- No online multiplayer, accounts, or server-side game state. Stats/round are local.
- `window.HITSTER` exposes state/actions for tests; keep it harmless (no secrets).
- The static build has no `/api/*` of its own; it uses `catalog.json`,
  `hitster-db.json`, `qr/`, iTunes previews and a configurable `hitster-api` meta
  for Spotify playlist/track resolution. Without that API, catalogue, QR scan,
  audio fallback and print still work.

## Style
German UI copy, informal “du”. No ads, no tracking, no login. Keep the card the
visual center: neutral black front; genre color, year, title/artist, genre and
group/solo only on the back. No Bingo scorecard or Anfänger/Experten tables.
Front must stay spoiler-free.
