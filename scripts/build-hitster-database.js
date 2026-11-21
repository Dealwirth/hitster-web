#!/usr/bin/env node
/** Builds a rich, downloadable database with version/year coverage and fame rankings. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/catalog.json'), 'utf8'));
const appSource = fs.readFileSync(path.join(ROOT, 'public/app.js'), 'utf8');
const versionsSource = appSource.match(/const VERSIONS = (\{[\s\S]*?\n\});/)?.[1];
if (!versionsSource) throw new Error('VERSIONS not found');
const VERSIONS = vm.runInNewContext(`(${versionsSource})`);

const norm = (value = '') => String(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
const decadeKey = (year) => `${Math.floor(year / 10) * 10}s`;
const genresOf = (song) => [...new Set((song.genres?.length ? song.genres : [song.genre]).filter(Boolean))];
const playable = (song) => Boolean(song.previewUrl || song.itunesId || song.deezerId || song.spotifyId || song.streamUrl);
const fame = (song) => (song.tags?.includes('chart') ? 5_000_000 : 0) + (Number(song.popularity) || 0) + (song.spotifyId ? 50_000 : 0);
const matchesVersion = (song, id) => {
  const version = VERSIONS[id];
  if (!version || id === 'all') return true;
  if (version.genres?.length && !genresOf(song).some((genre) => version.genres.includes(genre))) return false;
  if (version.decades?.length && !version.decades.includes(decadeKey(song.year))) return false;
  if (version.tags?.length && !version.tags.some((tag) => song.tags?.includes(tag))) return false;
  return true;
};

const years = [...new Set(catalog.songs.map((song) => song.year))].sort((a, b) => a - b);
const songs = catalog.songs.map((song) => ({
  ...song,
  genres: genresOf(song),
  decade: decadeKey(song.year),
  playable: playable(song),
  fame: fame(song),
  yearRank: 0,
  versionIds: Object.keys(VERSIONS).filter((id) => matchesVersion(song, id)),
}));
const byId = new Map(songs.map((song) => [song.id, song]));
for (const year of years) {
  const ranked = songs.filter((song) => song.year === year).sort((a, b) => b.fame - a.fame);
  ranked.forEach((song, index) => { byId.get(song.id).yearRank = index + 1; });
}

const versionData = {};
for (const [id, version] of Object.entries(VERSIONS)) {
  const pool = songs.filter((song) => matchesVersion(song, id));
  const perYear = {};
  for (const year of years) {
    const own = pool.filter((song) => song.year === year);
    const fallback = own.length >= 10 ? [] : songs
      .filter((song) => song.year === year && !own.some((entry) => entry.id === song.id))
      .sort((a, b) => b.fame - a.fame)
      .slice(0, Math.max(0, 10 - own.length));
    perYear[year] = {
      count: own.length,
      guaranteed: own.length + fallback.length,
      top: [...own, ...fallback].sort((a, b) => b.fame - a.fame).slice(0, 10).map((song) => song.id),
    };
  }
  versionData[id] = {
    label: version.label,
    short: version.short,
    description: version.desc,
    color: version.color,
    icon: version.icon,
    count: pool.length,
    minPerYear: Math.min(...years.map((year) => perYear[year].count)),
    guaranteedMinPerYear: Math.min(...years.map((year) => perYear[year].guaranteed)),
    perYear,
    topSongs: [...pool].sort((a, b) => b.fame - a.fame).slice(0, 50).map((song) => song.id),
  };
}

const yearData = {};
for (const year of years) {
  const pool = songs.filter((song) => song.year === year).sort((a, b) => b.fame - a.fame);
  yearData[year] = {
    count: pool.length,
    versions: Object.fromEntries(Object.keys(VERSIONS).map((id) => [id, versionData[id].perYear[year].guaranteed])),
    topSongs: pool.slice(0, 25).map((song) => song.id),
  };
}

const indexes = {
  byYear: Object.fromEntries(years.map((year) => [year, songs.filter((song) => song.year === year).map((song) => song.id)])),
  byGenre: Object.fromEntries([...new Set(songs.flatMap((song) => song.genres))].sort().map((genre) => [genre, songs.filter((song) => song.genres.includes(genre)).map((song) => song.id)])),
  byArtist: Object.fromEntries([...new Set(songs.map((song) => norm(song.artist)))].sort().map((key) => [key, songs.filter((song) => norm(song.artist) === key).map((song) => song.id)])),
  byVersion: Object.fromEntries(Object.keys(VERSIONS).map((id) => [id, songs.filter((song) => matchesVersion(song, id)).map((song) => song.id)])),
};

const db = {
  schema: 'hitster-web-database/v1',
  generatedAt: new Date().toISOString(),
  totalSongs: songs.length,
  years,
  genres: [...new Set(songs.flatMap((song) => song.genres))].sort(),
  versions: versionData,
  yearsData: yearData,
  indexes,
  songs,
};
fs.writeFileSync(path.join(ROOT, 'data/hitster-database.json'), `${JSON.stringify(db, null, 2)}\n`);
console.log(`Database: ${songs.length} songs, ${Object.keys(VERSIONS).length} versions, ${years.length} years`);
console.log(`Version min per year (guaranteed): ${Object.entries(versionData).map(([id, v]) => `${id}=${v.guaranteedMinPerYear}`).join(', ')}`);
