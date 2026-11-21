# HITSTER Web – Karten-Erweiterung

**Die kostenlose, werbefreie Karten-Erweiterung für Hitster – direkt im Browser.**
4.665 Songs · 30-Sekunden-Clips · echte Hitster-QR-Codes · Spotify-Playlists · eigene Kategorien · PWA · Karten zum Ausdrucken.
Kein Login, kein Tracking, keine Werbung. Open Source (MIT).

![HITSTER Web – Kartenvorderseite](docs/screenshot-front.png)

- **Live (GitHub Pages):** https://dealwirth.github.io/hitster-web/
- **Quellcode:** https://github.com/Dealwirth/hitster-web
- **Lokal:** `npm install && npm start` → http://localhost:12000

> Inoffizielles Fanprojekt. HITSTER ist eine Marke der Jumbo Group bzw. ihrer
> Rechteinhaber. Dieses Projekt ist nicht mit HITSTER verbunden.

## Was die App kann

- **Freies Spiel:** Zufällige Karte ziehen, 30-Sekunden-Clip hören, Jahr raten, umdrehen.
- **Mit Original:** **echten Hitster-QR-Code scannen** – kein Jahr eintippen. Die App liest Kartenset, Titel, Interpret und das aufgedruckte Jahr direkt aus der Karten-Datenbank. Das Jahr bleibt vor dem Umdrehen unsichtbar, der Clip ist das Original-Lied.
- **Kartenset wählen:** Original, Bingo, 100 % Deutsch, Rock, Schlager, Hip-Hop usw.
  Der QR-Code enthält Region, Set-Kürzel und Kartennummer (z. B. `de/aaaa0019/00052`); das Set wird automatisch erkannt.
- **QR-Scanner:** Kamera oder Foto auf die Rückseite halten – erkennt echte
  Hitster-URLs wie `hitstergame.com/de/00052`, `.../00128` oder `.../de/aaaa0019/00215` automatisch.
  Kein Link eintippen, kein Jahr ablesen. Zusätzlich werden Spotify-Track-Links,
  Jahreszahlen und die QR-Codes unserer gedruckten Karten erkannt.
- **Spotify-Playlist:** Link einfügen – **alle** Lieder der Playlist werden übernommen, nicht nur die ersten 50/100. Titel, Jahr, Vorschau und Cover kommen direkt von Spotify; kein Login/API-Key nötig.
- **Eigene Kategorien:** Jede geladene Playlist lässt sich lokal als eigene Kategorie speichern, wieder laden und löschen. Keine falschen Auto-Genres nötig.
- **Runde ohne Doppel:** Jede Karte kommt in einer Runde nur einmal. „Neue Runde“
  setzt Karten, Statistik und Fortschritt zurück.
- **Hitster-Optik:** Vorderseite neutral (kein Jahr, kein Genre, kein Titel), Rückseite
  nur mit großem Erscheinungsjahr, Songtitel, Interpret und Solo/Band-Icon oben
  rechts. Keine Bingo-Antworten, keine Werbung, keine Ablenkung.
- **Bekannte Songs:** 300 zusätzliche Chart-Hits aus iTunes-Charts, 63 kuratierte
  Klassiker und **181 neue Rock-/Metal-Songs** aus dem Songseeker-Rock-Deck,
  gemischt mit dem bestehenden Katalog.
- **Druckbogen:** 9 Karten pro A4-Seite, **59 × 91 mm**, Vorder- und Rückseite,
  duplexfähig (lange Kante spiegeln). Vorderseite mit QR, Rückseite mit Auflösung.
- **PWA:** Installierbar, offlinefähige Shell, Manifest, Icons, Service Worker.
- **Filter:** 8 Jahrzehnte, **21 Musikrichtungen mit Live-Trefferzahlen**, One-Hit-Wonder
  und „nur mit Spotify-Link“. Die Auswahl steht in der URL (`?genre=rock`) und lässt
  sich mit einem Klick zurücksetzen.
