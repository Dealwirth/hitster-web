import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { songs, byId, genres, decades, stats, publicSong, bingoAnswers, randomSong, filterSongs } from '../server/catalog.js';

const ALLOWED_GENRES = new Set([
  'pop', 'rock', 'indie', 'electronic', 'hiphop', 'rnb', 'funk', 'metal',
  'punk', 'country', 'folk', 'jazz', 'schlager', 'deutschpop', 'deutschrap',
  'latin', 'reggae', 'film', 'klassik', 'ndw', 'ska',
]);

test('catalog file exists and has more than 1000 playable songs', () => {
  assert.ok(fs.existsSync(new URL('../data/catalog.json', import.meta.url)));
  assert.ok(songs.length >= 1000, `only ${songs.length} songs`);
  assert.equal(stats.count, songs.length);
});

test('every song has complete, valid metadata', () => {
  for (const s of songs) {
    assert.match(s.id, /^s\d{4}$/, `bad id ${s.id}`);
    assert.ok(s.title && s.title.trim().length > 0, `missing title ${s.id}`);
    assert.ok(s.artist && s.artist.trim().length > 0, `missing artist ${s.id}`);
    assert.ok(Number.isInteger(s.year) && s.year >= 1900 && s.year <= 2030, `bad year ${s.id}: ${s.year}`);
    assert.ok(ALLOWED_GENRES.has(s.genre), `bad genre ${s.id}: ${s.genre}`);
    assert.equal(typeof s.group, 'boolean', `bad group ${s.id}`);
    assert.ok(Array.isArray(s.tags), `bad tags ${s.id}`);
    assert.ok(s.deezerId || s.itunesId, `no audio source ${s.id}`);
    assert.ok(s.art, `no artwork ${s.id}`);
    assert.ok(!/[<>]/.test(s.title + s.artist), `markup in text ${s.id}`);
  }
});

test('ids and title/artist pairs are unique', () => {
  const ids = new Set();
  const pairs = new Set();
  for (const s of songs) {
    assert.ok(!ids.has(s.id), `duplicate id ${s.id}`);
    ids.add(s.id);
    const key = `${s.title.toLowerCase()}|${s.artist.toLowerCase()}`;
    assert.ok(!pairs.has(key), `duplicate song ${s.title} – ${s.artist}`);
    pairs.add(key);
  }
  assert.equal(byId.size, songs.length);
});

test('catalog covers all decades and many genres', () => {
  assert.ok(genres.length >= 15, `only ${genres.length} genres`);
  assert.ok(decades.length >= 7, `only ${decades.length} decades`);
  for (const d of ['1950s', '1960s', '1970s', '1980s', '1990s', '2000s', '2010s', '2020s']) {
    assert.ok(decades.includes(d), `missing decade ${d}`);
    assert.ok(songs.some((s) => `${Math.floor(s.year / 10) * 10}s` === d), `no songs in ${d}`);
  }
  assert.ok(stats.firstYear <= 1960);
  assert.ok(stats.lastYear >= 2020);
});

test('spotify ids are well formed when present', () => {
  for (const s of songs) {
    if (s.spotifyId) assert.match(s.spotifyId, /^[A-Za-z0-9]{22}$/, `bad spotify id ${s.id}`);
  }
  assert.ok(stats.withSpotify > 500, `only ${stats.withSpotify} spotify ids`);
});

test('publicSong exposes safe stream and spotify urls', () => {
  const s = publicSong(songs[0]);
  assert.equal(s.streamUrl, `/api/audio/${songs[0].id}`);
  assert.equal(s.artUrl, `/api/art/${songs[0].id}`);
  assert.ok(s.spotifyUrl.startsWith('https://open.spotify.com/'));
  assert.equal(s.year, songs[0].year);
  assert.equal(s.group, songs[0].group);
});

