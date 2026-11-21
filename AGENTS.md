# AGENTS.md – repository memory

## What this is
Unofficial, ad-free, login-free HITSTER-style music party game and card expansion.
Node/Express backend + vanilla JS/CSS frontend. No frontend build step.
4,121 curated songs (1950–2024), 20 genres, 8 decades, 2,618 Spotify IDs.
Two modes: **Freies Spiel** (classic) and **Mit Original** (year from an original
Hitster card / QR scan). Cards are black with a vivid genre band, group/solo
symbol, vinyl, year, title, artist and QR. The on-screen Bingo scorecard and the
Anfänger/Experten answer tables were removed on purpose (the physical Hitster
Bingo cards are used instead).

## Commands
- `npm start` – serve on `PORT` (default 12000), binds 0.0.0.0.
- `npm test` – 29 catalog + API + range tests.
- `npm run test:e2e` – 32 Playwright E2E checks; needs Chromium at `/usr/bin/chromium`
  or `CHROMIUM_PATH`.
- `npm run test:a11y` – axe-core audit; server on 12000.
- `npm run test:audio` – 36 random clips + 15 iTunes/m4a fallbacks; server on 12000.
- `npm run test:small` – 320 px overflow/card/flip check; server on 12000.
- `npm run screenshots` – write `docs/screenshot-*.png`.
- `npm run build:static` – build `docs/` for GitHub Pages (catalog + 4,121 QR SVGs).
- `npm run build:catalog` – `data/songs.source.tsv` → `data/catalog.json`.
- `scripts/serve-watchdog.sh` – restart loop for production; logs to `server.log`.

## Architecture
- `server/index.js` – Express, CSP/security headers, `/api/{health,catalog,random,song,bingo,audio,art,qr,resolve}`.
- `server/catalog.js` – loads `data/catalog.json`, filters, random pick, Bingo
  answers (API compatibility only); precomputes `publicSongs` for `/api/catalog`.
- `server/audio.js` – Deezer preview first, iTunes fallback, disk+LRU cache,
  HTTP Range, 800 MB prune. Direct sources and search APIs run in parallel.
- `public/app.js` – state, audio, 25 s timer, 3D flip, filters, localStorage
  stats/prefs/round, modals, confetti, keyboard, year mode, QR scanner, print
  builder, URL deep links (`?card=`, `?year=`), Spotify scan recognition.
- `public/styles.css` – dark card with genre accent (`--c`), vinyl glow,
  59/91 aspect, 3×3 print CSS (59×91 mm), reduced motion.
- `public/index.html` – SVG sprite, card front/back, mode switch, extension bar,
  scan/print modals, `#printRoot`; no Bingo scorecard/answers.
- `public/vendor/jsqr.js` – vendored QR decoder; no external CDN.
- `scripts/build-static.js` – GitHub Pages build in `docs/`: relative assets,
  slim `catalog.json`, pre-generated `qr/<id>.svg`, `data-static="true"`.

## Data format
`data/songs.source.tsv` lines: `year|genre|G/S|artist|title|tags`
- `G` group/duo/feature, `S` solo; tags comma-separated (`onehit`, `cover`).
- Genres: pop, rock, indie, electronic, hiphop, rnb, funk, metal, punk, country,
  folk, jazz, schlager, deutschpop, deutschrap, latin, reggae, film, klassik,
  ndw, ska.
- Years should be original release / first public performance (Hitster rule).

## Key decisions / caveats
- **Round:** `state.roundSeen` is a persisted Set of song ids. `pickSong` and
  `applyYear` exclude it, so a round never repeats a card. `resetRound()` clears
  it plus stats and draws a new card.
- **Scan:** `parseScan` accepts `?card=`, `?year=`, bare years, Spotify track
  URLs/URIs and bare 22-char Spotify ids. `/api/resolve` first matches the
  catalog by Spotify id, then Spotify page metadata, then oEmbed title. The app
  excludes the scanned song and draws a different song from the same year.
- **Node audio:** always proxied (`/api/audio/:id`) because Deezer preview URLs
  are signed and expire. Static GitHub Pages mode resolves iTunes previews in the
  browser (`itunesId`/search) and uses pre-generated `qr/` SVGs.
- Spotify needs no API credentials. Track ids come from the open CSV
  `gabminamedez/spotify-data` (gitignored). Missing ids fall back to Spotify search.
- The Spotify dataset's `year` is often a reissue year; do NOT use it to correct
  catalog years. Use curated years; anchors are tested.
- `npm test` excludes E2E.
- CSP allows `frame-src https://open.spotify.com` only; no inline scripts.
- `/api/catalog` cached 1 day; versioned assets 1 year. `publicSong` is lean
  (no album/art/duration/spotifyUrl) → ~144 KB gzip.
- `tests/a11y.mjs` uses `bypassCSP` because axe is injected inline.
- QR cards encode `${base}/?card=<id>`; `base` is `location.origin` (Node) or the
  GitHub Pages URL (static build). Print cards are 59×91 mm, 3×3 per A4 page;
  back sheets use `direction: rtl` for duplex long-edge alignment.
- No online multiplayer, accounts, or server-side game state. Stats/round are local.
- `window.HITSTER` exposes state/actions for tests; keep it harmless (no secrets).
- The static build has no `/api/*`; it uses `catalog.json`, `qr/`, iTunes previews
  and local Spotify-id matching plus a Spotify oEmbed title fallback. Truly unknown
  titles require manual year entry.

## Style
German UI copy, informal “du”. No ads, no tracking, no login. Keep the card the
visual center: black card, colorful genre band, group/solo **symbol** (not text),
large year, title/artist, QR. No Bingo scorecard or Anfänger/Experten tables.
