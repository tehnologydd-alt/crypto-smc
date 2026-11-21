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
