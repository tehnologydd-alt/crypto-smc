import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { openExperienceStore } from './experience.js';
import { scoreSignal } from './learning.js';

test('SQLite retains signals and learns each resolved outcome once across restart', () => {
  const dir = mkdtempSync(join(tmpdir(), 'orbit-experience-'));
  const path = join(dir, 'experience.sqlite');
  let store;
  try {
    store = openExperienceStore(path);
    const features = [1, 2, .8, .5, 1.1, 0, 0, .4];
    const signal = { id: 'spot:BTCUSDT:15m:one:LONG', market: 'spot', symbol: 'BTCUSDT', timeframe: '15m', side: 'LONG',
      detectedAt: 1000, updatedAt: 2000, state: 'OPEN', hitTargets: 1, features,
      quality: scoreSignal(store.model, features), imbalance: { low: 100, high: 101 }, events: [{ type: 'TP1', at: 2000, price: 105 }] };
    store.saveSignal(signal);
    assert.equal(store.recordOutcome(signal), true);
    assert.equal(store.recordOutcome(signal), false);
    assert.deepEqual(store.summary(), { signals: 1, outcomes: 1 });
    assert.equal(store.model.samples, 1);
    store.close(); store = null;
    store = openExperienceStore(path);
    assert.equal(store.model.samples, 1);
    assert.deepEqual(store.summary(), { signals: 1, outcomes: 1 });
    assert.equal(store.loadSignals()[0].learned, true);
  } finally {
    store?.close();
    const target = resolve(dir), parent = resolve(tmpdir());
    if (target.startsWith(parent + '\\') || target.startsWith(parent + '/')) rmSync(target, { recursive: true, force: true });
  }
});

test('existing signal history migrates without treating old strategy as experience', () => {
  const store = openExperienceStore(':memory:', { signals: [{ id: 'old', market: 'spot', symbol: 'ETHUSDT', timeframe: '1h',
    detectedAt: 100, state: 'STOPPED', events: [{ type: 'STOP', at: 200, price: 10 }] }] });
  try {
    assert.deepEqual(store.summary(), { signals: 1, outcomes: 0 });
    assert.equal(store.model.samples, 0);
  } finally { store.close(); }
});

