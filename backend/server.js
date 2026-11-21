import http from 'node:http';
import https from 'node:https';
import { readFileSync } from 'node:fs';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { join, resolve, extname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DEFAULT_SYMBOLS, MARKETS, TIMEFRAMES, parseKlines, detectResearchSignals, advanceSignalWithCandle } from './strategy.js';
import { scoreSignal, modelSummary } from './learning.js';
import { parseBookSnapshot } from './order-book.js';
import { loadVapidKeys, sendPush } from './push.js';
import { analyzeStructure } from './strategy.js';
import { normalizePreferences, shouldNotify } from './notifications.js';
import { openExperienceStore } from './experience.js';
import { LargeTradeTracker } from './whales.js';
import { RateBudget, usagePlan } from './limits.js';
import { validateMobileBatch } from './mobile-sync.js';

const base = resolve(import.meta.dirname);
const dataDir = resolve(process.env.DATA_DIR || join(base, 'data'));
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '127.0.0.1';
const token = process.env.APP_TOKEN || '';
const vapidSubject = process.env.VAPID_SUBJECT || '';
const tlsPfxPath = process.env.TLS_PFX_PATH || '';
const tlsPfxPassword = process.env.TLS_PFX_PASSWORD || '';
const lanOnly = process.env.LAN_ONLY === '1';
if (!['127.0.0.1', 'localhost', '::1'].includes(host) && token.length < 24) throw new Error('Set APP_TOKEN (at least 24 characters) before exposing the server');
if (lanOnly && (!tlsPfxPath || !tlsPfxPassword)) throw new Error('LAN_ONLY requires a TLS certificate');
await mkdir(dataDir, { recursive: true });
const dataPath = join(dataDir, 'state.json');
let stored = {};
try { stored = JSON.parse(await readFile(dataPath, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const rateBudget = new RateBudget(stored.rateBudget);
const experience = openExperienceStore(join(dataDir, 'experience.sqlite'), stored);
const state = {
  symbols: Array.isArray(stored.symbols) ? stored.symbols : DEFAULT_SYMBOLS,
  signals: experience.loadSignals(),
  subscriptions: Array.isArray(stored.subscriptions) ? stored.subscriptions : [],
  lastCandle: stored.lastCandle || {},
  model: experience.model,
  prices: {}, feeds: { spot: 'connecting', futures: 'connecting' },
  errors: {}, updatedAt: Date.now()
};
const vapid = loadVapidKeys(join(dataDir, 'vapid.json'));
const sockets = new Map();
const reconnectTimers = new Map();
const generations = { spot: 0, futures: 0 };
const lastWsCandle = { spot: 0, futures: 0 };
const largeTrades = new LargeTradeTracker();
const largeTradeSockets = new Map();
const largeTradeTimers = new Map();
const largeTradeGenerations = { spot: 0, futures: 0 };
const largeTradeFeeds = { spot: 'connecting', futures: 'connecting' };
let saveTimer;

function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      const path = `${dataPath}.${randomUUID()}.tmp`;
      await writeFile(path, JSON.stringify({ symbols: state.symbols, signals: state.signals, subscriptions: state.subscriptions, lastCandle: state.lastCandle, model: state.model, rateBudget: rateBudget.exportState() }));
      await rename(path, dataPath);
    } catch (error) { console.error('Save failed:', error); }
  }, 250);
}
function label(signal, event) {
  const prefix = `${signal.market === 'spot' ? 'Спот' : 'Фьючерсы'} · ${signal.symbol} · ${signal.timeframe || '1h'} · ${signal.side} · ${signal.ruleVersion || 'SMC v3'}`;
  const names = { CREATED: 'Новый сигнал', ENTRY: 'Цена вошла в зону входа', TP1: 'Достигнут TP1', TP2: 'Достигнут TP2', TP3: 'Достигнут TP3', STOP: 'Достигнут стоп', INVALIDATED: 'Сигнал отменён', EXPIRED: 'Сигнал истёк', DATA_GAP: 'Пробел в данных' };
  const url = `/asset.html?symbol=${encodeURIComponent(signal.symbol)}&market=${encodeURIComponent(signal.market)}&interval=${encodeURIComponent(signal.timeframe || '1h')}&signal=${encodeURIComponent(signal.id)}`;
  return { title: `${prefix}: ${names[event.type] || event.type}`, body: `Цена: ${formatPrice(event.price)} USDT`, id: signal.id, url };
}
function formatPrice(n) { return Number(n).toLocaleString('en-US', { maximumFractionDigits: 8 }); }
async function notifyEvents(signal, previousLength) {
  if (!vapidSubject || !state.subscriptions.length) return;
  for (const event of signal.events.slice(previousLength)) {
    for (const subscription of [...state.subscriptions]) {
      if (!shouldNotify(subscription, signal, event)) continue;
      try { await sendPush(subscription, label(signal, event), vapid, vapidSubject); }
      catch (error) {
        if (/Push HTTP 40[4-9]|Push HTTP 410/.test(String(error))) {
          state.subscriptions = state.subscriptions.filter(s => s.endpoint !== subscription.endpoint); persist();
        }
        console.error('Push failed:', error.message);
      }
    }
  }
}
function key(market, symbol) { return `${market}:${symbol}`; }
function processCandle(market, symbol, candle, shouldScan = true) {
  if (!state.symbols.includes(symbol)) return;
  const pair = key(market, symbol);
  if (candle.end <= (state.lastCandle[pair] || 0) || ![candle.high, candle.low, candle.close].every(Number.isFinite)) return;
  state.prices[pair] = { price: candle.close, at: candle.end };
  state.lastCandle[pair] = candle.end;
  state.updatedAt = Date.now();
  for (const signal of state.signals) {
    const lastEventAt = signal.events?.at(-1)?.at || signal.detectedAt;
    if (signal.market !== market || signal.symbol !== symbol || candle.end <= Math.max(signal.detectedAt, signal.updatedAt || 0, lastEventAt)) continue;
    const before = signal.events.length;
    if (advanceSignalWithCandle(signal, candle)) {
      experience.recordOutcome(signal);
      experience.saveSignal(signal);
      persist(); void notifyEvents(signal, before);
    }
  }
  if (shouldScan && state.symbols.includes(symbol)) {
    for (const [timeframe, minutes] of Object.entries(TIMEFRAMES)) {
      if ((candle.end + 1) % (minutes * 60000) === 0) void scanSignal(market, symbol, timeframe, candle.end);
    }
  }
}
const endpoints = {
  spot: { rest: 'https://data-api.binance.vision/api/v3/klines', ticker: 'https://data-api.binance.vision/api/v3/ticker/24hr', ws: 'wss://stream.binance.com:9443/stream?streams=' },
  futures: { rest: 'https://fapi.binance.com/fapi/v1/klines', ticker: 'https://fapi.binance.com/fapi/v1/ticker/24hr', ws: 'wss://fstream.binance.com/market/stream?streams=' }
};
async function fetchKlines(market, symbol, interval, options = {}) {
  const u = new URL(endpoints[market].rest);
  u.searchParams.set('symbol', symbol); u.searchParams.set('interval', interval);
  u.searchParams.set('limit', String(options.limit || 100));
  if (options.startTime) u.searchParams.set('startTime', String(options.startTime));
  const limit = options.limit || 100;
  const weight = market === 'spot' ? 2 : limit < 100 ? 1 : limit < 500 ? 2 : limit <= 1000 ? 5 : 10;
  rateBudget.reserve(market, weight);
  const response = await fetch(u, { signal: AbortSignal.timeout(12000) });
  rateBudget.observe(market, response);
  if (!response.ok) throw new Error(`${market} ${symbol}: Binance HTTP ${response.status}`);
  return parseKlines(await response.json());
}
async function fetchTicker(market, symbol) {
  const u = new URL(endpoints[market].ticker);
  u.searchParams.set('symbol', symbol);
  rateBudget.reserve(market, market === 'spot' ? 2 : 1);
  const response = await fetch(u, { signal: AbortSignal.timeout(12000) });
  rateBudget.observe(market, response);
  if (!response.ok) throw new Error(`Binance 24h HTTP ${response.status}`);
  const raw = await response.json();
  return { changePercent: Number(raw.priceChangePercent), high: Number(raw.highPrice), low: Number(raw.lowPrice), volume: Number(raw.volume), quoteVolume: Number(raw.quoteVolume) };
}
// Fetch only on confirmed base signals; a time-bound snapshot is evidence,
// never an interpolation of historical book state.
const recentBooks=new Map();
async function fetchDepthSnapshot(market,symbol,closedAt) {
  const cacheKey=market+':'+symbol;
  const cached=recentBooks.get(cacheKey);
  if(cached && cached.capturedAt>=closedAt && Date.now()-cached.capturedAt<=10000)
    return cached;
  const base=market==='spot'?'https://data-api.binance.vision/api/v3/depth':
    'https://fapi.binance.com/fapi/v1/depth';
  const url=new URL(base);
  url.searchParams.set('symbol',symbol);
  url.searchParams.set('limit','100');
  rateBudget.reserve(market,5); // conservative weight for 100 displayed levels
  const response=await fetch(url,{signal:AbortSignal.timeout(12000)});
  rateBudget.observe(market,response);
  if(!response.ok) throw new Error('Binance depth '+response.status);
  const raw=await response.json();
  const snapshot=parseBookSnapshot(raw,{market,symbol,capturedAt:Date.now()});
  if(!snapshot)throw new Error('Invalid or insufficient Binance L2 depth');
  recentBooks.set(cacheKey,snapshot);
  return snapshot;
}
async function scanSignal(market, symbol, timeframe, expectedEnd, attempt = 0) {
  const errorKey = `${key(market, symbol)}:${timeframe}`;
  try {
    const candles = await fetchKlines(market, symbol, timeframe, { limit: 100 });
    if (candles.at(-1)?.end !== expectedEnd) {
      if (attempt < 2) { setTimeout(() => void scanSignal(market, symbol, timeframe, expectedEnd, attempt + 1), 3000); return; }
      throw new Error('Закрытая свеча ещё не доступна');
    }
    // Use an independently closed HTF snapshot; never use a forming HTF candle.
    const parentTf = { '5m':'1h', '15m':'1h', '30m':'1h', '1h':'4h', '4h':'1d' }[timeframe];
    // HTF outages must not block v0.1 and v0.2; only v0.3 requires HTF.
    let parentBars = [];
    try {
      parentBars = (await fetchKlines(market, symbol, parentTf, { limit: 120 }))
        .filter(bar => bar.end <= expectedEnd);
      delete state.errors[errorKey+':htf'];
    } catch (error) {
      state.errors[errorKey+':htf'] = 'Старший таймфрейм недоступен: '+error.message;
    }
    const base = detectResearchSignals(candles,market,symbol,timeframe,parentBars,null,Date.now());
    // No book requests when the structural strategy has no new candidate.
    if (!base.length) { delete state.errors[errorKey+':depth']; delete state.errors[errorKey]; return; }
    let bookSnapshot = null;
    // Historical backfill has no matching book snapshot; never substitute the current book.
    if(Date.now()-expectedEnd<=120000) {
      try {
        bookSnapshot=await fetchDepthSnapshot(market,symbol,expectedEnd);
        delete state.errors[errorKey+':depth'];
      } catch(error) {
        state.errors[errorKey+':depth']='Стакан: '+error.message;
      }
    } else state.errors[errorKey+':depth']='Нельзя подтвердить исторический стакан';
    const candidates=detectResearchSignals(candles,market,symbol,timeframe,parentBars,
      bookSnapshot,Date.now());
    for (const signal of candidates) {
      const activeVersion = state.signals.some(s => s.market === market &&
        s.symbol === symbol && (s.timeframe || '1h') === timeframe &&
        s.ruleVersion === signal.ruleVersion &&
        ['WAITING', 'OPEN', 'UNCERTAIN'].includes(s.state));
      if (activeVersion || state.signals.some(s => s.id === signal.id)) continue;
      signal.quality = scoreSignal(experience.ruleModels[signal.ruleVersion], signal.features);
      experience.saveSignal(signal);
      state.signals.unshift(signal);
      if (state.signals.length > 500) {
        const oldestClosed = state.signals.findLastIndex(s =>
          !['WAITING', 'OPEN', 'UNCERTAIN'].includes(s.state));
        if (oldestClosed >= 0) state.signals.splice(oldestClosed, 1);
      }
      persist(); void notifyEvents(signal, 0);
    }
    delete state.errors[errorKey];
  } catch (error) { state.errors[errorKey] = error.message; }
}
async function reconcileSymbol(market, symbol) {
  const pair = key(market, symbol);
  const last = state.lastCandle[pair] || 0;
  try {
    if (!last) {
      const candles = await fetchKlines(market, symbol, '1m', { limit: 2 });
      if (candles.length) processCandle(market, symbol, candles.at(-1), Date.now() - candles.at(-1).end < 120000);
      return;
    }
    if (Date.now() - last < 90000) return;
    if (Date.now() - last > 990 * 60000) {
      state.signals.filter(s => s.market === market && s.symbol === symbol).forEach(makeUncertain);
      const candles = await fetchKlines(market, symbol, '1m', { limit: 2 });
      if (candles.length) processCandle(market, symbol, candles.at(-1), Date.now() - candles.at(-1).end < 120000);
      persist(); return;
    }
    const candles = await fetchKlines(market, symbol, '1m', { startTime: last + 1, limit: Math.min(1000, Math.ceil((Date.now() - last) / 60000) + 2) });
    for (const candle of candles) processCandle(market, symbol, candle, Date.now() - candle.end < 120000);
    delete state.errors[pair];
  } catch (error) {
    state.errors[pair] = `Восстановление M1: ${error.message}`;
    state.signals.filter(s => s.market === market && s.symbol === symbol).forEach(makeUncertain);
    persist();
  }
}
function makeUncertain(signal) {
  if (!['WAITING', 'OPEN'].includes(signal.state)) return;
  signal.state = 'UNCERTAIN';
  signal.events.push({ type: 'DATA_GAP', at: Date.now(), price: state.prices[key(signal.market, signal.symbol)]?.price || 0 });
  experience.saveSignal(signal);
  void notifyEvents(signal, signal.events.length - 1);
}
async function connectMarket(market) {
  const generation = ++generations[market];
  clearTimeout(reconnectTimers.get(market));
  sockets.get(market)?.close();
  state.feeds[market] = 'connecting';
  const monitored = state.symbols;
  await Promise.allSettled(monitored.map(symbol => reconcileSymbol(market, symbol)));
  if (generations[market] !== generation) return;
  const symbols = monitored.map(s => `${s.toLowerCase()}@kline_1m`).join('/');
  const ws = new WebSocket(endpoints[market].ws + symbols);
  sockets.set(market, ws);
  const queues = new Map();
  ws.addEventListener('open', () => { if (sockets.get(market) === ws && generations[market] === generation) { state.feeds[market] = 'live'; lastWsCandle[market] = Date.now(); } });
  ws.addEventListener('message', event => {
    try {
      const k = JSON.parse(event.data).data?.k;
      if (!k?.x || !k.s) return;
      lastWsCandle[market] = Date.now();
      const candle = { time: Number(k.t), end: Number(k.T), open: Number(k.o), high: Number(k.h), low: Number(k.l), close: Number(k.c) };
      const previous = queues.get(k.s) || Promise.resolve();
      const next = previous.then(async () => {
        const last = state.lastCandle[key(market, k.s)] || 0;
        if (last && candle.end - last > 60000) await reconcileSymbol(market, k.s);
        processCandle(market, k.s, candle);
      }).catch(error => { state.errors[key(market, k.s)] = error.message; });
      queues.set(k.s, next);
    } catch (error) { console.error('Kline parse failed:', error.message); }
  });
  ws.addEventListener('error', () => { if (sockets.get(market) === ws) state.feeds[market] = 'offline'; });
  ws.addEventListener('close', () => {
    if (sockets.get(market) !== ws || generations[market] !== generation) return;
    state.feeds[market] = 'offline';
    reconnectTimers.set(market, setTimeout(() => void connectMarket(market), 5000));
  });
}

