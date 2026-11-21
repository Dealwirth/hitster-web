# HITSTER Web 🎧

**Die kostenlose Karten-Erweiterung für Hitster und Hitster Bingo – direkt im Browser.**
Zufällige Karte ziehen, 30-Sekunden-Clip hören, umdrehen und das Jahr erraten.
Oder das Jahr deiner Original-Hitster-Karte eingeben bzw. den QR-Code scannen –
und ein Lied aus genau diesem Jahr ziehen.

**4.121 Songs · 20 Musik-Kategorien · alle 10 Hitster-Bingo-Kategorien · 3 Spielmodi ·
QR-Scanner · Druckbogen · kein Login · keine Werbung · kein Tracking · kein Online-Mehrspieler.**

![HITSTER Web Karte](docs/screenshot-front.png)

---

## Was ist das?

Ein inoffizielles Open-Source-Fanprojekt für alle, die Hitster mögen. Die App ist
zugleich eine **Karten-Erweiterung** für das Original und ein **eigenständiges Partyspiel**:

- **Mit Original:** Jahr der gezogenen Hitster-Karte eingeben oder QR scannen – die App
  zieht ein Lied aus demselben Jahr. Die zehn Bingo-Kategorien auf der Rückseite passen
  zu deiner Hitster-Bingo-Scorecard.
- **Ohne Original:** Klassisch oder Bingo wählen und einfach spielen.
- **Karten drucken:** Erweiterungskarten im Hitster-Look mit QR-Code auf der Vorderseite
  und Auflösung auf der Rückseite – zum Ausschneiden und Dazulegen.

Alles läuft lokal am Tisch. Es gibt **keinen Online-Mehrspieler**, keinen Login und
keine Konten. Statistiken und die Bingo-Scorecard bleiben in deinem Browser.

### Features

- 🎲 **4.121 Songs** von 1950 bis 2024, gefiltert nach Genre und Jahrzehnt
- 🎵 **30-Sekunden-Clips** über Deezer (Fallback: iTunes), serverseitig gecacht
- 🃏 **Drei Spielmodi:** Klassisch, Bingo, Erweiterung
- 📅 **Erweiterungsmodus:** Jahr der Originalkarte eingeben, zufällig ziehen oder scannen
- 🔳 **QR-Scanner:** Kamera öffnen, QR einer Karte oder eines Jahres scannen
- 🖨️ **Druckbogen:** 6/9/12/18 Karten, Vorder- und Rückseite, QR-Code, duplexfähig
- 🎯 **Alle 10 Hitster-Bingo-Kategorien** auf jeder Karte:
  - **A – Anfänger:** Gruppe/Solo, Vor 2000?, ±4 Jahre, Dekade, ±2 Jahre
  - **B – Experten:** Songtitel, exaktes Jahr, Interpret, Dekade, ±3 Jahre
- 🟩 **5×5-Bingo-Scorecard** zum Abhaken (wird lokal gespeichert)
- 🎨 **20 Musik-Kategorien:** Pop, Rock, Indie, Electronic, Hip-Hop, R&B/Soul,
  Funk/Disco, Metal, Punk, Country, Folk, Jazz, Schlager, Deutschpop, Deutschrap,
  Latin, Reggae, Film/Musical, NDW, Ska
- 📅 **8 Jahrzehnte:** 1950er bis 2020er
- 🔥 **One-Hit-Wonder-Filter** und **Nur-mit-Spotify**-Filter
- 🟢 **Spotify-Player** als eingebettetes iframe (lädt nur auf Klick)
- 📊 **Lokale Statistik:** Karten, richtige Antworten, Quote, Serie – ohne Login
- ⌨️ **Tastatur:** Leertaste (Play/Pause), F (umdrehen), N (nächste), R (wiederholen), ? (Hilfe)
- 📱 **Responsive** für Handy, Tablet und Desktop
- ♿ **Barrierefrei** geprüft (axe-core: 0 Verstöße auf Vorder- und Rückseite)
- 🔒 **Kein Login, keine Werbung, kein Tracking, keine Cookies**
- 🧩 **Vanilla JS + Express** – kein Build-Schritt für das Frontend, leicht zu hosten

![Rückseite der Karte](docs/screenshot-back.png)

