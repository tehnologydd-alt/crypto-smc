import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStatistics } from './statistics.js';

test('counts each reached level once per signal across the full history', () => {
  const signals = [
    { symbol: 'BTCUSDT', events: ['CREATED', 'ENTRY', 'TP1', 'TP2', 'TP1', 'STOP'].map(type => ({ type })) },
    { symbol: 'BTCUSDT', events: ['CREATED', 'ENTRY', 'TP1', 'TP2', 'TP3'].map(type => ({ type })) },
    { symbol: 'ETHUSDT', events: ['CREATED', 'INVALIDATED'].map(type => ({ type })) }
  ];
  const stats = buildStatistics(signals, []);
  assert.deepEqual(stats.totals, { signals: 3, entered: 2, tp1: 2, tp2: 2, tp3: 1, stop: 1, resolved: 2, successful: 2, invalidated: 1, expired: 0, uncertain: 0 });
  assert.deepEqual(stats.bySymbol.find(row => row.symbol === 'BTCUSDT'), { symbol: 'BTCUSDT', signals: 2, entered: 2, tp1: 2, tp2: 2, tp3: 1, stop: 1, resolved: 2, successful: 2 });
  assert.equal(stats.newStrategy.strategyTrend, null);
});

test('compares separate recent windows for strategy and model forecasts', () => {
  const outcomes = Array.from({ length: 40 }, (_, i) => ({ strategy_version: 4, resolved_at: i + 1,
    label: i >= 20 ? 1 : 0, prediction: i >= 20 ? .8 : .5, trained_samples: 30 + i }));
  const stats = buildStatistics([], outcomes);
  assert.equal(stats.newStrategy.resolved, 40);
  assert.equal(stats.newStrategy.strategyTrend.previous, 0);
  assert.equal(stats.newStrategy.strategyTrend.recent, 1);
  assert.ok(stats.newStrategy.forecastTrend.recentError < stats.newStrategy.forecastTrend.previousError);
  assert.equal(stats.newStrategy.series.length, 4);
});

