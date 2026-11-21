import { detectV3, previousAtr, ContextRegimeFilter, MarketStructureEngine, TF_MINUTES } from './smc-v3.js';

export const STRATEGIES = Object.freeze([
  Object.freeze({ key: 'smc', title: 'SMC · структура, OB и FVG', entryMode: 'LIMIT' }),
  Object.freeze({ key: 'breakout', title: 'Импульс и пробой', entryMode: 'NEXT_M1_OPEN' })
]);

const parentFor = { '5m': '1h', '15m': '1h', '30m': '1h', '1h': '4h', '4h': '1d' };
const valid = c => c && [c.time,c.end,c.open,c.high,c.low,c.close,c.volume].every(Number.isFinite) &&
  c.high >= Math.max(c.open,c.close,c.low) && c.low <= Math.min(c.open,c.close,c.high) && c.volume >= 0;

export function detectBreakout(bars, market, symbol, timeframe, parentBars) {
  if (market !== 'futures' || !parentFor[timeframe] || !Array.isArray(bars) || bars.length < 35 ||
      bars.some((bar,i) => !valid(bar) || i > 0 && bar.time <= bars[i-1].time)) return null;
  const index = bars.length - 1, bar = bars[index], previous = bars.slice(index - 20, index);
  const atr = previousAtr(bars,index);
  if (!(atr > 0)) return null;
  const high = Math.max(...previous.map(c => c.high));
  const low = Math.min(...previous.map(c => c.low));
  const up = bar.close > high && bars[index-1].close <= high;
  const down = bar.close < low && bars[index-1].close >= low;
  if (up === down) return null;
  const side = up ? 'LONG' : 'SHORT';
  const range = bar.high - bar.low;
  const body = Math.abs(bar.close - bar.open);
  const meanVolume = previous.reduce((sum,c) => sum + c.volume,0)/20;
  const volumeRatio = meanVolume > 0 ? bar.volume/meanVolume : 0;
  const closeLocation = range > 0 ? (bar.close-bar.low)/range : 0.5;
  if (body < 1.2*atr || volumeRatio < 1.5 ||
      (up && (bar.close <= bar.open || closeLocation < 0.75)) ||
      (down && (bar.close >= bar.open || closeLocation > 0.25))) return null;
  const parent = (parentBars || []).filter(c => c.end <= bar.end);
  const parentMinutes = TF_MINUTES[parentFor[timeframe]];
  if (parent.length < 16 || bar.end-parent.at(-1).end > 2*parentMinutes*60000) return null;
  const regime = MarketStructureEngine.analyze(parent).regime;
  if (regime !== (up ? 'up' : 'down')) return null;
  const direction = up ? 1 : -1, entry = bar.close, stop = entry-direction*atr;
  const level = up ? high : low;
  return {
    id: `${market}:${symbol}:${timeframe}:${bar.time}:${side}:breakout`,
    market,symbol,timeframe,side,strategyVersion:4,strategyKey:'breakout',ruleVersion:'breakout',
    ruleSpec:'CHANNEL20|BODY_ATR1.2|VOLUME1.5|CLOSE_QUARTILE|HTF_MATCH|NEXT_M1_OPEN',
    entryMode:'NEXT_M1_OPEN',entryAtr:atr,
    detectedAt:bar.end,originClosedAt:bar.end,blockTime:bar.time,
    entryLow:entry-0.25*atr,entryHigh:entry+0.25*atr,entry,stop,
    targets:[1,2,3].map(n => entry+direction*n*atr),swing:level,
    imbalance:{time:bar.time,direction:up?'up':'down',low:Math.min(level,entry),high:Math.max(level,entry),status:'breakout',kind:'BREAKOUT'},
    volumeRatio,breakType:'BREAKOUT',
    features:[1,Math.min(3,body/atr),Math.min(3,Math.abs(entry-level)/atr),Math.min(3,volumeRatio),
      closeLocation,Math.min(3,100*atr/entry),down?1:0,Math.log(TF_MINUTES[timeframe]/5)/Math.log(48)],
    state:'WAITING',hitTargets:0,events:[{type:'CREATED',at:bar.end,price:bar.close}],
    expiresAt:bar.end+60000
  };
}

export function detectStrategies(bars, market, symbol, timeframe, parentBars) {
  if (market !== 'futures') return [];
  const smc = detectV3(bars,market,symbol,timeframe,parentBars);
  const breakout = detectBreakout(bars,market,symbol,timeframe,parentBars);
  return [smc && {
    ...smc,id:smc.id+':smc',strategyVersion:4,strategyKey:'smc',ruleVersion:'smc',
    ruleSpec:'BOS_CHOCH|OB_ACTIVE|FVG_ACTIVE|HTF_MATCH|LIMIT_OB_MID|M1',entryMode:'LIMIT'
  },breakout].filter(Boolean);
}
