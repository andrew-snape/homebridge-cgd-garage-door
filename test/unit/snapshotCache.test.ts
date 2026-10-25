import { test } from 'node:test';
import assert from 'node:assert/strict';
import SnapshotCache from '../../src/snapshotCache.js';

const setup = (isBusy = () => false) => {
  let captures = 0;
  let clock = 0;
  const cache = new SnapshotCache(async () => Buffer.from(`frame${++captures}`), isBusy, 10000, () => clock);
  return { cache, captures: () => captures, advance: (ms: number) => (clock += ms) };
};

test('serves a fresh cached frame and recaptures once it is stale', async () => {
  const { cache, captures, advance } = setup();

  assert.equal((await cache.get(640, 480)).toString(), 'frame1');
  advance(5000);
  assert.equal((await cache.get(640, 480)).toString(), 'frame1');
  advance(6000);
  assert.equal((await cache.get(640, 480)).toString(), 'frame2');
  assert.equal(captures(), 2);
});

test('concurrent requests share one capture', async () => {
  const { cache, captures } = setup();

  const frames = await Promise.all([cache.get(640, 480), cache.get(640, 480), cache.get(640, 480)]);

  assert.equal(captures(), 1);
  assert.ok(frames.every((frame) => frame.toString() === 'frame1'));
});

test('serves a stale frame instead of capturing while a command is pending', async () => {
  let busy = false;
  const { cache, captures, advance } = setup(() => busy);

  await cache.get(640, 480);
  advance(60000);
  busy = true;

  assert.equal((await cache.get(320, 240)).toString(), 'frame1');
  assert.equal(captures(), 1);

  busy = false;
  assert.equal((await cache.get(320, 240)).toString(), 'frame2');
});