function connectLargeTrades(market) {
  const generation = ++largeTradeGenerations[market];
  clearTimeout(largeTradeTimers.get(market));
  largeTradeSockets.get(market)?.close();
  largeTradeFeeds[market] = 'connecting';
  const streams = state.symbols.map(symbol => `${symbol.toLowerCase()}@aggTrade`).join('/');
  const ws = new WebSocket(endpoints[market].ws + streams);
  largeTradeSockets.set(market, ws);
  ws.addEventListener('open', () => { if (largeTradeSockets.get(market) === ws) largeTradeFeeds[market] = 'live'; });
  ws.addEventListener('message', event => {
    try {
      const trade = JSON.parse(event.data).data;
      if (trade?.e === 'aggTrade' && state.symbols.includes(trade.s)) largeTrades.record(market, trade);
    } catch (error) { console.error('Large trade parse failed:', error.message); }
  });
  ws.addEventListener('error', () => { if (largeTradeSockets.get(market) === ws) largeTradeFeeds[market] = 'offline'; });
  ws.addEventListener('close', () => {
    if (largeTradeSockets.get(market) !== ws || largeTradeGenerations[market] !== generation) return;
    largeTradeFeeds[market] = 'offline';
    largeTradeTimers.set(market, setTimeout(() => connectLargeTrades(market), 5000));
  });
}

