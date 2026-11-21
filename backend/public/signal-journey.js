// Projection of recorded signal events for Android-compatible UI. Never estimates fills.
export const finishedStates = new Set(['STOPPED', 'COMPLETED', 'CANCELLED', 'EXPIRED']);
export const isFinished = signal => finishedStates.has(typeof signal === 'string' ? signal : signal.state);
export const bucket = signal => {
  const state = typeof signal === 'string' ? signal : signal.state;
  if (state === 'WAITING') return 'waiting';
  if (state === 'OPEN' || state === 'UNCERTAIN') return 'active';
  return 'finished';
};
const terminalEventType = { STOPPED: 'STOP', COMPLETED: 'TP3', CANCELLED: 'INVALIDATED', EXPIRED: 'EXPIRED' };
export function journey(signal) {
  const events = Array.isArray(signal.events) ? [...signal.events].sort((a,b)=>a.at-b.at) : [];
  const created = events.find(e=>e.type==='CREATED');
  const entry = events.find(e=>e.type==='ENTRY') || null;
  const exit = isFinished(signal) ? [...events].reverse().find(e=>e.type===terminalEventType[signal.state]) || null : null;
  const canCalculate = entry && exit && ['COMPLETED','STOPPED'].includes(signal.state) &&
    Number.isFinite(entry.price) && entry.price>0 && Number.isFinite(exit.price);
  const percent = canCalculate ? ((exit.price-entry.price) / entry.price) *
    (signal.side==='LONG'?1:-1)*100 : null;
  const reached = Math.max(Number(signal.hitTargets)||0,
    ...events.filter(e=>/^TP[123]$/.test(e.type)).map(e=>Number(e.type.slice(2))),0);
  const result = signal.state==='UNCERTAIN' ? 'Исход не определён: требуется проверка'
    : !isFinished(signal) ? (entry ? 'Движение продолжается' : 'Ожидает входа')
    : !entry ? 'Завершён без входа'
    : signal.state==='COMPLETED' ? 'Достигнут TP3'
    : signal.state==='STOPPED' ? 'Стоп после входа' : 'Завершён';
  return { createdAt:signal.detectedAt, createdPrice:created?.price ?? null, entry, exit,
    reached, percent, result, finished:isFinished(signal), events };
}

/**
 * Plot each reference level from signal creation up to its last recorded touch.
 * Untouched levels are projected only through the latest known closed candle;
 * closed/uncertain signals never extend beyond their terminal observation.
 * Price-level segments do not imply exchange order execution.
 */
export function levelSegments(signal, latestCandleEnd) {
  const events = [...(signal.events || [])].sort((a, b) => a.at - b.at);
  const terminalType = { STOPPED: 'STOP', COMPLETED: 'TP3', CANCELLED: 'INVALIDATED',
    EXPIRED: 'EXPIRED', UNCERTAIN: 'DATA_GAP' }[signal.state];
  const terminal = terminalType
    ? [...events].reverse().find(e => e.type === terminalType) ||
      events.at(-1)
    : null;
  const start = Number(signal.detectedAt);
  const end = Math.max(start, Number(terminal?.at ?? latestCandleEnd ?? start));
  const levels = [['ENTRY', signal.entry], ['SL', signal.stop],
    ...(signal.targets || []).slice(0, 3).map((price, i) => [`TP${i + 1}`, price])];
  return levels.map(([name, price]) => {
    const event = [...events].reverse().find(e => e.type === (name === 'SL' ? 'STOP' : name));
    return { name, price, startAt: start, endAt: Math.max(start, Math.min(end, Number(event?.at ?? end))),
      touched: Boolean(event) };
  });
}
