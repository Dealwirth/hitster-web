#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const CATALOG = path.join(ROOT, 'data/catalog.json');
const OVERRIDES = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/year-overrides.json'), 'utf8')).songs || {};
const norm = (s = '') => String(s)
  .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
const catalog = JSON.parse(fs.readFileSync(CATALOG, 'utf8'));
let changed = 0;
for (const song of catalog.songs || []) {
  const year = Number(OVERRIDES[`${norm(song.title)}|${norm(song.artist)}`]);
  if (year >= 1950 && year <= 2030 && song.year !== year) {
    song.year = year;
    song.yearSource = 'override';
    changed++;
  }
}
fs.writeFileSync(CATALOG, `${JSON.stringify(catalog, null, 2)}\n`);
console.log(`Year overrides applied: ${changed} rows`);