const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };
function json(res, code, body) { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); }
async function requestBody(req, maxBytes = 32000) {
  let raw = '';
  let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > maxBytes) throw new Error('Request too large');
    raw += chunk.toString('utf8');
  }
  return JSON.parse(raw || '{}');
}
function authorized(req) { return !token || req.headers.authorization === `Bearer ${token}`; }
function lanPeer(address) {
  const value = (address || '').replace(/^::ffff:/, '');
  const parts = value.split('.').map(Number);
  return value === '::1' || value === '127.0.0.1' ||
    (parts.length === 4 && parts.every(part => Number.isInteger(part) && part >= 0 && part <= 255) &&
      (parts[0] === 10 || parts[0] === 192 && parts[1] === 168 || parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31));
}
function mobileState() { return {
  serverId: experience.id,
  symbols: state.symbols, signals: state.signals, prices: state.prices,
  model: modelSummary(state.model),
  ruleModels: Object.fromEntries(Object.entries(experience.ruleModels).map(([key, model]) =>
    [key, modelSummary(model)])),
  ruleStatistics: experience.statistics().ruleComparisons,
  updatedAt: state.updatedAt,
  limits: { binance: rateBudget.snapshot(), plan: usagePlan(state.symbols.length) }
}; }
const handleRequest = async (req, res) => {
  try {
    if (lanOnly && !lanPeer(req.socket.remoteAddress)) return json(res, 403, { error: 'Доступ только из локальной сети' });
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (url.pathname.startsWith('/api/')) {
      if (!authorized(req)) return json(res, 401, { error: 'Неверный ключ доступа' });
      if (req.method === 'GET' && url.pathname === '/api/mobile/state') return json(res, 200, mobileState());
      if (req.method === 'GET' && url.pathname === '/api/limits') return json(res, 200, {
        binance: rateBudget.snapshot(), plan: usagePlan(state.symbols.length)
      });
      if (req.method === 'POST' && url.pathname === '/api/mobile/sync') {
        let rows, includeState;
        try {
          const body = await requestBody(req, 262144);
          rows = validateMobileBatch(body.signals || []);
          includeState = body.includeState !== false;
        }
        catch (error) { return json(res, 400, { error: error.message }); }
        let stored = 0, learned = 0;
        for (const signal of rows) {
          const result = experience.importSignal(signal);
          if (result.stored) stored++;
          if (result.learned) learned++;
        }
        state.signals = experience.loadSignals();
        state.updatedAt = Date.now();
        persist();
        const sync = { serverId: experience.id, accepted: rows.map(signal => signal.id), stored, learned,
          totalOutcomes: experience.summary().outcomes };
        return json(res, 200, includeState ? { ...mobileState(), sync } : { sync });
      }
      if (req.method === 'GET' && url.pathname === '/api/state') return json(res, 200, { symbols: state.symbols, signals: state.signals, prices: state.prices, feeds: state.feeds, errors: state.errors, updatedAt: state.updatedAt, model: modelSummary(state.model),
    ruleModels: Object.fromEntries(Object.entries(experience.ruleModels).map(([key, model]) =>
      [key, modelSummary(model)])),
    experience: experience.summary(), statistics: experience.statistics(), pushAvailable: Boolean(vapidSubject), vapidPublicKey: vapid.publicKey });
      if (req.method === 'GET' && url.pathname.startsWith('/api/large-trades/')) {
        const symbol = decodeURIComponent(url.pathname.slice('/api/large-trades/'.length)).toUpperCase();
        const market = url.searchParams.get('market') || 'spot';
        if (!state.symbols.includes(symbol) || !MARKETS.includes(market)) return json(res, 400, { error: 'Неверная пара или рынок' });
        return json(res, 200, { status: largeTradeFeeds[market], ...largeTrades.summary(market, symbol) });
      }
      if (req.method === 'GET' && url.pathname.startsWith('/api/asset/')) {
        const symbol = decodeURIComponent(url.pathname.slice('/api/asset/'.length)).toUpperCase();
        const market = url.searchParams.get('market') || 'spot';
        const interval = url.searchParams.get('interval') || '15m';
        if (!state.symbols.includes(symbol) || !MARKETS.includes(market) || !['1m', ...Object.keys(TIMEFRAMES)].includes(interval)) return json(res, 400, { error: 'Неверная пара, рынок или таймфрейм' });
        const rawStart = url.searchParams.get('startTime');
        const startTime = rawStart === null ? null : Number(rawStart);
        if (rawStart !== null && (!/^\d{12,13}$/.test(rawStart) ||
            !Number.isSafeInteger(startTime) || startTime <= 0 || startTime > Date.now()))
          return json(res, 400, { error: 'Неверное время начала исторического окна' });
        const options = { limit: 150 };
        if (startTime !== null) options.startTime = startTime;
        const [candlesResult, tickerResult] = await Promise.allSettled([fetchKlines(market, symbol, interval, options), fetchTicker(market, symbol)]);
        if (candlesResult.status === 'rejected') return json(res, 502, { error: candlesResult.reason.message });
        return json(res, 200, { symbol, market, interval, candles: candlesResult.value,
          structure: analyzeStructure(candlesResult.value),
          ticker: tickerResult.status === 'fulfilled' ? tickerResult.value : null,
          lastM1: state.prices[key(market, symbol)] || null,
          signals: state.signals.filter(s => s.market === market && s.symbol === symbol),
          warning: tickerResult.status === 'rejected' ? tickerResult.reason.message : null });
      }
      if (req.method === 'PUT' && url.pathname === '/api/symbols') {
        const body = await requestBody(req);
        const symbols = [...new Set((body.symbols || []).map(s => String(s).trim().toUpperCase()))];
        if (!symbols.length || symbols.length > 10 || symbols.some(s => !/^[A-Z0-9]{2,16}USDT$/.test(s))) return json(res, 400, { error: 'Укажите от 1 до 10 разных пар к USDT' });
        state.symbols = symbols; persist();
        for (const market of MARKETS) { void connectMarket(market); connectLargeTrades(market); }
        return json(res, 200, { symbols });
      }
      if (req.method === 'POST' && url.pathname === '/api/subscription') {
        if (!vapidSubject) return json(res, 400, { error: 'На сервере не задан VAPID_SUBJECT' });
        const sub = await requestBody(req);
        if (typeof sub.endpoint !== 'string' || !sub.keys?.p256dh || !sub.keys?.auth) return json(res, 400, { error: 'Неверная подписка' });
        state.subscriptions = state.subscriptions.filter(s => s.endpoint !== sub.endpoint);
        state.subscriptions.push({ endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth }, preferences: normalizePreferences(sub.preferences) });
        persist(); return json(res, 200, { ok: true });
      }
      if (req.method === 'PUT' && url.pathname === '/api/subscription/preferences') {
        const body = await requestBody(req);
        const subscription = state.subscriptions.find(s => s.endpoint === body.endpoint);
        if (!subscription) return json(res, 404, { error: 'Подписка не найдена. Включите уведомления заново.' });
        subscription.preferences = normalizePreferences(body.preferences);
        persist(); return json(res, 200, { preferences: subscription.preferences });
      }
      if (req.method === 'POST' && url.pathname.startsWith('/api/signals/') && url.pathname.endsWith('/archive')) {
        const id = decodeURIComponent(url.pathname.slice('/api/signals/'.length, -'/archive'.length));
        const signal = state.signals.find(s => s.id === id);
        if (!signal) return json(res, 404, { error: 'Сигнал не найден' });
        if (signal.state !== 'UNCERTAIN') return json(res, 400, { error: 'Архивировать можно только сигнал с пробелом в данных' });
        signal.state = 'CANCELLED'; signal.events.push({ type: 'ACKNOWLEDGED', at: Date.now(), price: state.prices[key(signal.market, signal.symbol)]?.price || 0 });
        experience.saveSignal(signal);
        persist(); return json(res, 200, { ok: true });
      }
      return json(res, 404, { error: 'Не найдено' });
    }
    if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
    const file = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
    if (!['index.html', 'app.js', 'wake.js', 'notification-settings.js', 'asset.html', 'asset.js', 'signal-journey.js', 'style.css', 'asset.css', 'sw.js', 'manifest.json', 'icon.svg', 'icon-192.png', 'icon-512.png'].includes(file)) return json(res, 404, { error: 'Не найдено' });
    const content = await readFile(join(base, 'public', file));
    res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream', 'Cache-Control': file === 'sw.js' ? 'no-cache' : 'max-age=60', 'X-Content-Type-Options': 'nosniff' });
    res.end(content);
  } catch (error) { json(res, 500, { error: error.message }); }
};
const server = tlsPfxPath ? https.createServer({ pfx: readFileSync(tlsPfxPath), passphrase: tlsPfxPassword }, handleRequest)
  : http.createServer(handleRequest);
server.listen(port, host, () => console.log(`Crypto Signals: ${tlsPfxPath ? 'https' : 'http'}://${host}:${port}`));
for (const market of MARKETS) { void connectMarket(market); connectLargeTrades(market); }
setInterval(persist, 30000);
setInterval(() => {
  for (const market of MARKETS) {
    if (state.feeds[market] === 'live' && Date.now() - lastWsCandle[market] > 150000) sockets.get(market)?.close();
    const monitored = state.symbols;
    for (const symbol of monitored) {
      if (Date.now() - (state.lastCandle[key(market, symbol)] || 0) > 90000) void reconcileSymbol(market, symbol);
    }
  }
}, 30000);

