import { createHash } from 'node:crypto';

export const LOCAL_AI_POLICY = 'local-ai-shadow-v1';
const PROVIDERS = Object.freeze({
  ollama: { base: 'http://127.0.0.1:11434', list: '/api/tags', generate: '/api/generate' },
  lmstudio: { base: 'http://127.0.0.1:1234', list: '/v1/models', generate: '/v1/chat/completions' }
});
const RESPONSE_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    verdict: { type: 'string', enum: ['PASS', 'REJECT', 'UNSURE'] },
    reason: { type: 'string', maxLength: 180 }
  }, required: ['verdict', 'reason']
};
const SYSTEM = `You assess one USDT-M futures signal from a frozen snapshot of CLOSED candles.
Use only the supplied numbers. Never infer later candles, news, order fills or guaranteed profit.
PASS means the setup looks coherent; REJECT means a concrete contradiction; UNSURE means evidence is weak.
Return JSON with verdict PASS, REJECT or UNSURE and one complete Russian sentence under 120 characters. No probability.`;

export function validLocalAiConfig(config) {
  return config && typeof config.enabled === 'boolean' &&
    Object.hasOwn(PROVIDERS, config.provider) &&
    typeof config.model === 'string' && config.model.length <= 120 &&
    (config.enabled ? /^[a-zA-Z0-9_.:/-]{1,120}$/.test(config.model) &&
      !config.model.includes('://') && !config.model.startsWith('/') : true);
}

export async function listLocalModels(provider, fetchImpl = fetch) {
  if (!Object.hasOwn(PROVIDERS, provider)) throw new Error('Неизвестный локальный провайдер');
  const settings = PROVIDERS[provider];
  const response = await fetchImpl(settings.base + settings.list,
    { signal: AbortSignal.timeout(3000) });
  if (!response.ok) throw new Error(`Локальный API: HTTP ${response.status}`);
  const payload = await response.json();
  const models = provider === 'ollama' ? payload.models?.map(row => row.name) :
    payload.data?.map(row => row.id);
  if (!Array.isArray(models)) throw new Error('Неверный список локальных моделей');
  return [...new Set(models.filter(name => typeof name === 'string' &&
    /^[a-zA-Z0-9_.:/-]{1,120}$/.test(name) && !name.includes('://') &&
    !name.startsWith('/')))];
}

export async function listLoadedOllamaModels(fetchImpl = fetch) {
  const response = await fetchImpl(PROVIDERS.ollama.base + '/api/ps',
    { signal: AbortSignal.timeout(3000) });
  if (!response.ok) throw new Error(`Ollama: HTTP ${response.status}`);
  const payload = await response.json();
  return Array.isArray(payload.models) ? payload.models.map(row => row.name)
    .filter(name => typeof name === 'string') : [];
}

export async function preloadLocalModel(config, fetchImpl = fetch) {
  if (!validLocalAiConfig(config) || !config.enabled)
    throw new Error('Некорректная настройка локальной модели');
  const settings = PROVIDERS[config.provider];
  const body = config.provider === 'ollama' ? {
    model: config.model, prompt: '', stream: false, keep_alive: -1,
    options: { num_ctx: 4096 }
  } : {
    model: config.model, messages: [{ role: 'user', content: 'OK' }],
    stream: false, temperature: 0, max_tokens: 1, ttl: 86400
  };
  const response = await fetchImpl(settings.base + settings.generate, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(90000)
  });
  if (!response.ok) throw new Error(`Не удалось загрузить модель: HTTP ${response.status}`);
  return { provider: config.provider, model: config.model, warmedAt: Date.now() };
}

const closedBar = bar => [bar.time, bar.open, bar.high, bar.low, bar.close,
  bar.volume].every(Number.isFinite) && Number.isFinite(bar.end) &&
  bar.high >= Math.max(bar.open, bar.close, bar.low) &&
  bar.low <= Math.min(bar.open, bar.close, bar.high);

export function freezeLocalAiInput(signal, bars, parentBars) {
  if (signal.market !== 'futures' || signal.strategyVersion !== 4 ||
      !['smc', 'breakout'].includes(signal.strategyKey) ||
      !Number.isFinite(signal.detectedAt) || !Array.isArray(bars) ||
      !Array.isArray(parentBars)) throw new Error('Неверный кандидат для локального ИИ');
  const working = bars.slice(-20), parent = parentBars.slice(-12);
  if (working.length < 20 || parent.length < 12 ||
      [...working, ...parent].some(bar => !closedBar(bar) || bar.end > signal.detectedAt) ||
      working.at(-1).end !== signal.detectedAt)
    throw new Error('ИИ получает только закрытый и полный снимок рынка');
  const fields = rows => rows.map(bar => [bar.time, bar.open, bar.high, bar.low,
    bar.close, bar.volume]);
  const input = {
    policy: LOCAL_AI_POLICY, detectedAt: signal.detectedAt,
    symbol: signal.symbol, timeframe: signal.timeframe,
    strategy: signal.strategyKey, side: signal.side,
    entryMode: signal.entryMode, entry: signal.entry, stop: signal.stop,
    targets: signal.targets?.slice(0, 3),
    features: signal.features,
    workingClosedBars: fields(working), parentClosedBars: fields(parent)
  };
  if (![input.entry, input.stop, ...(input.targets || [])].every(Number.isFinite) ||
      input.targets?.length !== 3) throw new Error('Неполные уровни кандидата');
  const prompt = JSON.stringify(input);
  return { prompt, hash: createHash('sha256').update(prompt).digest('hex') };
}

export async function reviewLocalCandidate(config, frozen, fetchImpl = fetch) {
  if (!validLocalAiConfig(config) || !config.enabled ||
      !/^[a-f0-9]{64}$/.test(frozen?.hash) || typeof frozen.prompt !== 'string')
    throw new Error('Некорректная настройка локального ИИ');
  const settings = PROVIDERS[config.provider];
  const body = config.provider === 'ollama' ? {
    model: config.model, system: SYSTEM, prompt: frozen.prompt,
    stream: false, think: false, format: RESPONSE_SCHEMA,
    options: { temperature: 0, num_predict: 256, num_ctx: 4096 }, keep_alive: -1
  } : {
    model: config.model, messages: [{ role: 'system', content: SYSTEM },
      { role: 'user', content: frozen.prompt }], stream: false,
    temperature: 0, max_tokens: 256, ttl: 86400,
    response_format: { type: 'json_schema', json_schema: {
      name: 'orbit_signal_review', strict: true, schema: RESPONSE_SCHEMA } }
  };
  const response = await fetchImpl(settings.base + settings.generate, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(45000)
  });
  if (!response.ok) throw new Error(`Локальная модель: HTTP ${response.status}`);
  const payload = await response.json();
  const raw = config.provider === 'ollama' ? payload.response :
    payload.choices?.[0]?.message?.content;
  if (typeof raw !== 'string' || raw.length > 2000)
    throw new Error('Локальная модель вернула неверный ответ');
  let parsed;
  try { parsed = JSON.parse(raw); }
  catch { throw new Error('Локальная модель вернула не JSON'); }
  if (!['PASS', 'REJECT', 'UNSURE'].includes(parsed?.verdict) ||
      typeof parsed.reason !== 'string' || !parsed.reason.trim() ||
      parsed.reason.length > 180)
    throw new Error('Локальная модель вернула неверную оценку');
  return { verdict: parsed.verdict, reason: parsed.reason.trim(),
    completedAt: Date.now(), inputHash: frozen.hash };
}