![Erweiterungsmodus mit Jahr](docs/screenshot-extension.png)

![Druckbogen für Erweiterungskarten](docs/screenshot-print.png)

---

## Die drei Spielmodi

| Modus | Was passiert? |
|---|---|
| **Klassisch** | Zufällige Karte, Clip hören, Jahr raten, umdrehen. |
| **Bingo** | Wie klassisch, dazu die 5×5-Scorecard für Hitster Bingo. |
| **Erweiterung** | Jahr der Originalkarte eingeben oder QR scannen – ein Lied aus demselben Jahr wird gezogen. |

### Mit dem Original spielen

1. Ziehe eine Karte aus deinem **Hitster** oder **Hitster Bingo**.
2. Öffne hier den Modus **Erweiterung**.
3. Gib das Jahr der Originalkarte ein – oder tippe auf **QR scannen** und halte den
   QR-Code einer gedruckten Erweiterungskarte vor die Kamera.
4. Die App zieht ein Lied aus demselben Jahr. Clip abspielen, raten, umdrehen.
5. Die zehn Bingo-Kategorien auf der Rückseite passen zu deiner Bingo-Scorecard.

### Ohne Original

Einfach **Klassisch** oder **Bingo** wählen und spielen. Du brauchst kein Original-Spiel.
Die Karten funktionieren auch als eigenständiges Partyspiel.

### Karten drucken

Im Bereich **Karten drucken** auf **Druckbogen erstellen** tippen:

- 6, 9, 12 oder 18 Karten
- Vorder- und Rückseite, nur Vorderseiten oder nur Rückseiten
- optional nur die aktuellen Filter
- Vorderseite mit QR-Code, Rückseite mit Jahr, Titel, Interpret und allen Bingo-Antworten
- **Beidseitig drucken und an der langen Kante spiegeln** – die Rückseiten sind dafür
  spiegelverkehrt angeordnet
- ausschneiden, fertig

Die Karten sind **62 × 88 mm** groß und passen auf A4 (3 × 2 Karten pro Seite).

### QR-Code scannen

Der Scanner nutzt die Kamera des Geräts (Rückkamera, falls vorhanden) und `jsQR`.
Er versteht:

- `https://…/?card=s0042` – öffnet genau diese Karte
- `https://…/?year=1984` – zieht ein Lied aus 1984
- `1984` – zieht ein Lied aus 1984
- `s0042` – öffnet die Karte

Kein QR-Code zur Hand? Das Jahr lässt sich jederzeit manuell eingeben.

---

## Schnellstart

Voraussetzung: **Node.js 20+** (getestet mit Node 24).

```bash
npm install
npm start
```

Dann öffnen: **http://localhost:12000**

Anderer Port:

```bash
PORT=8080 npm start
```

Das Frontend liegt in `public/` und braucht keinen Build. Der Server liefert
Statics, Katalog-API, Audio-Proxy, Cover-Cache und QR-Codes aus.

---

## Spielen

1. **Karte ziehen.** Wähle rechts eine Musik-Kategorie und ein Jahrzehnt – oder lass
   alles auf Zufall.
2. **Clip hören.** Tippe auf die Karte oder auf „Clip abspielen“. Der Clip läuft,
   der 25-Sekunden-Timer zählt herunter.
3. **Raten.** Titel, Interpret, Jahr – auf der Vorderseite stehen alle zehn
   Bingo-Kategorien als Erinnerung.
4. **Umdrehen.** Mit „Karte umdrehen“, `F` oder einem Klick auf die Karte.
   Die Rückseite zeigt Jahr, Titel, Interpret und alle Bingo-Antworten.
5. **Bewerten.** „Richtig“ oder „Daneben“ aktualisiert deine Serie und Quote.
6. **Bingo!** Markiere richtige Felder auf der 5×5-Scorecard. Fünf in einer Reihe
   (waagerecht, senkrecht oder diagonal) = **HITSTER!**

> Tipp: Die Filter zählen live mit. Der Zufall vermeidet Wiederholungen der letzten
> 80 Karten. Im Erweiterungsmodus bleibt das gewählte Jahr aktiv, bis du es änderst
> oder ein Jahrzehnt auswählst.

---

