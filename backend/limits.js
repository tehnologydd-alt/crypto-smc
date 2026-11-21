import { TIMEFRAMES } from './strategy.js';

// The current Node server uses one Binance WebSocket per market for M1 and
// another for large trades. REST is used for closed M5-H4 bars and recovery.
export function usagePlan(symbolCount) {
  const symbols = Math.max(0, Math.min(10, Math.trunc(symbolCount)));
  const markets = 2;
  const timeframeRequestsPerDay = symbols * markets * Object.values(TIMEFRAMES)
    .reduce((sum, minutes) => sum + 1440 / minutes, 0);
  const depthBootstrapMinRequests = symbols * markets;
  const cloudflareM1RequestsPerDay = symbols * markets * 1440;
  const peakRequestsPerCron = symbols * markets * (1 + Object.keys(TIMEFRAMES).length);
  return {
    symbols, markets,
    node: { websocketConnections: 6, timeframeRestRequestsPerDay: timeframeRequestsPerDay,
      depthBootstrapRequestsOnStart: depthBootstrapMinRequests, depthBootstrapPerReconnect: depthBootstrapMinRequests },
    cloudflareFree: {
      cronInvocationsPerDay: 1440,
      estimatedBinanceSubrequestsPerDay: cloudflareM1RequestsPerDay + timeframeRequestsPerDay,
      peakSubrequestsPerCron: peakRequestsPerCron,
      subrequestLimitPerInvocation: 50,
      fitsSingleCron: peakRequestsPerCron <= 50,
      note: 'Estimate for a separate Cron/D1 implementation, not the current Node server.'
    }
  };
}

export class RateBudget {
  constructor(saved = {}, now = () => Date.now()) {
    this.now = now;
    this.perMinute = { spot: 1000, futures: 500 };
    this.perDay = { spot: 30000, futures: 30000 };
    this.state = {};
    for (const market of ['spot', 'futures']) {
      const old = saved[market] || {};
      this.state[market] = {
        minute: old.minute || -1, day: old.day || -1,
        minuteWeight: old.minuteWeight || 0, dayWeight: old.dayWeight || 0,
        pausedUntil: old.pausedUntil || 0, rejected: old.rejected || 0
      };
    }
  }
  roll(market) {
    const now = this.now();
    const state = this.state[market];
    if (!state) throw new Error('Unknown market');
    const minute = Math.floor(now / 60000);
    const day = Math.floor(now / 86400000);
    if (state.minute !== minute) { state.minute = minute; state.minuteWeight = 0; }
    if (state.day !== day) { state.day = day; state.dayWeight = 0; state.rejected = 0; }
    return state;
  }
  reserve(market, weight) {
    if (!Number.isInteger(weight) || weight < 1 || weight > 50) throw new Error('Invalid Binance request weight');
    const state = this.roll(market);
    if (this.now() < state.pausedUntil ||
        state.minuteWeight + weight > this.perMinute[market] ||
        state.dayWeight + weight > this.perDay[market]) {
      state.rejected++;
      throw new Error(`Binance budget paused for ${market}; retry later`);
    }
    state.minuteWeight += weight;
    state.dayWeight += weight;
  }
  observe(market, response) {
    const state = this.roll(market);
    const actual = Number(response.headers?.get('x-mbx-used-weight-1m'));
    if (Number.isFinite(actual) && actual > state.minuteWeight) state.minuteWeight = actual;
    if (response.status === 429 || response.status === 418) {
      const seconds = Number(response.headers?.get('retry-after'));
      state.pausedUntil = this.now() + Math.max(60, Number.isFinite(seconds) ? seconds : 60) * 1000;
    }
  }
  snapshot() {
    return Object.fromEntries(['spot', 'futures'].map(market => {
      const state = this.roll(market);
      return [market, { ...state, minuteLimit: this.perMinute[market], dayLimit: this.perDay[market] }];
    }));
  }
  exportState() {
    return Object.fromEntries(['spot', 'futures'].map(market => [market, { ...this.roll(market) }]));
  }
}

