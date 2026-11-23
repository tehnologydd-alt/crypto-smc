import test from 'node:test';
import assert from 'node:assert/strict';
import { simulatePaperTrade, summarizePaperTrades } from './paper-sim.js';

const bar = (time, open, high, low, close) =>
  ({ time, end: time + 59999, open, high, low, close, volume: 1 });
const signal = (overrides = {}) => ({
  id: 'candidate-1', market: 'futures', symbol: 'BTCUSDT', strategyKey: 'smc',
  side: 'LONG', entryMode: 'LIMIT', detectedAt: 59999, expiresAt: 600000,
  entry: 100, stop: 98, targets: [102, 104, 106],
  events: [{ type: 'CREATED', at: 59999, price: 101 }], ...overrides
});

test('paper limit order has no credit for a target on its ambiguous entry minute', () => {
  const trade = simulatePaperTrade(signal(), [
    bar(60000, 101, 103, 99, 101), bar(120000, 101, 101, 97, 98)
  ]);
  assert.equal(trade.status, 'STOPPED');
  assert.deepEqual(trade.events.map(e => e.type), ['ENTRY', 'STOP']);
  assert.ok(trade.netR < -1);
});

test('paper trade records partial targets, stop move and net costs', () => {
  const trade = simulatePaperTrade(signal(), [
    bar(60000, 101, 101, 99, 100),
    bar(120000, 100, 103, 99.9, 102),
    bar(180000, 102, 103, 99, 100)
  ]);
  assert.equal(trade.status, 'STOPPED');
  assert.deepEqual(trade.events.map(e => e.type), ['ENTRY', 'TP1', 'MOVE_STOP', 'STOP']);
  assert.ok(Math.abs(trade.events.at(-1).fraction - 2 / 3) < 1e-12);
  assert.ok(trade.fees > 0);
  assert.ok(trade.slippagePnl < 0);
  assert.ok(trade.netR > 0 && trade.netR < 1);
});

test('paper short receives positive funding and loses on a stop-first candle', () => {
  const trade = simulatePaperTrade(signal({
    strategyKey: 'breakout', side: 'SHORT', entryMode: 'NEXT_M1_OPEN',
    entryAtr: 2, entry: 100, stop: 102, targets: [98, 96, 94], expiresAt: 120000,
    events: [{ type: 'CREATED', at: 59999, price: 100 }]
  }), [bar(60000, 100, 101, 99, 100), bar(120000, 100, 103, 97, 99)],
  [{ fundingTime: 120000, fundingRate: 0.001, markPrice: 100 }]);
  assert.equal(trade.status, 'STOPPED');
  assert.deepEqual(trade.events.map(e => e.type), ['ENTRY', 'FUNDING', 'STOP']);
  assert.equal(trade.fundingPnl, 0.1);
  assert.ok(trade.netR < 0);
});

test('unfilled and open paper positions are excluded from closed expectancy', () => {
  const cancelled = simulatePaperTrade(signal(), [bar(60000, 101, 101, 97, 100)]);
  const open = simulatePaperTrade(signal(), [bar(60000, 101, 101, 99, 100)]);
  assert.equal(cancelled.status, 'CANCELLED');
  assert.equal(cancelled.netR, null);
  assert.equal(open.status, 'OPEN');
  assert.deepEqual(summarizePaperTrades([cancelled, open]), {
    candidates: 2, entries: 1, closed: 0, profitable: 0, open: 1,
    netR: 0, averageR: null, fees: 0, fundingPnl: 0, unfilled: 1
  });
});