## Musik-Kategorien

| Kategorie | Songs | Kategorie | Songs |
|---|---:|---|---:|
| Pop | 1.021 | Rock | 928 |
| Electronic | 465 | R&B / Soul | 239 |
| Hip-Hop | 215 | Indie | 184 |
| Metal | 147 | Latin | 140 |
| Funk / Disco | 133 | Punk | 125 |
| Country | 114 | Deutschpop | 113 |
| Folk | 87 | Deutschrap | 83 |
| Schlager | 58 | Reggae | 33 |
| NDW | 16 | Film / Musical | 14 |
| Jazz | 3 | Ska | 3 |

**Gesamt: 4.121 Songs** (Stand: automatisch aus `data/catalog.json`; die Zahlen
können nach einem Rebuild leicht abweichen).

### Jahrzehnte

| Jahrzehnt | Songs | Jahrzehnt | Songs |
|---|---:|---|---:|
| 1950er | 100 | 1960er | 493 |
| 1970er | 522 | 1980er | 607 |
| 1990er | 581 | 2000er | 727 |
| 2010er | 823 | 2020er | 268 |

---

## Technik

```
.
├── server/
│   ├── index.js        Express-App, API, Security-Header, Static-Server, QR-Route
│   ├── catalog.js      Katalog laden, filtern, Zufall, Bingo-Antworten
│   └── audio.js        Deezer/iTunes-Auflösung, Audio-Cache, Range-Support, Cover-Cache
├── public/
│   ├── index.html      Semantische Single-Page-Struktur, Modals, Druckbogen-Container
│   ├── styles.css      Papierkarten-Design, 3D-Flip, Druck-CSS, Responsive
│   ├── app.js          Spiel-Logik, Audio, Timer, Bingo, Filter, Jahr-Modus, QR, Druck
│   ├── vendor/jsqr.js  QR-Decoder (lokal gebündelt, keine externe Anfrage)
│   └── fonts/          Selbst gehostete Schriften (Archivo Black, Anton, Inter)
├── scripts/
│   ├── build-catalog.js  TSV → JSON, Deezer/iTunes-Matching, Spotify-IDs
│   ├── expand-catalog.js Zusätzliche Songs aus Deezer-Künstlern
│   ├── expand-oldies.js  Oldies ergänzen
│   └── serve-watchdog.sh Startet den Server bei Absturz automatisch neu
├── data/
│   ├── songs.source.tsv  Kuratierte Quelle (Jahr | Genre | G/S | Interpret | Titel | Tags)
│   ├── catalog.json      Generierter Katalog (4.121 Songs)
│   └── build-report.json Build-Report (Trefferquote, fehlende Songs)
├── tests/
│   ├── catalog.test.js   Datenqualität (node:test)
│   ├── api.test.js       API-Integration (node:test + supertest)
│   ├── e2e.test.js       Browser-E2E (Playwright + Chromium)
│   ├── a11y.mjs          axe-core-Audit
│   ├── sample-audio.mjs  Stichprobe echter Audio-Clips
│   ├── fallback-audio.mjs iTunes/m4a-Fallback prüfen
│   ├── small-viewport.mjs 320-px-Viewport prüfen
│   ├── range.test.js     Range-Parser (Unit)
│   └── screenshots.mjs   Screenshots für die Docs
└── docs/                 Screenshots
```

### API

| Endpoint | Zweck |
|---|---|
| `GET /api/health` | Status und Songanzahl |
| `GET /api/catalog` | Alle Karten, Genres, Jahrzehnte |
| `GET /api/random` | Zufällige Karte mit Filtern (`genre`, `decade`, `group`, `tag`, `spotifyOnly`, `exclude`) |
| `GET /api/song/:id` | Eine Karte inkl. Bingo-Antworten |
| `GET /api/bingo/:id` | Nur die zehn Bingo-Antworten |
| `GET /api/audio/:id` | 30-Sekunden-Clip mit Range-Support |
| `GET /api/art/:id` | Cover-Cache |
| `GET /api/qr/:id` | QR-Code (SVG) zur Karte; optional `?base=https://…` |

### Datenpipeline

`data/songs.source.tsv` ist die einzige Quelle für neue Songs. Eine Zeile sieht so aus:

