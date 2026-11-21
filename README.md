# HITSTER Web – Karten-Erweiterung

**Die kostenlose, werbefreie Karten-Erweiterung für Hitster – direkt im Browser.**
4.121 Songs · 20 Musik-Kategorien · 30-Sekunden-Clips · QR-Scanner · Karten zum Ausdrucken.
Kein Login, kein Tracking, keine Werbung. Open Source (MIT).

![HITSTER Web – Kartenvorderseite](docs/screenshot-front.png)

- **Live (GitHub Pages):** https://dealwirth.github.io/hitster-web/
- **Quellcode:** https://github.com/Dealwirth/hitster-web
- **Lokal:** `npm install && npm start` → http://localhost:12000

> Inoffizielles Fanprojekt. HITSTER ist eine Marke der Jumbo Group bzw. ihrer
> Rechteinhaber. Dieses Projekt ist nicht mit HITSTER verbunden.

## Was die App kann

- **Freies Spiel:** Zufällige Karte ziehen, 25-Sekunden-Clip hören, Jahr raten, umdrehen.
- **Mit Original:** Jahr deiner Hitster-Karte eingeben oder QR-Code scannen. Wir ziehen
  ein **anderes** Lied aus demselben Jahr – perfekt für das Sortierspiel.
- **QR-Scanner:** Erkennt Spotify-Track-Links, Jahreszahlen und die QR-Codes unserer
  gedruckten Karten. Bei Spotify-Links wird das Lied erkannt und das Jahr ermittelt.
- **Runde ohne Doppel:** Jede Karte kommt in einer Runde nur einmal. „Neue Runde“
  setzt Karten, Statistik und Fortschritt zurück.
- **Hitster-Optik:** Schwarze Karten mit kräftiger Genre-Farbe, Vinyl, Gruppe/Solo-Symbol,
  großem Jahr, Titel, Interpret und QR-Code. Keine Bingo-Scorecard, keine
  Anfänger/Experten-Tabellen – die physischen Bingo-Karten reichen.
- **Druckbogen:** 9 Karten pro A4-Seite, **59 × 91 mm**, Vorder- und Rückseite,
  duplexfähig (lange Kante spiegeln). Vorderseite mit QR, Rückseite mit Auflösung.
- **Spotify:** Direkter Track-Link bzw. Einbettung, wenn eine Spotify-ID vorhanden ist.
- **Filter:** 20 Genres, 8 Jahrzehnte, One-Hit-Wonder, nur Karten mit Spotify-Link.

## So spielst du

### Freies Spiel
1. Karte ziehen (oder Filter setzen).
2. Clip abspielen und Jahr raten.
3. Karte umdrehen – Jahr, Titel und Interpret stehen auf der Rückseite.

### Mit Original-Hitster-Karte
1. Modus **Mit Original** wählen.
2. Jahr der Originalkarte eingeben – oder QR-Code scannen.
3. Die App zieht ein **anderes** Lied aus demselben Jahr.
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
| `…/?card=s0042` | Öffnet genau diese Karte. |
| `1984` oder `…/?year=1984` | Zieht ein Lied aus 1984. |
| `https://open.spotify.com/track/…` | Erkennt das Lied, ermittelt das Jahr und zieht ein anderes Lied aus diesem Jahr. |
| `spotify:track:…` | Wie Spotify-Link. |
| Unbekannt | Jahr manuell eingeben. |

## Technik

- **Frontend:** Vanilla JS, CSS, keine Build-Pflicht, keine Frameworks.
- **Backend (lokal/Server):** Node.js + Express.
  - `/api/catalog` – Katalog (gzip, 1 Tag cachebar)
  - `/api/song/:id` – eine Karte
  - `/api/audio/:id` – 30-Sekunden-Clip über Deezer/iTunes-Proxy (RAM-/Disk-Cache)
  - `/api/qr/:id` – QR-Code als SVG
  - `/api/resolve?spotify=…` – Spotify-Link → Titel/Künstler/Jahr (Katalog + Spotify-Metadaten)
- **Daten:** `data/songs.source.tsv` (Quelle) → `data/catalog.json` (4.121 Songs, 1950–2024).
- **Statische Version:** `docs/` ist ein GitHub-Pages-Build. Sie nutzt `catalog.json`,
  vorgenerierte QR-Codes und iTunes-Vorschauen direkt im Browser. Der Spotify-Scanner
  matcht bekannte Spotify-IDs und nutzt Spotify-oEmbed für unbekannte Titel; sonst
  Jahr manuell eingeben.

### Performance

- Katalog wird einmal aufbereitet und gzip ausgeliefert: **~708 KB roh / ~144 KB gzip**
  statt ~1,37 MB / ~247 KB.
- `/api/catalog` ist **1 Tag** cachebar, versionierte CSS/JS-Dateien **1 Jahr**
  (`immutable`), Asset-Version `3.0.0`.
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
npm run test:e2e       # Browser-E2E (Chromium)
npm run test:a11y      # Barrierefreiheit
npm run test:small     # 320-px-Viewport
npm run test:audio     # echte Audio-Clips
npm run screenshots    # docs/screenshot-*.png
```

### GitHub-Pages-Build

```bash
npm run build:static   # schreibt docs/ (Katalog, QR-Codes, Assets)
```

GitHub Pages wird aus `main` / `/docs` veröffentlicht:
https://dealwirth.github.io/hitster-web/

### Server mit Auto-Restart

```bash
setsid ./scripts/serve-watchdog.sh >/dev/null 2>&1 < /dev/null &
```

Logs: `server.log`. Für Dauerbetrieb eignen sich auch systemd, PM2 oder Docker.

## Daten & Lizenz

- 4.121 Songs, 1950–2024, 20 Genres, 2.618 Spotify-IDs.
- Song-Clips sind offizielle 30-Sekunden-Vorschauen von Deezer bzw. iTunes.
- Kein Login, keine Werbung, kein Tracking, kein Online-Mehrspieler.
- Code: **MIT-Lizenz**. HITSTER-Marke und Originalkarten gehören den jeweiligen
  Rechteinhabern.