test('bingo answers cover all ten Hitster Bingo categories', () => {
  const sample = songs.find((s) => s.year === 1976 && s.group);
  const b = bingoAnswers(sample);
  assert.equal(b.beginner.length, 5);
  assert.equal(b.expert.length, 5);
  assert.deepEqual(b.beginner.map((x) => x.key), ['group', 'before2000', 'plusminus4', 'decade', 'plusminus2']);
  assert.deepEqual(b.expert.map((x) => x.key), ['title', 'exactYear', 'artist', 'decadeExpert', 'plusminus3']);
  assert.equal(b.beginner[0].answer, 'Gruppe');
  assert.equal(b.beginner[1].answer, 'Ja');
  assert.equal(b.beginner[3].answer, '1970er');
  assert.equal(b.expert[0].answer, sample.title);
  assert.equal(b.expert[2].answer, sample.artist);
});

test('randomSong respects genre, decade, tag and group filters', () => {
  const pop80 = randomSong({ genre: 'pop', decade: '1980s' });
  assert.ok(pop80);
  assert.equal(pop80.genre, 'pop');
  assert.ok(pop80.year >= 1980 && pop80.year < 1990);

  const group = randomSong({ group: 'group' });
  assert.ok(group?.group);

  const solo = randomSong({ group: 'solo' });
  assert.ok(solo && !solo.group);

  const oneHit = randomSong({ tag: 'onehit' });
  assert.ok(oneHit?.tags.includes('onehit'));

  const spotify = randomSong({ spotifyOnly: true });
  assert.ok(spotify?.spotifyId);
});

test('randomSong excludes already played cards when possible', () => {
  const pool = filterSongs({ genre: 'pop' });
  const exclude = pool.slice(0, pool.length - 1).map((s) => s.id);
  const song = randomSong({ genre: 'pop' }, exclude);
  assert.ok(song);
  assert.equal(song.id, pool[pool.length - 1].id);
});

test('known hit years are correct (data quality anchors)', () => {
  const anchors = [
    ['Dancing Queen', 'ABBA', 1976],
    ['Bohemian Rhapsody', 'Queen', 1975],
    ['Hotel California', 'Eagles', 1976],
    ['I Will Survive', 'Gloria Gaynor', 1978],
    ['Billie Jean', 'Michael Jackson', 1982],
    ['99 Luftballons', 'Nena', 1983],
    ['Take On Me', 'a-ha', 1985],
    ['Sweet Child o\' Mine', 'Guns N\' Roses', 1987],
    ['Smells Like Teen Spirit', 'Nirvana', 1991],
    ['Wonderwall', 'Oasis', 1995],
    ['Gangsta\'s Paradise', 'Coolio', 1995],
    ['Du hast', 'Rammstein', 1997],
    ['Mr. Brightside', 'The Killers', 2004],
    ['Toxic', 'Britney Spears', 2003],
    ['Hips Don\'t Lie', 'Shakira', 2006],
    ['Poker Face', 'Lady Gaga', 2008],
    ['Rolling in the Deep', 'Adele', 2011],
    ['Tage wie diese', 'Die Toten Hosen', 2012],
    ['Atemlos durch die Nacht', 'Helene Fischer', 2013],
    ['Stolen Dance', 'Milky Chance', 2013],
    ['Shape of You', 'Ed Sheeran', 2017],
    ['Old Town Road', 'Lil Nas X', 2019],
    ['bad guy', 'Billie Eilish', 2019],
    ['Blinding Lights', 'The Weeknd', 2019],
    ['Levitating', 'Dua Lipa', 2020],
    ['Flowers', 'Miley Cyrus', 2023],
    ['Not Like Us', 'Kendrick Lamar', 2024],
  ];
  for (const [title, artist, year] of anchors) {
    const s = songs.find((x) => x.title === title && x.artist === artist);
    assert.ok(s, `missing anchor: ${artist} – ${title}`);
    assert.equal(s.year, year, `wrong year for ${artist} – ${title}`);
  }
});

test('German catalogue has a solid share of songs', () => {
  const german = songs.filter((s) => ['deutschpop', 'deutschrap', 'schlager', 'ndw'].includes(s.genre));
  assert.ok(german.length >= 80, `only ${german.length} German songs`);
});
