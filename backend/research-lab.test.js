import test from 'node:test';
import assert from 'node:assert/strict';
import { openExperienceStore } from './experience.js';
import { assessCandidate, buildResearchLab } from './research-lab.js';

function signal(id, quality, events = [{ type: 'CREATED', at: 1000 }]) {
  return { id, market: 'futures', symbol: 'BTCUSDT', timeframe: '15m', side: 'LONG',
    strategyVersion: 4, strategyKey: 'breakout', detectedAt: 1000, state: 'WAITING',
    entry: 100, stop: 99, targets: [101,102,103], quality, events };
}

test('shadow decision is frozen from evidence available when candidate appears', () => {
  const unproven = signal('collect', { probability: .95, baseline: .5, trainedSamples: 2, trusted: false });
  assert.equal(assessCandidate(unproven).verdict, 'COLLECT');
  const strong = signal('pass', { probability: .7, baseline: .5, trainedSamples: 60, trusted: true });
  const verdict = assessCandidate(strong);
  assert.equal(verdict.verdict, 'PASS');
  strong.events.push({ type: 'ENTRY', at: 2000 }, { type: 'STOP', at: 3000 });
  assert.deepEqual(assessCandidate(strong), verdict);
  assert.equal(assessCandidate(signal('reject', { probability: .6, baseline: .59, trainedSamples: 60, trusted: true })).verdict, 'REJECT');
});

test('lab keeps unassessed history separate and counts TP1 before stop', () => {
  const winning = signal('win', { probability: .7, baseline: .5, trainedSamples: 60, trusted: true },
    [{ type: 'CREATED', at: 1000 }, { type: 'ENTRY', at: 2000 },
      { type: 'TP1', at: 3000 }, { type: 'STOP', at: 4000 }]);
  winning.state = 'STOPPED';
  winning.researchV5 = assessCandidate(winning);
  const missed = signal('miss', { probability: .5, baseline: .5, trainedSamples: 0, trusted: false },
    [{ type: 'CREATED', at: 1000 }, { type: 'EXPIRED', at: 4000 }]);
  missed.state = 'EXPIRED';
  const report = buildResearchLab([winning, missed], [], 5000);
  assert.equal(report.total.candidates, 2);
  assert.equal(report.total.entered, 1);
  assert.equal(report.total.tp1First, 1);
  assert.equal(report.total.expiredWithoutEntry, 1);
  assert.equal(report.shadow.PASS.candidates, 1);
  assert.equal(report.assessed, 1);
  assert.equal(report.latest.find(row => row.id === 'miss').shadow, null);
});

test('closed futures candles are stored once and survive research queries', () => {
  const store = openExperienceStore(':memory:');
  try {
    const bar = { time: 0, end: 59999, open: 100, high: 102, low: 99, close: 101, volume: 42 };
    assert.equal(store.recordCandles('futures', 'BTCUSDT', '1m', [bar]), 1);
    assert.equal(store.recordCandles('futures', 'BTCUSDT', '1m', [bar]), 0);
    assert.equal(store.recordCandles('spot', 'BTCUSDT', '1m', [bar]), 0);
    assert.equal(store.recordCandles('futures', 'BTCUSDT', '5m', [bar]), 0);
    assert.deepEqual(store.candleCoverage(), [{ symbol: 'BTCUSDT', timeframe: '1m',
      candles: 1, firstOpen: 0, lastClose: 59999 }]);
  } finally { store.close(); }
});
