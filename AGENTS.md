# AGENTS.md – repository memory

## What this is
Unofficial, ad-free, login-free HITSTER-style music party game and card expansion.
Node/Express backend + vanilla JS/CSS frontend. No frontend build step.
4,121 curated songs (1950–2024), 20 genres, 8 decades, 2,618 Spotify IDs.
Three modes: classic, bingo, extension (year from an original card / QR scan).
Printable 62×88 mm cards with QR codes; no online multiplayer.

## Commands
- `npm start` – serve on `PORT` (default 12000), binds 0.0.0.0.
- `npm test` – 27 catalog + API + range tests (`tests/catalog.test.js`, `tests/api.test.js`, `tests/range.test.js`).
- `npm run test:e2e` – 31 Playwright E2E checks; needs Chromium at `/usr/bin/chromium`
  or `CHROMIUM_PATH`.
- `npm run test:a11y` – axe-core audit; requires the server on port 12000.
- `npm run test:audio` – 36 random clips + 15 iTunes/m4a fallbacks; server on 12000.
- `npm run test:small` – 320 px overflow/card/flip check; server on 12000.
- `npm run screenshots` – write screenshots to `docs/`.
- `npm run build:catalog` – resolve `data/songs.source.tsv` → `data/catalog.json`.
  Resumable via `data/.cache/resolved.json`; `--force`, `--limit=N`.
- `scripts/expand-catalog.js` / `scripts/expand-oldies.js` – catalog expansion
  helpers; the merged source of truth is `data/songs.source.tsv`.

## Architecture
- `server/index.js` – Express, CSP/security headers, `/api/{health,catalog,random,song,bingo,audio,art,qr}`.
- `server/catalog.js` – loads `data/catalog.json`, filters, random pick, Bingo answers.
- `server/audio.js` – Deezer preview first, iTunes fallback, disk+LRU cache,
  HTTP Range, 800 MB audio cache prune.
- `public/app.js` – state, audio, 25 s timer, 3D flip, filters, Bingo scorecard,
  localStorage stats/prefs, modals, confetti, keyboard shortcuts, year mode,
  QR scanner (`jsQR`), print sheet builder, URL deep links (`?card=`, `?year=`).
- `public/styles.css` – paper-card design; card width `min(380px, 92vw)`,
  genre accent via inline `--c`, print CSS for 62×88 mm cards, reduced motion.
- `public/index.html` – inline SVG sprite; card front/back; all 10 Bingo categories;
  mode switch, extension bar, scan/print modals, `#printRoot`.
- `public/vendor/jsqr.js` – vendored QR decoder; no external CDN.

## Data format
`data/songs.source.tsv` lines: `year|genre|G/S|artist|title|tags`
- `G` group/duo/feature, `S` solo; tags comma-separated (`onehit`, `cover`).
- Genres: pop, rock, indie, electronic, hiphop, rnb, funk, metal, punk, country,
  folk, jazz, schlager, deutschpop, deutschrap, latin, reggae, film, klassik,
  ndw, ska.
- Years should be original release / first public performance (Hitster rule).

## Key decisions / caveats
- Audio is always proxied (`/api/audio/:id`) because Deezer preview URLs are
  signed and expire; never store the signed URL, store the Deezer track id.
- Spotify needs no API credentials. Track ids come from the open CSV
  `gabminamedez/spotify-data` (downloaded to `data/.cache/spotify-ids.csv`,
  gitignored). Missing ids fall back to a Spotify search URL.
- The Spotify dataset's `year` is often a reissue year; do NOT use it to correct
  catalog years. Use curated years; anchors are tested.
- `npm test` intentionally excludes E2E (glob `tests/*.test.js` would include it).
- CSP allows `frame-src https://open.spotify.com` only; no inline scripts.
- `tests/a11y.mjs` uses `bypassCSP` because axe is injected inline.
- Data/cache folders (`data/.cache`, `test-results`) are gitignored.
- QR cards encode `${base}/?card=<id>`; the scanner also accepts bare years and
  `?year=`. `base` comes from `location.origin` so HTTPS deployments work.
- Print cards are 62×88 mm, 3×2 per A4 page; back sheets use `direction: rtl`
  so duplex “flip on long edge” aligns. `#printRoot` is hidden on screen.
- No online multiplayer, accounts, or server-side game state. Stats/scorecard
  are local only.
- The debug API `window.HITSTER` exposes state and actions for tests; keep it
  harmless (no secrets).

## Style
German UI copy, informal “du”. No ads, no tracking, no login. Keep the card the
visual center. All ten Bingo categories must remain visible on the card.