```
1976|pop|G|ABBA|Dancing Queen|
2004|rock|G|Green Day|Boulevard of Broken Dreams|
2009|pop|S|Lady Gaga|Poker Face|
```

Felder: `Jahr | Genre | G/S | Interpret | Titel | Tags`
- `G` = Gruppe/Duo/Feature, `S` = Solo
- Tags (optional, kommagetrennt): z. B. `onehit`, `cover`
- Erlaubte Genres: `pop, rock, indie, electronic, hiphop, rnb, funk, metal, punk,
  country, folk, jazz, schlager, deutschpop, deutschrap, latin, reggae, film,
  klassik, ndw, ska`

Danach:

```bash
npm run build:catalog
```

Das Skript sucht für jeden Song über die **Deezer-API** einen 30-Sekunden-Clip
und ein Cover, fällt bei Bedarf auf die **iTunes Search API** zurück und ergänzt
– wenn möglich – eine **Spotify-Track-ID** aus einem offenen Datensatz.
Ergebnisse werden in `data/.cache/resolved.json` zwischengespeichert; ein
abgebrochener Lauf kann fortgesetzt werden (`--force` ignoriert den Cache,
`--limit=N` verarbeitet nur N offene Songs).

### Performance

- Der Katalog wird beim Start einmal aufbereitet (`publicSongs`) und als gzip
  ausgeliefert: **~708 KB roh / ~144 KB komprimiert** statt ~1,37 MB / ~247 KB.
- `/api/catalog` ist **1 Tag** cachebar (`stale-while-revalidate`), versionierte
  CSS/JS-Dateien **1 Jahr** (`immutable`); die App lädt den Katalog mit `?v=2.0.1`.
- Audio-Quellen werden **parallel** aufgelöst (Deezer/iTunes) und mit 8–15 s
  Timeouts abgesichert. Treffer liegen im RAM-/Disk-Cache; ein Cache-Hit braucht
  keinen Verzeichnis-Scan mehr.
- `scripts/serve-watchdog.sh` startet den Node-Prozess nach einem Absturz
  automatisch neu – damit die Seite nicht wieder „Bad Gateway“ zeigt.

### Audio-Proxy

Der Browser lädt nie direkt von Deezer/iTunes, sondern immer über
`/api/audio/:id`. Der Server:

1. löst bei Bedarf eine frische, signierte Preview-URL auf (Deezer-URLs laufen ab),
2. lädt den Clip einmal herunter und cached ihn unter `data/.cache/audio/`,
3. liefert ihn mit `Accept-Ranges`/`206` aus (Seeking funktioniert),
4. hält maximal 30 Clips im RAM und pruned den Disk-Cache bei 800 MB.

Cover laufen analog über `/api/art/:id` und werden unter `data/.cache/art/` gecacht.
Beide Caches sind in `.gitignore` und nicht Teil des Repos.

### Spotify

- **2.618 der 4.121 Songs** haben eine direkte Spotify-Track-ID.
- Der grüne Button öffnet ein Modal mit dem offiziellen Spotify-Embed-Player.
- Ohne Login spielt Spotify in der Regel eine Vorschau; für den vollen Song
  ist ein Spotify-Konto nötig. Der Button „In Spotify öffnen“ führt zur App.
- Für Songs ohne ID öffnet der Button die Spotify-Suche.
- Es werden **keine Spotify-API-Zugangsdaten** benötigt.

---

## Tests

```bash
npm test            # 27 Unit- und API-Tests (Katalog, Filter, Audio, QR, Range, Security)
npm run test:e2e    # 31 Browser-Checks mit Chromium (Desktop + Mobile)
```

Zusätzlich (Server muss auf Port 12000 laufen):

```bash
npm run test:a11y    # axe-core: WCAG 2.0/2.1 A/AA (0 Verstöße)
npm run test:audio   # 36 zufällige Clips + alle iTunes/m4a-Fallbacks abspielen
npm run test:small   # 320-px-Viewport: kein Overflow, Karte passt, Flip funktioniert
npm run screenshots  # Screenshots nach docs/
```

Die E2E-Tests prüfen u. a.:

