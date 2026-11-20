const rate = rows => rows.length ? rows.reduce((sum, row) => sum + row.label, 0) / rows.length : null;
const brier = rows => rows.length ? rows.reduce((sum, row) => sum + (row.prediction - row.label) ** 2, 0) / rows.length : null;

export function buildStatistics(signals, outcomes) {
  const totals = { signals: 0, entered: 0, tp1: 0, tp2: 0, tp3: 0, stop: 0, resolved: 0, successful: 0, invalidated: 0, expired: 0, uncertain: 0 };
  const bySymbol = {};
  for (const signal of signals) {
    const events = new Set((signal.events || []).map(event => event.type));
    const bucket = bySymbol[signal.symbol] ||= { symbol: signal.symbol, signals: 0, entered: 0, tp1: 0, tp2: 0, tp3: 0, stop: 0, resolved: 0, successful: 0 };
    totals.signals++; bucket.signals++;
    for (const [event, field] of [['ENTRY', 'entered'], ['TP1', 'tp1'], ['TP2', 'tp2'], ['TP3', 'tp3'], ['STOP', 'stop']]) {
      if (events.has(event)) { totals[field]++; bucket[field]++; }
    }
    if (events.has('INVALIDATED')) totals.invalidated++;
    if (events.has('EXPIRED')) totals.expired++;
    if (events.has('DATA_GAP')) totals.uncertain++;
    if (events.has('ENTRY') && (events.has('TP1') || events.has('STOP'))) {
      totals.resolved++; bucket.resolved++;
      if (events.has('TP1')) { totals.successful++; bucket.successful++; }
    }
  }
  const ordered = outcomes.filter(row => row.strategy_version === 2 && [0, 1].includes(row.label))
    .sort((a, b) => a.resolved_at - b.resolved_at);
  const recent = ordered.slice(-20), previous = ordered.slice(-40, -20);
  const strategyTrend = previous.length === 20 && recent.length === 20
    ? { previous: rate(previous), recent: rate(recent), difference: rate(recent) - rate(previous), window: 20 } : null;
  const validation = ordered.filter(row => row.trained_samples >= 30 && Number.isFinite(row.prediction));
  const recentForecast = validation.slice(-20), previousForecast = validation.slice(-40, -20);
  const forecastTrend = previousForecast.length === 20 && recentForecast.length === 20
    ? { previousError: brier(previousForecast), recentError: brier(recentForecast), difference: brier(recentForecast) - brier(previousForecast), window: 20 } : null;
  const series = [];
  const last = ordered.slice(-60);
  const remainder = last.length % 10;
  for (let i = remainder; i + 10 <= last.length; i += 10) {
    const group = last.slice(i, i + 10);
    series.push({ from: group[0].resolved_at, to: group.at(-1).resolved_at, rate: rate(group), count: 10 });
  }
  return { totals, bySymbol: Object.values(bySymbol).sort((a, b) => a.symbol.localeCompare(b.symbol)),
    newStrategy: { resolved: ordered.length, successful: ordered.reduce((sum, row) => sum + row.label, 0), rate: rate(ordered),
      validation: validation.length, strategyTrend, forecastTrend, series } };
}

