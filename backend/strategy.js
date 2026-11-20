export const MARKETS = ['spot', 'futures'];
export const DEFAULT_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT', 'DOGEUSDT', 'ADAUSDT', 'AVAXUSDT', 'LINKUSDT', 'LTCUSDT'];
export const TIMEFRAMES = Object.freeze({ '5m': 5, '15m': 15, '30m': 30, '1h': 60, '4h': 240 });

export function parseKlines(rows, now = Date.now()) {
  return rows.map(r => ({ time: Number(r[0]), open: Number(r[1]), high: Number(r[2]), low: Number(r[3]), close: Number(r[4]), volume: Number(r[5]), end: Number(r[6]) }))
    .filter(c => [c.time, c.open, c.high, c.low, c.close, c.volume, c.end].every(Number.isFinite) && c.end < now);
}

function atr(candles, end, periods = 14) {
  if (end < periods) return null;
  let sum = 0;
  for (let i = end - periods + 1; i <= end; i++) {
    const prev = candles[i - 1]?.close ?? candles[i].open;
    sum += Math.max(candles[i].high - candles[i].low, Math.abs(candles[i].high - prev), Math.abs(candles[i].low - prev));
  }
  return sum / periods;
}

function pivots(candles, end, span = 2) {
  const highs = [], lows = [];
  for (let i = span; i <= end - span; i++) {
    const left = candles.slice(i - span, i), right = candles.slice(i + 1, i + span + 1);
    if (left.every(c => candles[i].high > c.high) && right.every(c => candles[i].high > c.high)) highs.push({ index: i, price: candles[i].high });
    if (left.every(c => candles[i].low < c.low) && right.every(c => candles[i].low < c.low)) lows.push({ index: i, price: candles[i].low });
  }
  return { highs, lows };
}

export function findImbalances(candles) {
  const gaps = [];
  for (let i = 2; i < candles.length; i++) {
    const first = candles[i - 2], third = candles[i];
    if (first.high < third.low) gaps.push({ time: third.time, firstTime: first.time, direction: 'up', low: first.high, high: third.low,
      filledAt: candles.slice(i + 1).find(c => c.low <= first.high)?.time || null });
    if (first.low > third.high) gaps.push({ time: third.time, firstTime: first.time, direction: 'down', low: third.high, high: first.low,
      filledAt: candles.slice(i + 1).find(c => c.high >= first.low)?.time || null });
  }
  return gaps;
}

// Chart annotations use the same confirmed two-candle pivots and opposite-candle
// block definition as signal detection. A chart BOS alone is not a trade signal.
export function analyzeStructure(candles) {
  const swings = [], breaks = [];
  let lastHigh = null, lastLow = null;
  for (let i = 5; i < candles.length; i++) {
    const j = i - 3;
    const candidate = candles[j];
    if (candles.slice(j - 2, j).every(c => candidate.high > c.high) && candles.slice(j + 1, j + 3).every(c => candidate.high > c.high)) {
      lastHigh = { time: candidate.time, price: candidate.high, kind: 'high' };
      swings.push(lastHigh);
    }
    if (candles.slice(j - 2, j).every(c => candidate.low < c.low) && candles.slice(j + 1, j + 3).every(c => candidate.low < c.low)) {
      lastLow = { time: candidate.time, price: candidate.low, kind: 'low' };
      swings.push(lastLow);
    }
    const current = candles[i], previous = candles[i - 1];
    const direction = lastHigh && previous.close <= lastHigh.price && current.close > lastHigh.price ? 'up'
      : lastLow && previous.close >= lastLow.price && current.close < lastLow.price ? 'down' : null;
    if (!direction) continue;
    let block = null;
    for (let k = i - 1; k >= Math.max(0, i - 8); k--) {
      const c = candles[k];
      if (direction === 'up' ? c.close < c.open : c.close > c.open) { block = c; break; }
    }
    breaks.push({ time: current.time, direction, level: direction === 'up' ? lastHigh.price : lastLow.price,
      swingTime: direction === 'up' ? lastHigh.time : lastLow.time,
      block: block ? { time: block.time, low: block.low, high: block.high } : null });
  }
  return { swings: swings.slice(-14), breaks: breaks.slice(-8), imbalances: findImbalances(candles).slice(-12) };
}

