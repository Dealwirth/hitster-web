import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CATALOG_PATH = path.resolve(__dirname, '../data/catalog.json');

let catalog = { generatedAt: null, count: 0, songs: [] };
try {
  catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
} catch (err) {
  console.warn('[catalog] could not read data/catalog.json:', err.message);
}

export const songs = catalog.songs;
export const generatedAt = catalog.generatedAt;
export const byId = new Map(songs.map((s) => [s.id, s]));

export const genres = [...new Set(songs.map((s) => s.genre))].sort();
export const decades = [...new Set(songs.map((s) => `${Math.floor(s.year / 10) * 10}s`))].sort();

export const stats = {
  count: songs.length,
  genres: genres.length,
  decades: decades.length,
  withSpotify: songs.filter((s) => s.spotifyId).length,
  withArt: songs.filter((s) => s.art).length,
  firstYear: songs.length ? Math.min(...songs.map((s) => s.year)) : null,
  lastYear: songs.length ? Math.max(...songs.map((s) => s.year)) : null,
};

export function publicSong(song) {
  if (!song) return null;
  return {
    id: song.id,
    title: song.title,
    artist: song.artist,
    year: song.year,
    genre: song.genre,
    group: song.group,
    tags: song.tags,
    spotifyId: song.spotifyId,
    streamUrl: `/api/audio/${song.id}`,
  };
}

export const publicSongs = songs.map(publicSong);

export function filterSongs({ genre, decade, tag, group, q, spotifyOnly } = {}) {
  let list = songs;
  if (genre && genre !== 'all') list = list.filter((s) => s.genre === genre);
  if (decade && decade !== 'all') {
    list = list.filter((s) => `${Math.floor(s.year / 10) * 10}s` === decade);
  }
  if (tag) list = list.filter((s) => s.tags.includes(tag));
  if (group === 'group') list = list.filter((s) => s.group);
  if (group === 'solo') list = list.filter((s) => !s.group);
  if (spotifyOnly) list = list.filter((s) => s.spotifyId);
  if (q) {
    const needle = q.toLowerCase();
    list = list.filter(
      (s) => s.title.toLowerCase().includes(needle) || s.artist.toLowerCase().includes(needle)
    );
  }
  return list;
}

export function randomSong(filters = {}, exclude = []) {
  const excludeSet = new Set(exclude);
  let list = filterSongs(filters);
  if (excludeSet.size) {
    const fresh = list.filter((s) => !excludeSet.has(s.id));
    if (fresh.length) list = fresh;
  }
  if (!list.length) return null;
  return list[Math.floor(Math.random() * list.length)];
}

export function bingoAnswers(song) {
  const decade = `${Math.floor(song.year / 10) * 10}er`;
  return {
    beginner: [
      { key: 'group', label: 'Gruppe oder Solo', answer: song.group ? 'Gruppe' : 'Solo' },
      { key: 'before2000', label: 'Vor 2000?', answer: song.year < 2000 ? 'Ja' : 'Nein' },
      { key: 'plusminus4', label: '± 4 Jahre', answer: String(song.year) },
      { key: 'decade', label: 'Dekade', answer: decade },
      { key: 'plusminus2', label: '± 2 Jahre', answer: String(song.year) },
    ],
    expert: [
      { key: 'title', label: 'Songtitel', answer: song.title },
      { key: 'exactYear', label: 'Exaktes Jahr', answer: String(song.year) },
      { key: 'artist', label: 'Interpret', answer: song.artist },
      { key: 'decadeExpert', label: 'Dekade', answer: decade },
      { key: 'plusminus3', label: '± 3 Jahre', answer: String(song.year) },
    ],
  };
}
