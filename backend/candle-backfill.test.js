import test from 'node:test';
import assert from 'node:assert/strict';
import { backfillM1 } from './candle-backfill.js';

test('M1 recovery pages from the last archived close and skips current symbols', async () => {
  const minute = 60000, now = 200000 * minute;
  const calls = [];
  const rows = await backfillM1(['BTCUSDT', 'ETHUSDT'], symbol =>
    symbol === 'BTCUSDT' ? now - 1500 * minute : 0,
  async (symbol, start, limit) => {
    calls.push({ symbol, start, limit });
    const count = calls.length === 1 ? 1000 : 500;
    return Array.from({ length: count }, (_, i) => ({ end: start + (i + 1) * minute - 1 }));
  }, now);
  assert.deepEqual(rows, [{ symbol: 'BTCUSDT', pages: 2, received: 1500 }]);
  assert.deepEqual(calls, [
    { symbol: 'BTCUSDT', start: now - 1500 * minute, limit: 1000 },
    { symbol: 'BTCUSDT', start: now - 500 * minute, limit: 1000 }
  ]);
});

test('M1 recovery bounds a long outage and reports a failed symbol', async () => {
  const minute = 60000, now = 200000 * minute;
  const calls = [];
  const rows = await backfillM1(['BTCUSDT', 'ETHUSDT'], (_, since) => since,
    async (symbol, start) => {
      calls.push({ symbol, start });
      if (symbol === 'BTCUSDT') throw new Error('Binance unavailable');
      return [];
    }, now);
  assert.equal(calls[0].start, now - 48 * 60 * minute);
  assert.equal(rows[0].error, 'Binance unavailable');
  assert.deepEqual(rows[1], { symbol: 'ETHUSDT', pages: 0, received: 0 });
});
