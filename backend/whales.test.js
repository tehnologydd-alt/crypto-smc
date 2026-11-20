import test from 'node:test';
import assert from 'node:assert/strict';
import { LargeTradeTracker } from './whales.js';

test('counts only large aggregate trades and keeps spot separate from futures', () => {
  const tracker = new LargeTradeTracker();
  const now = 1_800_000_000_000;
  assert.equal(tracker.record('spot', { s: 'BTCUSDT', a: 1, p: '50000', q: '2', T: now, m: false }, now), false);
  assert.equal(tracker.record('spot', { s: 'BTCUSDT', a: 2, p: '50000', q: '6', T: now, m: false }, now), true);
  assert.equal(tracker.record('spot', { s: 'BTCUSDT', a: 2, p: '50000', q: '6', T: now, m: false }, now), false);
  assert.equal(tracker.record('futures', { s: 'BTCUSDT', a: 2, p: '50000', q: '8', T: now, m: true }, now), true);
  assert.deepEqual([tracker.summary('spot', 'BTCUSDT', now).buyCount, tracker.summary('spot', 'BTCUSDT', now).sellCount], [1, 0]);
  assert.deepEqual([tracker.summary('futures', 'BTCUSDT', now).buyCount, tracker.summary('futures', 'BTCUSDT', now).sellCount], [0, 1]);
});

test('expires old large trade observations', () => {
  const tracker = new LargeTradeTracker();
  const now = 1_800_000_000_000;
  tracker.record('spot', { s: 'ETHUSDT', a: 1, p: '1000', q: '300', T: now, m: true }, now);
  const later = now + 16 * 60_000;
  const summary = tracker.summary('spot', 'ETHUSDT', later);
  assert.equal(summary.sellCount, 0);
  assert.equal(summary.recent.length, 0);
});

