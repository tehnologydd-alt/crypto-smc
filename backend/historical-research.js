import { TIMEFRAMES } from './strategy.js';
import { compareStrategies } from './replay-rules.js';

const DAY = 86400000;
const REPLAY_TIMEFRAMES = Object.freeze(['5m', '15m', '30m']);

export async function collectClosedWindow(fetchCandles, symbol, timeframe, start, end) {
  const minutes = timeframe === '1m' ? 1 : timeframe === '1h' ? 60 : TIMEFRAMES[timeframe];
  if (!minutes) throw new Error('Таймфрейм не поддерживается');
  const period = minutes * 60000;
  const first = Math.ceil(start / period) * period;
  const last = Math.floor((end + 1) / period) * period - 1;
  const rows = [];
  for (let cursor = first; cursor <= last;) {
    if (rows.length > 12000) throw new Error('Слишком длинное окно исследования');
    const batch = await fetchCandles('futures', symbol, timeframe, { startTime: cursor, limit: 1000 });
    const closed = batch.filter(bar => bar.time >= cursor && bar.end <= last);
    if (!closed.length || closed[0].time !== cursor)
      throw new Error(`Неполная история ${timeframe}: нет свечи ${new Date(cursor).toISOString()}`);
    for (const candle of closed) {
      const expected = rows.length ? rows.at(-1).time + period : first;
      if (candle.time !== expected || candle.end !== candle.time + period - 1)
        throw new Error(`Пробел в истории ${timeframe}: ${new Date(expected).toISOString()}`);
      rows.push(candle);
    }
    cursor = rows.at(-1).time + period;
  }
  return rows;
}

export async function runHistoricalResearch({ symbol, timeframe, days, feeBps = 5, slippageBps = 2 }, fetchCandles,
  now = Date.now(), fetchFundingRates = null) {
  if (!/^[A-Z0-9]{2,16}USDT$/.test(symbol || '') || !REPLAY_TIMEFRAMES.includes(timeframe) ||
      ![3, 7].includes(days) || ![feeBps, slippageBps].every(n => Number.isFinite(n) && n >= 0 && n <= 100))
    throw new Error('Выберите отмеченный актив, M5/M15/M30, окно 3 или 7 дней и допустимые расходы');
  const end = Math.floor(now / 60000) * 60000 - 1;
  const start = end + 1 - days * DAY;
  const [m1, bars, parentBars] = await Promise.all([
    collectClosedWindow(fetchCandles, symbol, '1m', start, end),
    collectClosedWindow(fetchCandles, symbol, timeframe, start, end),
    collectClosedWindow(fetchCandles, symbol, '1h', start, end)
  ]);
  let fundingRates = [], fundingKnown = false, fundingError = null;
  if (fetchFundingRates) {
    try { fundingRates = await fetchFundingRates(symbol, start, end); fundingKnown = true; }
    catch (error) { fundingError = error.message; }
  }
  const comparison = compareStrategies({ market: 'futures', symbol, timeframe, bars, parentBars, m1 },
    { fundingRates, fundingKnown, feeBps, slippageBps });
  return { ...comparison, collectedAt: Date.now(), period: { from: start, to: end, days },
    candles: { m1: m1.length, working: bars.length, parent: parentBars.length },
    funding: { known: fundingKnown, events: fundingRates.length, error: fundingError },
    scope: 'Историческое исследование. Никаких живых сигналов и обновлений модели не создаёт.' };
}
