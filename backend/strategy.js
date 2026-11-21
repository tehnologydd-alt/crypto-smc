import { MarketStructureEngine, ZonesDetector, detectV3 } from './smc-v3.js';
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
  return ZonesDetector.fvg(candles).map(z=>({
    time:z.time, firstTime:z.firstTime, direction:z.direction, low:z.low, high:z.high,
    status:z.status, filledAt:z.filledAt, mitigatedAt:z.mitigatedAt,
    invalidatedAt:z.invalidatedAt, expiresAt:z.expiresAt
  }));
}

// The chart and generator share the same SMC v3 definitions.
export function analyzeStructure(candles) {
  const structure=MarketStructureEngine.analyze(candles);
  const zones=ZonesDetector.scan(candles,structure);
  const blocks=new Map(zones.ob.map(z=>[z.originEventId,z]));
  return { regime:structure.regime, swings:structure.swings.slice(-14),
    breaks:structure.breaks.slice(-8).map(e=>({
      ...e, block:blocks.get(e.id) || null
    })),
    imbalances:zones.fvg.slice(-12), zones:{
      ob:zones.ob.slice(-20), fvg:zones.fvg.slice(-20)
    } };
}

export function detectSignal(candles,market,symbol,timeframe='1h',parentBars) {
  return detectV3(candles,market,symbol,timeframe,parentBars);
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

