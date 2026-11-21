import test from 'node:test';
import assert from 'node:assert/strict';
import { collectClosedWindow, runHistoricalResearch } from './historical-research.js';

function bar(time, period) { return { time, end: time + period - 1,
  open: 100, high: 101, low: 99, close: 100, volume: 1 }; }

test('historical loader paginates closed candles without a future bar', async () => {
  const period = 60000, calls = [];
  const fetch = async (_market, _symbol, _tf, options) => {
    calls.push(options.startTime);
    return Array.from({ length: 1000 }, (_, i) => bar(options.startTime + i * period, period));
  };
  const rows = await collectClosedWindow(fetch, 'BTCUSDT', '1m', 0, 1500 * period - 1);
  assert.equal(rows.length, 1500);
  assert.deepEqual(calls, [0, 1000 * period]);
  assert.equal(rows.at(-1).end, 1500 * period - 1);
});

test('historical loader rejects an OHLCV gap instead of inventing a result', async () => {
  const fetch = async () => [bar(0, 60000), bar(120000, 60000)];
  await assert.rejects(collectClosedWindow(fetch, 'BTCUSDT', '1m', 0, 180000 - 1),
    /Пробел в истории/);
});

test('research endpoint input rejects unbounded workloads before fetching', async () => {
  let fetched = false;
  await assert.rejects(runHistoricalResearch({ symbol:'BTCUSDT', timeframe:'4h', days:365 },
    async () => { fetched = true; return []; }), /Выберите отмеченный актив/);
  assert.equal(fetched, false);
});