// A deliberately mechanical SMC/OB interpretation. Only closed candles are used.
export function detectSignal(candles, market, symbol, timeframe = '1h') {
  if (candles.length < 35 || !MARKETS.includes(market) || !TIMEFRAMES[timeframe]) return null;
  const i = candles.length - 1, current = candles[i], previous = candles[i - 1];
  const volatility = atr(candles, i);
  if (!volatility || volatility <= 0 || Math.abs(current.close - current.open) < 1.2 * volatility) return null;
  const swings = pivots(candles, i - 1);
  const high = swings.highs.at(-1), low = swings.lows.at(-1);
  let side;
  if (high && current.close > high.price && previous.close <= high.price && current.close > current.open) side = 'LONG';
  else if (market === 'futures' && low && current.close < low.price && previous.close >= low.price && current.close < current.open) side = 'SHORT';
  else return null;

  // The opposite candle nearest the displacement is the candidate order block.
  let block;
  for (let j = i - 1; j >= Math.max(0, i - 8); j--) {
    const c = candles[j];
    if ((side === 'LONG' && c.close < c.open) || (side === 'SHORT' && c.close > c.open)) { block = c; break; }
  }
  if (!block) return null;
  const imbalance = findImbalances(candles.slice(Math.max(0, i - 6), i + 1)).reverse()
    .find(gap => !gap.filledAt && gap.direction === (side === 'LONG' ? 'up' : 'down') &&
      gap.high - gap.low >= 0.05 * volatility &&
      (side === 'LONG' ? current.low > gap.low : current.high < gap.high));
  if (!imbalance) return null;
  const entryLow = block.low, entryHigh = block.high;
  const entry = (entryLow + entryHigh) / 2;
  const stop = side === 'LONG' ? entryLow - 0.1 * volatility : entryHigh + 0.1 * volatility;
  const risk = Math.abs(entry - stop);
  if (risk <= 0 || (entryHigh - entryLow) > 2 * volatility) return null;
  // A pending retest must be ahead of price when the signal is created.
  if (side === 'LONG' ? current.close <= entryHigh : current.close >= entryLow) return null;
  const sign = side === 'LONG' ? 1 : -1;
  return {
    id: `${market}:${symbol}:${timeframe}:${current.time}:${side}`, market, symbol, side, timeframe,
    detectedAt: current.end, blockTime: block.time, entryLow, entryHigh, entry, stop, imbalance,
    targets: [1, 2, 3].map(n => entry + sign * n * risk),
    swing: side === 'LONG' ? high.price : low.price,
    features: [1,
      Math.min(3, Math.abs(current.close - current.open) / volatility),
      Math.min(3, (entryHigh - entryLow) / volatility),
      Math.min(3, Math.abs(current.close - (side === 'LONG' ? high.price : low.price)) / volatility),
      Math.min(3, Math.abs(current.close - entry) / volatility),
      market === 'futures' ? 1 : 0, side === 'SHORT' ? 1 : 0,
      Math.log(TIMEFRAMES[timeframe] / 5) / Math.log(48)],
    state: 'WAITING', hitTargets: 0, events: [{ type: 'CREATED', at: current.end, price: current.close }],
    expiresAt: current.end + 12 * TIMEFRAMES[timeframe] * 60000
  };
}

function hit(signal, type, price, at) {
  signal.events.push({ type, price, at });
  signal.updatedAt = at;
}

export function advanceSignal(signal, price, at = Date.now()) {
  if (!Number.isFinite(price) || price <= 0 || ['STOPPED', 'COMPLETED', 'CANCELLED', 'EXPIRED', 'UNCERTAIN'].includes(signal.state)) return false;
  if (signal.state === 'WAITING') {
    if (at >= signal.expiresAt) { signal.state = 'EXPIRED'; hit(signal, 'EXPIRED', price, at); return true; }
    const invalidated = signal.side === 'LONG' ? price <= signal.stop : price >= signal.stop;
    if (invalidated) { signal.state = 'CANCELLED'; hit(signal, 'INVALIDATED', price, at); return true; }
    if (price >= signal.entryLow && price <= signal.entryHigh) {
      signal.state = 'OPEN'; hit(signal, 'ENTRY', price, at); return true;
    }
    // A jump across the full zone gives no evidence that the midpoint was tradable.
    return false;
  }
  const stopped = signal.side === 'LONG' ? price <= signal.stop : price >= signal.stop;
  if (stopped) { signal.state = 'STOPPED'; hit(signal, 'STOP', price, at); return true; }
  let changed = false;
  while (signal.hitTargets < 3 && (signal.side === 'LONG' ? price >= signal.targets[signal.hitTargets] : price <= signal.targets[signal.hitTargets])) {
    signal.hitTargets++;
    signal.state = signal.hitTargets === 3 ? 'COMPLETED' : 'OPEN';
    hit(signal, `TP${signal.hitTargets}`, price, at); changed = true;
  }
  return changed;
}

// Recovery after a disconnected stream. If both TP and stop occur in one candle,
// count the stop first because their intrabar order is unknowable.
export function advanceSignalWithCandle(signal, candle) {
  if (signal.state === 'WAITING') {
    if (candle.end >= signal.expiresAt) { signal.state = 'EXPIRED'; hit(signal, 'EXPIRED', candle.close, candle.end); return true; }
    const invalidated = signal.side === 'LONG' ? candle.low <= signal.stop : candle.high >= signal.stop;
    if (invalidated) { signal.state = 'CANCELLED'; hit(signal, 'INVALIDATED', signal.stop, candle.end); return true; }
    const reached = candle.high >= signal.entry && candle.low <= signal.entry;
    if (reached) { signal.state = 'OPEN'; hit(signal, 'ENTRY', signal.entry, candle.end); return true; }
    return false;
  }
  if (signal.state === 'OPEN') {
    const stopped = signal.side === 'LONG' ? candle.low <= signal.stop : candle.high >= signal.stop;
    if (stopped) { signal.state = 'STOPPED'; hit(signal, 'STOP', signal.stop, candle.end); return true; }
    let changed = false;
    while (signal.hitTargets < 3 && (signal.side === 'LONG' ? candle.high >= signal.targets[signal.hitTargets] : candle.low <= signal.targets[signal.hitTargets])) {
      const target = signal.targets[signal.hitTargets];
      signal.hitTargets++;
      signal.state = signal.hitTargets === 3 ? 'COMPLETED' : 'OPEN';
      hit(signal, `TP${signal.hitTargets}`, target, candle.end);
      changed = true;
    }
    return changed;
  }
  return false;
}

