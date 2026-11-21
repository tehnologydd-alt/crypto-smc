// Versioned shadow policy. Decisions are frozen when a candidate is created;
// outcomes never change the decision that would have been made at that time.
export const SHADOW_POLICY = Object.freeze({ version: 'v5-shadow-1', minimumProbability: 0.60, minimumLift: 0.05 });

export function assessCandidate(signal) {
  const quality = signal.quality;
  const frozen = { policy: SHADOW_POLICY.version, at: signal.detectedAt,
    probability: Number.isFinite(quality?.probability) ? quality.probability : null,
    baseline: Number.isFinite(quality?.baseline) ? quality.baseline : null,
    trainedSamples: Number.isSafeInteger(quality?.trainedSamples) ? quality.trainedSamples : 0 };
  if (signal.strategyVersion !== 4 || !['smc', 'breakout'].includes(signal.strategyKey))
    return { ...frozen, verdict: 'ARCHIVE', reason: 'Прежняя версия стратегии' };
  if (!quality || frozen.probability === null || frozen.baseline === null)
    return { ...frozen, verdict: 'COLLECT', reason: 'Нет корректной оценки при создании' };
  if (!quality.trusted)
    return { ...frozen, verdict: 'COLLECT', reason: 'Модель ещё не прошла независимую проверку' };
  const threshold = Math.max(SHADOW_POLICY.minimumProbability,
    frozen.baseline + SHADOW_POLICY.minimumLift);
  return { ...frozen, threshold, verdict: frozen.probability >= threshold ? 'PASS' : 'REJECT',
    reason: frozen.probability >= threshold ? 'Оценка выше порога и базовой частоты' :
      'Преимущество перед базовой частотой не подтверждено' };
}

function firstOutcome(signal) {
  const events = signal.events || [];
  const entryIndex = events.findIndex(event => event.type === 'ENTRY');
  if (entryIndex < 0) return null;
  return events.slice(entryIndex + 1).find(event => event.type === 'TP1' || event.type === 'STOP')?.type || null;
}

function cohort(signals) {
  const entered = signals.filter(signal => signal.events?.some(event => event.type === 'ENTRY'));
  const enteredIds = new Set(entered.map(signal => signal.id));
  const resolved = entered.filter(signal => firstOutcome(signal));
  const won = resolved.filter(signal => firstOutcome(signal) === 'TP1');
  return { candidates: signals.length, entered: entered.length, resolved: resolved.length,
    tp1First: won.length, stoppedFirst: resolved.length - won.length,
    expiredWithoutEntry: signals.filter(signal => !enteredIds.has(signal.id) && signal.state === 'EXPIRED').length,
    uncertain: signals.filter(signal => signal.state === 'UNCERTAIN').length,
    entryRate: signals.length ? entered.length / signals.length : null,
    tp1Rate: resolved.length ? won.length / resolved.length : null };
}

export function buildResearchLab(signals, candleCoverage = [], now = Date.now()) {
  const current = signals.filter(signal => signal.market === 'futures' &&
    signal.strategyVersion === 4 && ['smc', 'breakout'].includes(signal.strategyKey));
  const byStrategy = Object.fromEntries(['smc', 'breakout'].map(key =>
    [key, cohort(current.filter(signal => signal.strategyKey === key))]));
  const assessed = current.filter(signal => signal.researchV5?.policy === SHADOW_POLICY.version);
  const shadow = Object.fromEntries(['PASS', 'REJECT', 'COLLECT'].map(verdict =>
    [verdict, cohort(assessed.filter(signal => signal.researchV5.verdict === verdict))]));
  const latest = [...current].sort((a, b) => b.detectedAt - a.detectedAt).slice(0, 80)
    .map(signal => ({ id: signal.id, symbol: signal.symbol, timeframe: signal.timeframe,
      strategy: signal.strategyKey, side: signal.side, state: signal.state,
      detectedAt: signal.detectedAt, entry: signal.entry, stop: signal.stop,
      tp1: signal.targets?.[0] ?? null, entered: Boolean(signal.events?.some(e => e.type === 'ENTRY')),
      outcome: firstOutcome(signal), shadow: signal.researchV5 || null }));
  return { version: 5, mode: 'shadow', generatedAt: now, policy: SHADOW_POLICY,
    total: cohort(current), byStrategy, shadow, assessed: assessed.length,
    legacy: signals.length - current.length, coverage: candleCoverage, latest,
    note: 'Теневой фильтр пока не меняет опубликованные сигналы. TP1 и стоп означают касание цены, а не исполнение ордера.' };
}
