import test from 'node:test';
import assert from 'node:assert/strict';
import { openExperienceStore } from './experience.js';
import { scoreSignal } from './learning.js';
import { validateMobileBatch } from './mobile-sync.js';

function phoneSignal(model) {
  const features = [1, 1.2, .5, .4, .8, 0, 0, .2];
  return {
    id: 'spot:BTCUSDT:15m:1000:LONG', market: 'spot', symbol: 'BTCUSDT', timeframe: '15m', side: 'LONG',
    detectedAt: 1000, blockTime: 700, entryLow: 99, entryHigh: 101, entry: 100, stop: 98,
    targets: [102, 104, 106], swing: 101, imbalance: { time: 900, low: 100, high: 101, direction: 'up' },
    strategyVersion: 3, features, expiresAt: 2000, state: 'STOPPED', hitTargets: 1, learned: true, outcome: 1,
    quality: scoreSignal(model, features),
    events: [
      { type: 'CREATED', at: 1000, price: 103 }, { type: 'ENTRY', at: 1100, price: 100 },
      { type: 'TP1', at: 1200, price: 102 }, { type: 'STOP', at: 1300, price: 98 }
    ]
  };
}

test('phone history imports once and does not become server validation', () => {
  const store = openExperienceStore(':memory:');
  try {
    const signal = phoneSignal(store.model);
    assert.equal(validateMobileBatch([signal]).length, 1);
    assert.deepEqual(store.importSignal(signal), { stored: true, learned: true });
    assert.deepEqual(store.importSignal(signal), { stored: false, learned: false });
    assert.equal(store.model.samples, 1);
    assert.equal(store.model.walkForward.length, 0);
    assert.deepEqual(store.summary(), { signals: 1, outcomes: 1 });
    assert.equal(store.loadSignals()[0].hitTargets, 1);
    assert.equal(store.id.length > 20, true);
  } finally { store.close(); }
});

test('sync rejects malformed batches before importing any signal', () => {
  const store = openExperienceStore(':memory:');
  try {
    const valid = phoneSignal(store.model);
    assert.deepEqual(validateMobileBatch([]), []);
    assert.throws(() => validateMobileBatch([valid, valid]), /Некорректная/);
    assert.throws(() => validateMobileBatch([{ ...valid, features: [1] }]), /Некорректная/);
    assert.throws(() => validateMobileBatch(Array(51).fill(valid)), /до 50/);
  } finally { store.close(); }
});

