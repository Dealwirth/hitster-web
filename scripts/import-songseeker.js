#!/usr/bin/env node
/**
 * Imports the Songseeker Hitster CSVs into public/hitster-cards.json.
 * The CSV card number is the number printed in the Hitster card URL.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'data/songseeker');
const DB = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/hitster-db.json'), 'utf8'));
const ARTIST_TYPES = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/artist-types.json'), 'utf8')).artists || {};
const OUT = path.join(ROOT, 'public/hitster-cards.json');

const DECKS = {
  'hitster-ca-aaad0001.csv': { sku: 'aaad0001', name: 'Hitster Canada' },
  'hitster-de.csv': { sku: 'aaaa0002', name: 'Hitster Deutschland' },
  'hitster-de-aaaa0007.csv': { sku: 'aaaa0007', name: 'Hitster Deutschland Schlagerparty' },
  'hitster-de-aaaa0012.csv': { sku: 'aaaa0012', name: 'Hitster Deutschland Summer Party' },
  'hitster-de-aaaa0015.csv': { sku: 'aaaa0015', name: 'Hitster Deutschland Guilty Pleasures' },
  'hitster-de-aaaa0019.csv': { sku: 'aaaa0019', name: 'Hitster Deutschland Bingo' },
  'hitster-de-aaaa0025.csv': { sku: 'aaaa0025', name: 'Hitster Deutschland Bayern 1 Expansion Pack' },
  'hitster-de-aaaa0026.csv': { sku: 'aaaa0026', name: 'Hitster Deutschland Movies & TV Soundtracks Expansion Pack' },
  'hitster-de-aaaa0039.csv': { sku: 'aaaa0039', name: 'Hitster Deutschland Rock' },
  'hitster-de-aaaa0040.csv': { sku: 'aaaa0040', name: 'Hitster Deutschland Celebration' },
  'hitster-de-aaaa0042.csv': { sku: 'aaaa0042', name: 'Hitster Deutschland Christmas Expansion Pack' },
  'hitster-de-aaaa0054.csv': { sku: 'aaaa0054', name: 'Hitster Deutschland Platinum Edition' },
  'hitster-fr.csv': { sku: 'aaaa0004', name: 'Hitster France' },
  'hitster-fr-aaaa0031.csv': { sku: 'aaaa0031', name: 'Hitster France Summer Party' },
  'hitster-hu-aaae0003.csv': { sku: 'aaae0003', name: 'Hitster magyar kiadás' },
  'hitster-nl.csv': { sku: 'aaaa0001', name: 'Hitster Netherlands' },
  'hitster-pl-aaae0001.csv': { sku: 'aaae0001', name: 'Hitster Central Europe' },
  'hitster-pl-aaae0004.csv': { sku: 'aaae0004', name: 'Hitster Central Europe Summer Party' },
};

const norm = (s = '') => String(s).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
const hasSeparator = (artist) => /(?:\s(?:&|and|x|vs\.?|feat\.?|ft\.?|with)\s|,|\/|\+)/i.test(String(artist || ''));
const dbSets = new Map((DB.gamesets || []).map((set) => [set.sku, set]));

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (ch !== '\r') field += ch;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((v) => v.trim()));
}

const cards = {};
const decks = [];
let duplicates = 0;
for (const [file, deck] of Object.entries(DECKS)) {
  const filePath = path.join(SRC, file);
  if (!fs.existsSync(filePath)) continue;
  const rows = parseCsv(fs.readFileSync(filePath, 'utf8'));
  const header = rows.shift().map((h) => h.trim().toLowerCase());
  const col = (...names) => names.map((n) => header.indexOf(n)).find((i) => i >= 0) ?? -1;
  const iCard = col('card#', 'card');
  const iTitle = col('title');
  const iArtist = col('artist');
  const iYear = col('year');
  const iUrl = col('url');
  const iIsrc = col('isrc');
  const iYoutube = col('youtube-title');
  const iAlbum = col('album');
  const set = dbSets.get(deck.sku);
  let imported = 0;
  for (const row of rows) {
    const cardNumber = Number(row[iCard]);
    const year = Number(row[iYear]);
    const title = String(row[iTitle] || '').trim();
    const artist = String(row[iArtist] || '').trim();
    if (!Number.isInteger(cardNumber) || cardNumber < 1 || !title || !artist || !(year >= 1900 && year <= 2030)) continue;
    const card = String(cardNumber).padStart(5, '0');
    let sourceUrl = String(row[iUrl] || '').trim();
    if (/^hhttps?:\/\//i.test(sourceUrl)) sourceUrl = sourceUrl.slice(1);
    const key = `${deck.sku}:${card}`;
    if (cards[key]) duplicates++;
    const dbCard = set?.cards?.[card];
    const dbGroup = dbCard?.[1] === 'group' ? true : dbCard?.[1] === 'solo' ? false : null;
    const knownArtist = ARTIST_TYPES[norm(artist)];
    const group = dbGroup ?? (typeof knownArtist?.group === 'boolean' ? knownArtist.group : hasSeparator(artist));
    cards[key] = {
      deck: deck.name,
      sku: deck.sku,
      card,
      title,
      artist,
      year,
      group,
      spotifyId: dbCard?.[0] || null,
      url: sourceUrl || null,
      isrc: row[iIsrc] || null,
      youtubeTitle: row[iYoutube] || null,
      album: row[iAlbum] || null,
      source: `songseeker:${file}`,
    };
    imported++;
  }
  decks.push({ file, ...deck, cards: imported });
}

fs.writeFileSync(OUT, JSON.stringify({
  source: 'https://github.com/andygruber/songseeker-hitster-playlists',
  generatedAt: new Date().toISOString(),
  count: Object.keys(cards).length,
  decks,
  cards,
}, null, 0));
console.log(`[songseeker] ${Object.keys(cards).length} cards from ${decks.length} decks (${duplicates} duplicate keys) -> ${path.relative(ROOT, OUT)}`);
