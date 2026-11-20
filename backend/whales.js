export const LARGE_TRADE_USD = 250_000;
const WINDOW_MS = 15 * 60_000;

export class LargeTradeTracker {
  constructor() { this.byPair = new Map(); }

  record(market, trade, now = Date.now()) {
    const price = Number(trade?.p), quantity = Number(trade?.q), at = Number(trade?.T);
    const usd = price * quantity;
    if (!trade?.s || !Number.isFinite(usd) || usd < LARGE_TRADE_USD || !Number.isFinite(at) || at > now + 60_000 || at < now - WINDOW_MS || typeof trade.m !== 'boolean') return false;
    const pair = `${market}:${trade.s}`;
    const entry = this.byPair.get(pair) || { buckets: new Map(), recent: [], lastId: -1 };
    if (Number.isFinite(Number(trade.a)) && Number(trade.a) <= entry.lastId) return false;
    entry.lastId = Number(trade.a) || entry.lastId;
    const minute = Math.floor(at / 60_000);
    const bucket = entry.buckets.get(minute) || { buyCount: 0, sellCount: 0, buyUsd: 0, sellUsd: 0 };
    const side = trade.m ? 'sell' : 'buy';
    bucket[`${side}Count`]++;
    bucket[`${side}Usd`] += usd;
    entry.buckets.set(minute, bucket);
    entry.recent.unshift({ at, side, usd, price });
    entry.recent.length = Math.min(entry.recent.length, 8);
    this.byPair.set(pair, entry);
    return true;
  }

  summary(market, symbol, now = Date.now()) {
    const entry = this.byPair.get(`${market}:${symbol}`);
    const result = { thresholdUsd: LARGE_TRADE_USD, windowMinutes: 15, buyCount: 0, sellCount: 0, buyUsd: 0, sellUsd: 0, recent: [] };
    if (!entry) return result;
    const cutoff = now - WINDOW_MS;
    for (const [minute, bucket] of entry.buckets) {
      if ((minute + 1) * 60_000 <= cutoff) { entry.buckets.delete(minute); continue; }
      for (const field of ['buyCount', 'sellCount', 'buyUsd', 'sellUsd']) result[field] += bucket[field];
    }
    entry.recent = entry.recent.filter(item => item.at > cutoff);
    result.recent = entry.recent;
    return result;
  }
}

