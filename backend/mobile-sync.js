import { TIMEFRAMES } from './strategy.js';
import { RULE_KEYS } from './strategy-rules.js';

const states = new Set(['WAITING', 'OPEN', 'STOPPED', 'COMPLETED', 'CANCELLED', 'EXPIRED', 'UNCERTAIN']);
const eventTypes = new Set(['CREATED', 'ENTRY', 'TP1', 'TP2', 'TP3', 'STOP', 'INVALIDATED', 'EXPIRED', 'DATA_GAP', 'ACKNOWLEDGED']);
const positive = value => Number.isFinite(value) && value > 0;
const timestamp = value => Number.isSafeInteger(value) && value > 0;
const validDepthEvidence = s => {
  const rule=s?.ruleVersion||'';
  if(!/-D[12]$|-B5$/.test(rule))return true;
  const b=s.bookEvidence;
  const base=b?.market===s.market&&b.symbol===s.symbol&&b.levels===100&&
    Number.isSafeInteger(b.lastUpdateId)&&b.lastUpdateId>0&&
    timestamp(b.capturedAt)&&b.capturedAt>=s.detectedAt-120000&&
    b.capturedAt<=s.detectedAt&&Number.isFinite(b.bidUsdt)&&b.bidUsdt>0&&
    Number.isFinite(b.askUsdt)&&b.askUsdt>0&&
    Number.isFinite(b.imbalance)&&b.imbalance>=0&&b.imbalance<=1&&
    Number.isFinite(b.spreadPct)&&b.spreadPct>=0&&b.spreadPct<=0.2;
  if(!base)return false;
  const share=s.side==='LONG'?b.imbalance:1-b.imbalance;
  if(rule.endsWith('-D1'))
    return b.source==='binance_rest_depth'&&share>=.55;
  const average=s.side==='LONG'?b.averageImbalance:1-b.averageImbalance;
  const continuous=b.source==='binance_ws_depth'&&b.status==='live'&&
    Number.isFinite(b.observationMs)&&Number.isInteger(b.observations)&&
    Number.isInteger(b.updates)&&b.updates>=5&&
    Number.isFinite(average)&&share>=.55&&average>=.53;
  if(!continuous)return false;
  if(rule.endsWith('-B5'))
    return timestamp(s.originClosedAt)&&s.originClosedAt<s.detectedAt&&
      s.detectedAt-s.originClosedAt<=26*60000&&
      timestamp(b.observedSince)&&b.observedSince>s.originClosedAt&&
      b.observationMs>=240000&&b.observations>=12&&
      b.capturedAt-b.observedSince>=240000&&
      s.detectedAt-b.capturedAt<=15000;
  return b.observationMs>=10000&&b.observations>=4;
};

export function validateMobileBatch(rows) {
  if (!Array.isArray(rows) || rows.length > 50) throw new Error('Ожидается до 50 сигналов');
  const ids = new Set();
  for (const signal of rows) {
    if (!signal || typeof signal !== 'object' || Array.isArray(signal) ||
        !['spot', 'futures'].includes(signal.market) ||
        typeof signal.symbol !== 'string' || !/^[A-Z0-9]{2,16}USDT$/.test(signal.symbol) ||
        !Object.hasOwn(TIMEFRAMES, signal.timeframe) ||
        !['LONG', 'SHORT'].includes(signal.side) || (signal.market === 'spot' && signal.side !== 'LONG') ||
        typeof signal.id !== 'string' || signal.id.length > 160 ||
        !signal.id.startsWith(`${signal.market}:${signal.symbol}:${signal.timeframe}:`) || ids.has(signal.id) ||
        (signal.ruleVersion != null && (!RULE_KEYS.includes(signal.ruleVersion) ||
          signal.strategyVersion !== 3 || !signal.id.endsWith(':'+signal.ruleVersion) ||
          typeof signal.ruleSpec !== 'string' || signal.ruleSpec.length < 10 ||
          signal.ruleSpec.length > 256)) ||
        (signal.volumeRatio != null && (!Number.isFinite(signal.volumeRatio) || signal.volumeRatio < 0)) ||
        !validDepthEvidence(signal) ||
        !states.has(signal.state) || !timestamp(signal.detectedAt) || !timestamp(signal.blockTime) ||
        !timestamp(signal.expiresAt) || !Number.isInteger(signal.hitTargets) || signal.hitTargets < 0 || signal.hitTargets > 3 ||
        ![signal.entryLow, signal.entryHigh, signal.entry, signal.stop, signal.swing].every(positive) ||
        signal.entryLow > signal.entryHigh || !Array.isArray(signal.targets) || signal.targets.length !== 3 ||
        !signal.targets.every(positive) || !signal.imbalance || !positive(signal.imbalance.low) ||
        !positive(signal.imbalance.high) || !timestamp(signal.imbalance.time) ||
        !['up', 'down'].includes(signal.imbalance.direction) ||
        !Array.isArray(signal.features) || signal.features.length !== 8 || !signal.features.every(Number.isFinite) ||
        !Array.isArray(signal.events) || signal.events.length < 1 || signal.events.length > 64 ||
        signal.events.some(event => !eventTypes.has(event?.type) || !timestamp(event.at) || !Number.isFinite(event.price) || event.price < 0) ||
        (signal.quality != null && (!Number.isFinite(signal.quality.probability) ||
          !Number.isFinite(signal.quality.baseline) || signal.quality.probability < 0 || signal.quality.probability > 1 ||
          signal.quality.baseline < 0 || signal.quality.baseline > 1))) {
      throw new Error('Некорректная запись сигнала');
    }
    ids.add(signal.id);
  }
  return rows;
}

