// Chronological comparison of two fixed futures strategies.
// Input must contain real, complete CLOSED bars supplied by the researcher.
// No trade is executed and no synthetic outcome is inserted into the report.
import { readFileSync } from 'node:fs';
import { detectResearchSignals, advanceSignalWithCandle, TIMEFRAMES } from './strategy.js';
import { RULES } from './strategy-rules.js';
import { newModel, scoreSignal, learnFromOutcome } from './learning.js';

const validBar = c => c && [c.time,c.end,c.open,c.high,c.low,c.close,c.volume]
  .every(Number.isFinite) && c.end >= c.time && c.high >= Math.max(c.open,c.close,c.low) &&
  c.low <= Math.min(c.open,c.close,c.high) && c.volume >= 0;
function validate(input) {
  if (!input || input.market !== 'futures' ||
    !Object.hasOwn(TIMEFRAMES,input.timeframe) ||
    !/^[A-Z0-9]{2,16}USDT$/.test(input.symbol||'')) throw new Error('Invalid market, timeframe or symbol');
  for (const key of ['bars','parentBars','m1']) {
    const rows=input[key];
    if (!Array.isArray(rows) || rows.length<(key==='bars'?40:20) ||
      !rows.every(validBar) || rows.some((c,i)=>i>0 && c.time<=rows[i-1].time ||
      i>0 && rows[i-1].end>=c.time)) throw new Error('Input must contain sorted closed non-overlapping OHLCV: '+key);
  }
  const parentMinutes = {'5m':60,'15m':60,'30m':60,'1h':240,'4h':1440}[input.timeframe];
  for (const [key,minutes] of [['bars',TIMEFRAMES[input.timeframe]],['parentBars',parentMinutes],['m1',1]]) {
    const period = minutes*60000;
    if (input[key].some((bar,i)=>bar.end!==bar.time+period-1 ||
        i>0 && bar.time!==input[key][i-1].time+period))
      throw new Error(`${key} replay requires complete continuous closed candles`);
  }
  if (input.m1[0].end > input.bars[35].end || input.m1.at(-1).end < input.bars.at(-1).end)
    throw new Error('M1 history does not cover the strategy window');
  return input;
}
const groupFor=(index,total)=>index<Math.floor(total*0.6)?'development':
  index<Math.floor(total*0.8)?'validation':'holdout';

export function compareStrategies(input) {
  const {market,symbol,timeframe,bars,parentBars,m1}=validate(input);
  const models=Object.fromEntries(RULES.map(rule=>[rule.key,newModel()]));
  const signals=[];
  let minute=0;
  const trainEndsAt=bars[Math.floor(bars.length*.6)-1].end;
  function advanceThrough(end) {
    while(minute<m1.length && m1[minute].end<=end) {
      const candle=m1[minute++];
      for (const row of signals) {
        const signal=row.signal;
        if (candle.end<=signal.detectedAt ||
            !['WAITING','OPEN'].includes(signal.state)) continue;
        const changed=advanceSignalWithCandle(signal,candle);
        if (changed && row.group==='development' && candle.end<=trainEndsAt &&
            (signal.hitTargets>0 || signal.state==='STOPPED'))
          learnFromOutcome(models[signal.ruleVersion],signal);
      }
    }
  }
  for (let i=35;i<bars.length;i++) {
    const candle=bars[i];
    advanceThrough(candle.end);
    const possible=detectResearchSignals(bars.slice(0,i+1),market,symbol,timeframe,
      parentBars.filter(c=>c.end<=candle.end));
    for (const signal of possible) {
      if (signals.some(row=>row.signal.ruleVersion===signal.ruleVersion &&
          ['WAITING','OPEN','UNCERTAIN'].includes(row.signal.state))) continue;
      const model=models[signal.ruleVersion];
      signal.quality=scoreSignal(model,signal.features);
      signals.push({signal,group:groupFor(i,bars.length)});
    }
  }
  advanceThrough(m1.at(-1).end);
  const windows=['development','validation','holdout'];
  const versions=RULES.map(rule=>{
    const cohorts=Object.fromEntries(windows.map(window=>{
      const selected=signals.filter(row=>row.group===window && row.signal.ruleVersion===rule.key)
        .map(row=>row.signal);
      const entered=selected.filter(s=>s.events.some(e=>e.type==='ENTRY'));
      const resolved=entered.filter(s=>s.events.some(e=>e.type==='TP1'||e.type==='STOP'));
      const successes=resolved.filter(s=>s.events.some(e=>e.type==='TP1')).length;
      const scored=resolved.filter(s=>Number.isFinite(s.quality?.probability));
      const brier=key=>scored.length?scored.reduce((sum,s)=>{
        const label=s.events.some(e=>e.type==='TP1')?1:0;
        return sum+(s.quality[key]-label)**2;
      },0)/scored.length:null;
      return [window,{created:selected.length,entered:entered.length,resolved:resolved.length,
        successful:successes,rate:resolved.length?successes/resolved.length:null,
        tp2:selected.filter(s=>s.events.some(e=>e.type==='TP2')).length,
        tp3:selected.filter(s=>s.events.some(e=>e.type==='TP3')).length,
        stopped:selected.filter(s=>s.events.some(e=>e.type==='STOP')).length,
        modelBrier:brier('probability'),baselineBrier:brier('baseline')}];
    }));
    return {rule,modelSamples:models[rule.key].samples,windows:cohorts};
  });
  return {method:'chronological two-strategy research; frozen training after 60%; never includes future candles',
    provenance:'User-supplied OHLCV; origin and authenticity not independently verified',
    settings:{market,symbol,timeframe,development:60,validation:20,holdout:20,
      note:'M1 inputs must be continuous. Fees, funding and slippage are not included.'},
    versions,signals:signals.map(row=>({id:row.signal.id,ruleVersion:row.signal.ruleVersion,
      window:row.group,state:row.signal.state,detectedAt:row.signal.detectedAt,
      entryAt:row.signal.events.find(e=>e.type==='ENTRY')?.at||null,
      closeAt:row.signal.events.findLast(e=>['STOP','TP3','EXPIRED','INVALIDATED'].includes(e.type))?.at||null}))};
}
export const compareRuleVersions = compareStrategies;
if (process.argv[1] && import.meta.url === new URL('file://'+process.argv[1]).href) {
  if (!process.argv[2]) throw new Error('Usage: node backend/replay-rules.js verified-closed-ohlcv.json');
  const result=compareStrategies(JSON.parse(readFileSync(process.argv[2],'utf8')));
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
}