- **Scan ohne Tippen:** Ein großer Sucher mit animiertem Rahmen zeigt sofort, ob
  die Kamera aktiv ist. Alternativ lässt sich ein Foto der Karte wählen. Die App
  erkennt Region, Kartennummer und Kartenset automatisch. Deep-Links wie
  `?hitster=de/00052` funktionieren weiterhin.

## So spielst du

### Freies Spiel
1. Karte ziehen (oder Filter setzen).
2. Clip abspielen und Jahr raten.
3. Karte umdrehen – Jahr, Titel und Interpret stehen auf der Rückseite.

### Mit Original-Hitster-Karte
1. **Karte scannen** drücken – der Button ist immer sichtbar.
2. QR-Code der Originalkarte mit Kamera oder Foto scannen. Kein Jahr eintippen.
3. Die App erkennt das Set, den Song und das aufgedruckte Jahr; der Clip läuft direkt.
4. Clip hören, im Zeitstrahl einsortieren, umdrehen, auflösen.

### Karten drucken
1. „Druckbogen erstellen“ öffnen.
2. 9, 18 oder 27 Karten wählen.
3. Beidseitig drucken, an der **langen Kante spiegeln**, ausschneiden.
4. Im Druckdialog **Hintergrundgrafiken** aktivieren, damit die Farben mitgedruckt werden.

![Druckbogen – 9 Karten pro A4-Seite](docs/screenshot-print.png)

## QR-Codes

| QR-Inhalt | Verhalten |
|---|---|
| `hitstergame.com/de/00008` | Echte Hitster-Karte: Set automatisch erkennen, exaktes Jahr/Titel/Interpret laden, Clip abspielen. |
| `hitstergame.com/de/aaaa0019/00215` | Echte Karte mit Set-Kürzel: exakte Bingo-Karte (Better in Time, 2007). |
| `…/?card=s0042` | Öffnet genau diese Karte. |
| `1984` oder `…/?year=1984` | Interner Deep-Link: zieht ein Lied aus 1984. |
| `https://open.spotify.com/track/…` | Erkennt das Lied, ermittelt das Jahr und zieht ein anderes Lied aus diesem Jahr. |
| `https://open.spotify.com/playlist/…` | Lädt die Playlist als Kartenrunde. |
| `spotify:track:…` | Wie Spotify-Link. |
| Unbekannt | Jahr manuell eingeben. |

## Technik

- **Frontend:** Vanilla JS, CSS, keine Build-Pflicht, keine Frameworks.
- **Backend (lokal/Server):** Node.js + Express.
- `/api/catalog` – Katalog (gzip, 1 Tag cachebar)
  - `/api/song/:id` – eine Karte
  - `/api/audio/:id` – 30-Sekunden-Clip über Deezer/iTunes-Proxy (RAM-/Disk-Cache)
  - `/api/qr/:id` – QR-Code als SVG
  - `/api/art/:id` – Cover-Proxy mit Cache
  - `/api/resolve?spotify=…` – Spotify-Link → Titel/Künstler/Jahr (Katalog + Spotify-Metadaten)
  - `/api/spotify/track/:id` – Spotify-Embed-Metadaten + MusicBrainz-Erstveröffentlichung
