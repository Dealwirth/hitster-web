import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const data = JSON.parse(fs.readFileSync('public/hitster-cards.json', 'utf8'));
const catalog = JSON.parse(fs.readFileSync('data/catalog.json', 'utf8'));
const official = JSON.parse(fs.readFileSync('public/hitster-db.json', 'utf8'));
const officialSets = new Map(official.gamesets.map((set) => [set.sku, set]));

test('Songseeker card metadata covers every imported deck', () => {
  assert.equal(data.count, 5192);
  assert.equal(data.decks.length, 18);
  assert.equal(Object.keys(data.cards).length, 5192);
  for (const [key, card] of Object.entries(data.cards)) {
    assert.match(key, /^[a-z]{4}\d{4}:\d{5}$/);
    assert.ok(card.title.length > 0, key);
    assert.ok(card.artist.length > 0, key);
    assert.ok(Number.isInteger(card.year) && card.year >= 1900 && card.year <= 2030, key);
    assert.equal(typeof card.group, 'boolean', key);
    if (card.url) assert.match(card.url, /^https:\/\/(www\.youtube\.com|youtu\.be)\//, key);
    assert.ok(officialSets.get(card.sku)?.cards[card.card], `missing official card ${key}`);
  }
});

test('Songseeker anchors use the printed card year, not Spotify reissues', () => {
  assert.deepEqual(
    (({ title, artist, year }) => ({ title, artist, year }))(data.cards['aaaa0019:00215']),
    { title: 'Better in Time', artist: 'Leona Lewis', year: 2007 },
  );
  assert.deepEqual(
    (({ title, artist, year }) => ({ title, artist, year }))(data.cards['aaaa0019:00052']),
    { title: 'Shivers', artist: 'Ed Sheeran', year: 2021 },
  );
  assert.deepEqual(
    (({ title, artist, year }) => ({ title, artist, year }))(data.cards['aaaa0002:00128']),
    { title: 'Mama', artist: 'Heintje', year: 1968 },
  );
});

test('catalog has the Songseeker rock/metal expansion and unique ids', () => {
  assert.equal(catalog.songs.length, 4665);
  assert.equal(new Set(catalog.songs.map((song) => song.id)).size, catalog.songs.length);
  assert.ok(catalog.songs.filter((song) => song.tags?.includes('songseeker')).length >= 180);
  assert.ok(catalog.songs.some((song) => song.title === 'Master Of Puppets' && song.artist === 'Metallica'));
});
