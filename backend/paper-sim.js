// A conservative, candle-based execution experiment. Touches are assumptions,
// not exchange fills. All prices and PnL are for one unit of the base asset.
export const PAPER_ASSUMPTIONS = Object.freeze({
  version: 'paper-v1', feeBps: 5, slippageBps: 2,
  takeProfitFractions: [1 / 3, 1 / 3, 1 / 3], moveStopAfterTp1: true
});

const closeEnough = (a, b) => Math.abs(a - b) < 1e-9;

export function simulatePaperTrade(signal, candles, fundingRates = [], assumptions = PAPER_ASSUMPTIONS) {
  if (signal?.market !== 'futures' || !['LONG', 'SHORT'].includes(signal.side) ||
      !['LIMIT', 'NEXT_M1_OPEN'].includes(signal.entryMode) || !Array.isArray(candles))
    throw new Error('Paper simulation requires a futures signal and M1 candles');
  const direction = signal.side === 'LONG' ? 1 : -1;
  const fee = assumptions.feeBps / 10000;
  const slip = assumptions.slippageBps / 10000;
  if (!(fee >= 0 && fee < .01 && slip >= 0 && slip < .01))
    throw new Error('Invalid paper cost assumptions');
  if (![signal.entry, signal.stop, signal.detectedAt, signal.expiresAt].every(Number.isFinite) ||
      signal.entry <= 0 || signal.stop <= 0 || signal.expiresAt <= signal.detectedAt ||
      (signal.entryMode === 'NEXT_M1_OPEN' && !(signal.entryAtr > 0)) ||
      (signal.entryMode === 'LIMIT' &&
        (!Array.isArray(signal.targets) || signal.targets.length !== 3 ||
          !signal.targets.every(Number.isFinite))))
    throw new Error('Incomplete paper signal');
  const result = { signalId: signal.id, symbol: signal.symbol, strategy: signal.strategyKey,
    side: signal.side, detectedAt: signal.detectedAt, status: 'WAITING', entryAt: null,
    entryReference: null, entryFill: null, initialStop: null, activeStop: null,
    targets: [], remaining: 1, grossPnl: 0, fees: 0, fundingPnl: 0,
    slippagePnl: 0, netPnl: null, netR: null, events: [],
    assumption: 'M1 touch implies hypothetical fill; intrabar stop wins ambiguity' };
  let actualPnl = 0;
  let fundingIndex = 0;
  const rates = [...fundingRates].filter(row => Number.isFinite(row.fundingTime) &&
    Number.isFinite(row.fundingRate)).sort((a, b) => a.fundingTime - b.fundingTime);
  while (fundingIndex < rates.length && rates[fundingIndex].fundingTime <= signal.detectedAt) fundingIndex++;
  const worseEntry = raw => raw * (1 + direction * slip);
  const worseExit = raw => raw * (1 - direction * slip);
  const touchedStop = (bar, stop) => direction === 1 ? bar.low <= stop : bar.high >= stop;
  const touchedTarget = (bar, target) => direction === 1 ? bar.high >= target : bar.low <= target;
  const stopReference = (bar, stop) => direction === 1 ? Math.min(stop, bar.open) : Math.max(stop, bar.open);
  let nextTarget = 0;
  const finish = (status, at) => {
    result.status = status;
    result.closedAt = at;
    result.netPnl = result.entryFill == null ? null : actualPnl - result.fees + result.fundingPnl;
    result.netR = result.entryFill == null ? null : result.netPnl / Math.abs(result.entryFill - result.initialStop);
  };
  const exit = (type, raw, at, fraction) => {
    const fill = worseExit(raw);
    actualPnl += direction * (fill - result.entryFill) * fraction;
    result.grossPnl += direction * (raw - result.entryReference) * fraction;
    result.fees += fill * fee * fraction;
    result.remaining = Math.max(0, result.remaining - fraction);
    result.slippagePnl = actualPnl - result.grossPnl;
    result.events.push({ type, at, reference: raw, fill, fraction });
    if (closeEnough(result.remaining, 0)) finish(type === 'STOP' ? 'STOPPED' : 'COMPLETED', at);
  };
  for (const bar of candles) {
    if (bar.end <= signal.detectedAt) continue;
    if (result.status === 'WAITING') {
      let raw;
      if (signal.entryMode === 'NEXT_M1_OPEN') {
        if (bar.end > signal.detectedAt + 60000) { finish('UNCERTAIN', bar.end); break; }
        const indicated = signal.events?.find(e => e.type === 'CREATED')?.price ?? signal.entry;
        if (Math.abs(bar.open - indicated) > .25 * signal.entryAtr) {
          finish('CANCELLED', bar.end); break;
        }
        raw = bar.open;
      } else {
        if (bar.end >= signal.expiresAt) { finish('EXPIRED', bar.end); break; }
        if (touchedStop(bar, signal.stop)) { finish('CANCELLED', bar.end); break; }
        if (bar.low > signal.entry || bar.high < signal.entry) continue;
        raw = signal.entry;
      }
      result.entryAt = bar.end;
      result.entryReference = raw;
      result.entryFill = worseEntry(raw);
      result.initialStop = signal.entryMode === 'NEXT_M1_OPEN'
        ? raw - direction * signal.entryAtr : signal.stop;
      result.activeStop = result.initialStop;
      result.targets = signal.entryMode === 'NEXT_M1_OPEN'
        ? [1, 2, 3].map(n => raw + direction * n * signal.entryAtr)
        : [...signal.targets];
      if (!(direction * (result.entryFill - result.initialStop) > 0)) {
        finish('CANCELLED', bar.end); break;
      }
      result.status = 'OPEN';
      result.fees += result.entryFill * fee;
      result.events.push({ type: 'ENTRY', at: bar.end, reference: raw, fill: result.entryFill, fraction: 1 });
      // A market entry at the M1 open precedes that candle's range. A limit
      // touch does not establish the order of any later touch in that candle.
      if (signal.entryMode === 'LIMIT') continue;
    }
    while (fundingIndex < rates.length && rates[fundingIndex].fundingTime <= bar.end) {
      const funding = rates[fundingIndex++];
      if (funding.fundingTime > result.entryAt && result.status === 'OPEN') {
        const mark = Number.isFinite(funding.markPrice) && funding.markPrice > 0
          ? funding.markPrice : bar.close;
        const amount = -direction * result.remaining * mark * funding.fundingRate;
        result.fundingPnl += amount;
        result.events.push({ type: 'FUNDING', at: funding.fundingTime, rate: funding.fundingRate, amount });
      }
    }
    if (touchedStop(bar, result.activeStop)) {
      exit('STOP', stopReference(bar, result.activeStop), bar.end, result.remaining);
      break;
    }
    while (nextTarget < 3 && touchedTarget(bar, result.targets[nextTarget])) {
      const index = nextTarget++;
      const fraction = index === 2 ? result.remaining : Math.min(result.remaining,
        assumptions.takeProfitFractions[index]);
      exit(`TP${index + 1}`, result.targets[index], bar.end, fraction);
      if (result.status !== 'OPEN') break;
      if (index === 0 && assumptions.moveStopAfterTp1) {
        // The next M1 uses a trigger that covers both taker fees and assumed
        // adverse slippage for the remaining position, before funding.
        result.activeStop = direction === 1
          ? result.entryFill * (1 + fee) / ((1 - slip) * (1 - fee))
          : result.entryFill * (1 - fee) / ((1 + slip) * (1 + fee));
        result.events.push({ type: 'MOVE_STOP', at: bar.end, price: result.activeStop });
      }
    }
    if (result.status !== 'OPEN') break;
  }
  if (result.status === 'OPEN') {
    result.slippagePnl = actualPnl - result.grossPnl;
    result.realizedPnl = actualPnl - result.fees + result.fundingPnl;
  }
  return result;
}

export function summarizePaperTrades(trades) {
  const closed = trades.filter(t => ['STOPPED', 'COMPLETED'].includes(t.status));
  const netR = closed.reduce((sum, t) => sum + t.netR, 0);
  return { candidates: trades.length, entries: trades.filter(t => t.entryAt != null).length,
    closed: closed.length, profitable: closed.filter(t => t.netR > 0).length,
    open: trades.filter(t => t.status === 'OPEN').length,
    netR, averageR: closed.length ? netR / closed.length : null,
    fees: closed.reduce((sum, t) => sum + t.fees, 0),
    fundingPnl: closed.reduce((sum, t) => sum + t.fundingPnl, 0),
    unfilled: trades.filter(t => ['EXPIRED', 'CANCELLED', 'UNCERTAIN'].includes(t.status)).length };
}