- `/api/playlist?url=…` – Spotify-Playlist → **alle** Karten mit Jahr, Vorschau und Cover
- **Daten:** `data/songs.source.tsv` (Quelle) → `data/catalog.json` (4.665 Songs, 1950–2026), ergänzt um Chart-Hits, kuratierte Klassiker und Songseeker-Rock/Metal.
- **Echte Kartendaten:** `public/hitster-cards.json` mit **5.192 Karten aus 18 Decks** (Titel, Interpret, Jahr, Solo/Band, Spotify-/YouTube-Link) aus [Songseeker](https://github.com/andygruber/songseeker-hitster-playlists) (MIT). Import: `npm run import:cards`.
- **Statische Version:** `docs/` ist ein GitHub-Pages-Build. Sie nutzt `catalog.json`,
  `hitster-db.json`, `hitster-cards.json`, vorgenerierte QR-Codes und iTunes-Vorschauen direkt im Browser.
  Für Playlist/Spotify-Auflösung wird die Server-API über `PUBLIC_API_BASE` eingebunden
  (Standard: die Work-URL). Ohne API funktionieren Katalog, QR-Scan, Audio und Druck weiter.
- **PWA:** `public/manifest.webmanifest`, `public/sw.js`, Icons in `public/icons/`.

### Performance

- Katalog wird einmal aufbereitet und gzip ausgeliefert: **~1,6 MB roh / ~320 KB gzip**.
- Die exakte Karten-Datenbank (`hitster-cards.json`) ist **~2,0 MB roh / ~420 KB gzip**
  und wird nur beim ersten Scan geladen.
- `/api/catalog` ist **1 Tag** cachebar, versionierte CSS/JS-Dateien **1 Jahr**
  (`immutable`), Asset-Version `4.5.0`.
- Audio-Quellen werden **parallel** (Deezer/iTunes) aufgelöst, Timeouts 8–15 s.
- Cache-Hits brauchen keinen Verzeichnis-Scan.
- `scripts/serve-watchdog.sh` startet den Node-Prozess nach einem Absturz neu.

## Projektstruktur

```
.
├── public/                 Frontend (index.html, app.js, styles.css, fonts/, vendor/)
├── server/                 Express-API, Katalog, Audio-Proxy
├── data/                   songs.source.tsv, catalog.json, Caches
├── scripts/                Katalog-Erweiterung, Static-Build, Watchdog
├── docs/                   GitHub-Pages-Build + Screenshots
├── tests/                  Unit/API, E2E, A11y, Small-Viewport, Audio
└── README.md
```

## Entwicklung

```bash
npm install
npm start              # http://localhost:12000
npm test               # Unit- und API-Tests
npm run test:e2e       # Browser-E2E (Chromium, 32 Checks)
npm run test:v4        # Scan, Kartenset, Playlist, eigene Kategorien, PWA, Druck (Chromium)
npm run test:v5        # 51.208 Karten, Genre-Filter, exakter Karten-Link, 664-Track-Playlist
npm run test:static    # GitHub-Pages-Build + lokale API (Chromium)
npm run test:a11y      # Barrierefreiheit
npm run test:small     # 320-px-Viewport
npm run test:audio     # echte Audio-Clips
npm run screenshots    # docs/screenshot-*.png
```

### GitHub-Pages-Build

```bash
PUBLIC_API_BASE=https://dein-server.example npm run build:static
# schreibt docs/ (Katalog, hitster-db.json, QR-Codes, PWA-Assets)
```

GitHub Pages wird aus `main` / `/docs` veröffentlicht:
https://dealwirth.github.io/hitster-web/

### Server mit Auto-Restart

```bash
setsid ./scripts/serve-watchdog.sh >/dev/null 2>&1 < /dev/null &
```

Logs: `server.log`. Für Dauerbetrieb eignen sich auch systemd, PM2 oder Docker.

## Daten & Lizenz

- 4.665 Songs, 1950–2026, 21 Genres, 300 Chart-Hits, 63 kuratierte Klassiker, 181 Rock-/Metal-Ergänzungen.
- Song-Clips sind offizielle 30-Sekunden-Vorschauen von Deezer, Spotify bzw. iTunes.
- Jahres-Auflösung: kuratierter Katalog, sonst MusicBrainz-Erstveröffentlichung, sonst iTunes/Spotify.
- Echte Kartendaten: `public/hitster-db.json` (176 Spieldatenbanken, Karten → Spotify-ID + Gruppe/Solo) und `public/hitster-cards.json` (5.192 Karten mit exakten Songdaten).
- Kein Login, keine Werbung, kein Tracking, kein Online-Mehrspieler.
- Code: **MIT-Lizenz**. HITSTER-Marke und Originalkarten gehören den jeweiligen
  Rechteinhabern.
