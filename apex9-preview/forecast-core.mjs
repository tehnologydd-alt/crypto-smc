/**
 * APEX Forecast Foundation: forward-only research experiment, not a trading signal.
 *
 * Baseline V1: the NEXT 4 completed H1 closes are not predicted individually.
 * We hypothesize only that the last close at the horizon remains inside an
 * empirical absolute-return envelope measured from PREVIOUS completed bars.
 * Percentile describes historic sample geometry, NOT calibrated confidence.
 */
import {CANDLE_INTERVALS} from './candles.mjs';
import {inspectClosedCandles} from './market-core.mjs';

export const RESEARCH_METHOD='EMPIRICAL_CLOSE_RANGE_V1';
export const RESEARCH_INTERVAL='1h';
export const RESEARCH_HORIZON_BARS=4;
export const RESEARCH_SAMPLE_BARS=96;
const positive=x=>typeof x==='number'&&Number.isFinite(x)&&x>0;
const symbolOK=x=>typeof x==='string'&&/^[A-Z0-9]{5,20}$/.test(x);
const round=x=>Number(x.toPrecision(13));
function percentileNearest(values,percentile){
 const ordered=[...values].sort((a,b)=>a-b);
 return ordered[Math.min(ordered.length-1,Math.max(0,Math.ceil(ordered.length*percentile)-1))];
}
export function buildResearchHypothesis(asset,interval,candles,{now=Date.now()}={}){
 if(!symbolOK(asset)||interval!==RESEARCH_INTERVAL||
    !Number.isSafeInteger(now)||now<1)
  return {state:'INVALID',error:'Некорректный актив, интервал или время'};
 const parsed=inspectClosedCandles(candles,interval);
 if(parsed.state!=='OK')
  return {state:'INVALID',error:'Нет достоверной хронологической истории закрытых свечей'};
 const bars=parsed.bars;
 if(bars.length<RESEARCH_SAMPLE_BARS)
  return {state:'INSUFFICIENT',error:'Нужно не менее 96 завершённых часовых свечей'};
 const window=bars.slice(-RESEARCH_SAMPLE_BARS);
 const step=CANDLE_INTERVALS[interval];
 for(let i=1;i<window.length;i++){
  if(window[i].t-window[i-1].t!==step)
   return {state:'GAP',error:'В исходной истории есть пропуски часовых свечей'};
 }
 const last=window.at(-1);
 if(last.closeAt>=now||now-last.closeAt>step+90000)
  return {state:'STALE',error:'Последняя закрытая свеча неактуальна'};
 const movement=[];
 for(let i=RESEARCH_HORIZON_BARS;i<window.length;i++){
  movement.push(Math.abs(Math.log(window[i].close/window[i-RESEARCH_HORIZON_BARS].close)));
 }
 const width=percentileNearest(movement,.8);
 if(!positive(width)||!Number.isFinite(width))
  return {state:'INSUFFICIENT',error:'Историческая амплитуда не определена'};
 const bandLow=round(last.close*Math.exp(-width));
 const bandHigh=round(last.close*Math.exp(width));
 if(!positive(bandLow)||!positive(bandHigh)||bandLow>=bandHigh)
  return {state:'INVALID',error:'Не удалось построить проверяемый диапазон'};
 const forecast={
  id:'range1:'+asset+':'+interval+':'+last.closeAt,
  asset,interval,method:RESEARCH_METHOD,
  publishedAt:now,anchorCloseAt:last.closeAt,
  targetCloseAt:last.closeAt+RESEARCH_HORIZON_BARS*step,
  horizonBars:RESEARCH_HORIZON_BARS,anchorClose:round(last.close),
  bandLow,bandHigh,
  sampleBars:RESEARCH_SAMPLE_BARS,empiricalSamples:movement.length,
  historicalPercentile:.8,
  source:'Binance Spot /api/v3/klines',
  assertion:'Закрытие через 4 H1-свечи находится внутри эмпирического диапазона',
  calibratedProbability:null
 };
 return {state:'READY',forecast};
}

/** Evaluate only once the exact FOUR post-anchor CLOSED bars are observable.
 * No guess of an outcome from elapsed time alone.
 */
export function evaluateResearchHypothesis(forecast,candles,{now=Date.now()}={}){
 if(!forecast||forecast.method!==RESEARCH_METHOD||
  forecast.interval!==RESEARCH_INTERVAL||!positive(forecast.anchorClose)||
  !positive(forecast.bandLow)||!positive(forecast.bandHigh)||
  forecast.bandLow>=forecast.bandHigh||
  !Number.isSafeInteger(forecast.anchorCloseAt)||
  !Number.isSafeInteger(forecast.targetCloseAt)||
  !Number.isSafeInteger(forecast.publishedAt)||
  forecast.publishedAt<forecast.anchorCloseAt||
  forecast.targetCloseAt!==forecast.anchorCloseAt+4*CANDLE_INTERVALS['1h'])
  return {state:'INVALID'};
 if(!Number.isSafeInteger(now)||now<forecast.targetCloseAt)
  return {state:'NOT_DUE'};
 const parsed=inspectClosedCandles(candles,'1h');
 if(parsed.state!=='OK')return {state:'NEEDS_DATA',reason:'No coherent closed OHLCV history'};
 const step=CANDLE_INTERVALS['1h'];
 const byCloseTime=new Map(parsed.bars.map(x=>[x.closeAt,x]));
 for(let i=1;i<=4;i++){
  if(!byCloseTime.has(forecast.anchorCloseAt+i*step))
   return {state:'NEEDS_DATA',reason:'Missing one or more completed horizon candles'};
 }
 const final=byCloseTime.get(forecast.targetCloseAt);
 if(!final||final.closeAt>=now)
  return {state:'NOT_DUE'};
 const matched=final.close>=forecast.bandLow&&final.close<=forecast.bandHigh;
 return {state:'EVALUATED',outcome:matched?'WITHIN_RANGE':'OUTSIDE_RANGE',
  targetCloseAt:forecast.targetCloseAt,
  actualClose:round(final.close),
  actualChangePct:round((final.close/forecast.anchorClose-1)*100),
  evaluatedAt:now,source:'Binance Spot closed H1 candle',
  note:'Historical measured outcome, no profit/loss or trading action'};
}
