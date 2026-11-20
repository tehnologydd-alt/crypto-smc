import test from 'node:test';
import assert from 'node:assert/strict';
import { detectSignal, advanceSignal, advanceSignalWithCandle, parseKlines, TIMEFRAMES, analyzeStructure, findImbalances } from './strategy.js';
import { newModel, validModel, scoreSignal, learnFromOutcome, modelTrusted } from './learning.js';
import { normalizePreferences, shouldNotify } from './notifications.js';

function baseSignal(side = 'LONG') {
  return { side, state: 'WAITING', entryLow: 99, entryHigh: 101, entry: 100,
    stop: side === 'LONG' ? 98 : 102, targets: side === 'LONG' ? [102, 104, 106] : [98, 96, 94],
    hitTargets: 0, expiresAt: 9999999999999, events: [] };
}
test('detects a bullish break of structure and an order block on closed candles', () => {
  const c = Array.from({ length: 40 }, (_, i) => ({ time: i * 3600000, end: (i + 1) * 3600000 - 1, open: 100, high: 101, low: 99, close: 100 }));
  c[30] = { ...c[30], high: 103 };
  c[38] = { ...c[38], open: 101, close: 100, high: 102 };
  c[39] = { ...c[39], open: 102.5, low: 102.5, high: 107, close: 106 };
  const signal = detectSignal(c, 'spot', 'BTCUSDT');
  assert.equal(signal?.side, 'LONG');
  assert.equal(signal.entryLow, 99);
  assert.equal(signal.entryHigh, 102);
  assert.equal(signal.targets.length, 3);
  assert.equal(signal.timeframe, '1h');
  assert.equal(signal.features.length, 8);
  assert.deepEqual([signal.imbalance.low, signal.imbalance.high], [101, 102.5]);
  assert.equal(detectSignal(c, 'futures', 'BTCUSDT')?.side, 'LONG');
});
test('supports signal timeframes from M5 through H4 with distinct IDs and expiry', () => {
  const c = Array.from({ length: 40 }, (_, i) => ({ time: i * 3600000, end: (i + 1) * 3600000 - 1, open: 100, high: 101, low: 99, close: 100 }));
  c[30] = { ...c[30], high: 103 };
  c[38] = { ...c[38], open: 101, close: 100, high: 102 };
  c[39] = { ...c[39], open: 102.5, low: 102.5, high: 107, close: 106 };
  const m5 = detectSignal(c, 'spot', 'BTCUSDT', '5m');
  const h4 = detectSignal(c, 'spot', 'BTCUSDT', '4h');
  assert.deepEqual(Object.keys(TIMEFRAMES), ['5m', '15m', '30m', '1h', '4h']);
  assert.notEqual(m5.id, h4.id);
  assert.equal(m5.expiresAt - m5.detectedAt, 12 * 5 * 60000);
  assert.equal(h4.expiresAt - h4.detectedAt, 12 * 240 * 60000);
});
test('spot never emits shorts', () => {
  const c = Array.from({ length: 40 }, (_, i) => ({ time: i * 3600000, end: (i + 1) * 3600000 - 1, open: 100, high: 101, low: 99, close: 100 }));
  c[30] = { ...c[30], low: 97 };
  c[38] = { ...c[38], open: 99, close: 100, low: 98 };
  c[39] = { ...c[39], open: 97.5, high: 97.5, low: 93, close: 94 };
  assert.equal(detectSignal(c, 'spot', 'BTCUSDT'), null);
  assert.equal(detectSignal(c, 'futures', 'BTCUSDT')?.side, 'SHORT');
});
test('requires a same-direction three-candle imbalance for new signals', () => {
  const c = Array.from({ length: 40 }, (_, i) => ({ time: i * 60000, end: (i + 1) * 60000 - 1, open: 100, high: 101, low: 99, close: 100 }));
  c[30].high = 103; c[38] = { ...c[38], open: 101, close: 100, high: 102 };
  c[39] = { ...c[39], open: 100, high: 106, close: 105 };
  assert.equal(detectSignal(c, 'spot', 'BTCUSDT'), null);
  c[39] = { ...c[39], open: 102.5, low: 102.5, high: 107, close: 106 };
  assert.equal(detectSignal(c, 'spot', 'BTCUSDT')?.imbalance.direction, 'up');
  assert.ok(findImbalances(c).some(gap => gap.direction === 'up'));
  assert.ok(analyzeStructure(c).breaks.some(item => item.direction === 'up' && item.block));
});
test('notification choices isolate each target and followed signal', () => {
  const subscription = { preferences: normalizePreferences({ selectedOnly: true, selectedIds: ['one'], events: { TP2: false, STOP: true } }) };
  assert.equal(shouldNotify(subscription, { id: 'one' }, { type: 'TP1' }), true);
  assert.equal(shouldNotify(subscription, { id: 'one' }, { type: 'TP2' }), false);
  assert.equal(shouldNotify(subscription, { id: 'two' }, { type: 'STOP' }), false);
  assert.equal(shouldNotify(subscription, { id: 'one' }, { type: 'STOP' }), true);
});
test('marks a three-candle imbalance as filled only after a later candle crosses it', () => {
  const candles = [
    { time: 1, high: 101, low: 99 }, { time: 2, high: 103, low: 100 },
    { time: 3, high: 105, low: 102 }, { time: 4, high: 104, low: 100.5 }
  ];
  const gap = findImbalances(candles).find(item => item.time === 3 && item.direction === 'up');
  assert.deepEqual([gap.low, gap.high, gap.filledAt], [101, 102, 4]);
});
test('tracks entry, three targets, and stops', () => {
  const s = baseSignal();
  assert.equal(advanceSignal(s, 100, 1), true); assert.equal(s.state, 'OPEN');
  advanceSignal(s, 104, 2); assert.equal(s.hitTargets, 2);
  advanceSignal(s, 106, 3); assert.equal(s.state, 'COMPLETED');
  assert.deepEqual(s.events.map(e => e.type), ['ENTRY', 'TP1', 'TP2', 'TP3']);
  const stopped = baseSignal(); advanceSignal(stopped, 100, 1); advanceSignal(stopped, 98, 2);
  assert.equal(stopped.state, 'STOPPED');
});
test('conservatively counts stop before a target within a recovery candle', () => {
  const s = baseSignal(); advanceSignal(s, 100, 1);
  advanceSignalWithCandle(s, { high: 107, low: 97, end: 2 });
  assert.equal(s.state, 'STOPPED'); assert.equal(s.hitTargets, 0);
});
test('M1 candle must cross calculated entry and records target levels', () => {
  const s = baseSignal();
  assert.equal(advanceSignalWithCandle(s, { high: 99.5, low: 99, close: 99.4, end: 1 }), false);
  assert.equal(advanceSignalWithCandle(s, { high: 100.5, low: 99.5, close: 100, end: 2 }), true);
  assert.equal(s.state, 'OPEN');
  advanceSignalWithCandle(s, { high: 104.5, low: 100.5, close: 103, end: 3 });
  assert.deepEqual(s.events.map(e => e.type), ['ENTRY', 'TP1', 'TP2']);
  assert.deepEqual(s.events.map(e => e.price), [100, 102, 104]);
});
test('waiting signal expires on an M1 close', () => {
  const s = baseSignal(); s.expiresAt = 60000;
  advanceSignalWithCandle(s, { high: 101, low: 99, close: 100, end: 60000 });
  assert.equal(s.state, 'EXPIRED');
});
test('does not claim an entry after a gap across the entire zone', () => {
  const s = baseSignal();
  assert.equal(advanceSignal(s, 97, 1), true);
  assert.equal(s.state, 'CANCELLED');
});
test('ignores an unfinished Binance candle', () => {
  const now = Date.now();
  const rows = [[now - 60000, '1', '2', '0.5', '1.5', '0', now + 60000], [now - 120000, '1', '2', '0.5', '1.5', '0', now - 60001]];
  assert.equal(parseKlines(rows, now).length, 1);
});
test('adaptive model learns only from resolved entered signals', () => {
  const model = newModel();
  const signal = { state: 'OPEN', hitTargets: 1, features: [1, 2, 1, 1, 1, 0, 0, .3], quality: scoreSignal(model, [1, 2, 1, 1, 1, 0, 0, .3]) };
  assert.equal(learnFromOutcome(model, signal), true);
  assert.equal(model.samples, 1); assert.equal(model.successes, 1);
  assert.equal(learnFromOutcome(model, signal), false);
  const expired = { ...signal, learned: false, hitTargets: 0, state: 'EXPIRED' };
  assert.equal(learnFromOutcome(model, expired), false);
});
test('new FVG strategy rejects the previous model version', () => {
  const current = newModel();
  assert.equal(current.version, 2);
  assert.equal(validModel({ ...current, version: 1 }), false);
});
test('adaptive alert filtering requires positive walk-forward evidence', () => {
  const model = newModel(); model.samples = 80; model.successes = 40; model.weights[0] = -2;
  model.walkForward = Array.from({ length: 40 }, () => ({ prediction: .9, baseline: .5, label: 1 }));
  assert.equal(modelTrusted(model), true);
  const quality = scoreSignal(model, [1, 0, 0, 0, 0, 0, 0, 0]);
  assert.equal(quality.trusted, true);
  assert.equal(quality.recommended, false);
  model.walkForward = Array.from({ length: 40 }, () => ({ prediction: .1, baseline: .5, label: 1 }));
  assert.equal(modelTrusted(model), false);
});

