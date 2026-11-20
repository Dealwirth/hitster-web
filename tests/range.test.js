import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRange } from '../server/audio.js';

test('parseRange handles closed, open and suffix ranges', () => {
  assert.deepEqual(parseRange('bytes=0-99', 1000), { start: 0, end: 99 });
  assert.deepEqual(parseRange('bytes=100-', 1000), { start: 100, end: 999 });
  assert.deepEqual(parseRange('bytes=-100', 1000), { start: 900, end: 999 });
  assert.deepEqual(parseRange('bytes=0-0', 1000), { start: 0, end: 0 });
});

test('parseRange rejects malformed and unsatisfiable ranges', () => {
  assert.equal(parseRange('', 1000), null);
  assert.equal(parseRange('items=0-10', 1000), null);
  assert.equal(parseRange('bytes=abc', 1000), null);
  assert.deepEqual(parseRange('bytes=1000-', 1000), { invalid: true });
  assert.deepEqual(parseRange('bytes=0-1000', 1000), { start: 0, end: 999 });
  assert.equal(parseRange('bytes=-', 1000), null);
});