- Katalog lädt, 10 Bingo-Kategorien, 5+5 Antworten, 25 Scorecard-Felder
- kein Audio-Download vor dem ersten Klick
- echter Audio-Clip startet (`currentTime > 0,2`, Dauer ~30 s)
- Timer zählt herunter
- Flip zeigt Titel/Interpret/Jahr, QR-Code lädt
- „Richtig“ aktualisiert Statistik und Confetti
- Bingo-Feld wird markiert und in `localStorage` gespeichert
- Hilfe-, Spotify- und Druck-Modal, Escape schließt
- Filter (Genre + Jahrzehnt), URL-Parameter, Reset
- Erweiterungsmodus: Jahr 1984 zieht genau ein Lied aus 1984, URL wird aktualisiert
- Zufallsjahr bleibt im Bereich 1950–2024
- QR-Parser versteht Karten, Jahre und nackte IDs
- Deep-Link `?card=s0001` öffnet genau diese Karte
- Druckbogen erzeugt 6 Vorderseiten, 6 Rückseiten und 6 QR-Codes
- Moduswechsel zeigt/versteckt die Erweiterungsleiste
- Tastatur-Shortcuts
- Mobile: kein horizontaler Overflow, Karte passt, Tap spielt, Filter funktionieren
- keine Runtime-Fehler

`npm run test:e2e` erwartet Chromium unter `/usr/bin/chromium`.
Alternativ: `CHROMIUM_PATH=/pfad/zu/chromium npm run test:e2e`.

---

## Datenschutz & Recht

- **Kein Login, keine Werbung, kein Tracking.** Es werden keine Analyse-Skripte
  geladen. Statistiken und die Bingo-Scorecard liegen ausschließlich in
  `localStorage` deines Browsers.
- **Kein Online-Mehrspieler.** Es gibt keine Lobby, keine Konten und keine
  Übertragung von Spielständen. Alles läuft am Tisch.
- **Audio:** Es werden offizielle 30-Sekunden-Vorschauen von Deezer bzw. iTunes
  gestreamt. Die Rechte an Musik, Covern und Marken liegen bei den jeweiligen
  Künstler:innen, Labels und Rechteinhabern. Dieses Projekt hostet keine Musik.
- **Spotify** wird nur auf ausdrücklichen Klick als iframe geladen.
- **QR-Codes** werden lokal auf dem Server erzeugt; der Scanner läuft komplett im
  Browser. Es werden keine Kamerabilder hochgeladen.
- **HITSTER** ist eine Marke der Jumbo Group bzw. ihrer Rechteinhaber. Dieses
  Projekt ist **nicht** mit HITSTER verbunden, wird nicht von Jumbo unterstützt
  und dient nur dem privaten Spaß.
- Der Quellcode steht unter der **MIT-Lizenz** (siehe [LICENSE](LICENSE)).
  Die Lizenz gilt für den Code, nicht für die gestreamten Inhalte Dritter.

---

## Deployment

Der Server ist eine normale Node-App ohne Datenbank:

```bash
PORT=12000 npm start
```

Für Dauerbetrieb mit automatischem Neustart:

```bash
setsid ./scripts/serve-watchdog.sh >/dev/null 2>&1 < /dev/null &
```

Empfohlen: hinter einem Reverse Proxy (Caddy/Nginx) mit HTTPS betreiben.
Die App bindet an `0.0.0.0`. Für einen dauerhaften Betrieb z. B. systemd,
PM2 oder Docker verwenden. Der Audio-Cache wächst nur bis 800 MB und wird
automatisch geprüft/gepruned.

**Docker (Beispiel):**

```dockerfile
FROM node:24-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
ENV PORT=12000
EXPOSE 12000
CMD ["npm", "start"]
```

```bash
docker build -t hitster-web .
docker run -p 12000:12000 hitster-web
```

---

## Mitmachen

Neue Songs? Einfach eine Zeile in `data/songs.source.tsv` ergänzen und
`npm run build:catalog` laufen lassen. Bitte nur Songs mit korrektem
**Erscheinungsjahr** (Jahr der Veröffentlichung bzw. ersten öffentlichen
Aufführung) eintragen. Pull Requests willkommen.

## Lizenz

[MIT](LICENSE) © HITSTER Web contributors

Viel Spaß beim Raten! 🎶
