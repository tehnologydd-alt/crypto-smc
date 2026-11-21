// Deterministic offline walk-forward audit. No API, live order, or parameter optimization.
import { readFileSync } from 'node:fs';
import { detectSignal, advanceSignalWithCandle, TIMEFRAMES } from './strategy.js';

function isBar(c) {
  return c && [c.time,c.end,c.open,c.high,c.low,c.close].every(Number.isFinite) &&
    c.end>=c.time && c.high>=Math.max(c.open,c.close,c.low) && c.low<=Math.min(c.open,c.close,c.high);
}
function validate(input) {
  if (!input || !['spot','futures'].includes(input.market) || !TIMEFRAMES[input.timeframe] ||
      !/^[A-Z0-9]{2,16}USDT$/.test(input.symbol || '')) throw new Error('Invalid market, timeframe or symbol');
  for (const key of ['bars','parentBars','m1']) {
    const rows=input[key];
    if (!Array.isArray(rows) || rows.length<20 || !rows.every(isBar) ||
        rows.some((c,i)=>i>0 && c.time<=rows[i-1].time))
      throw new Error('Invalid chronological CLOSED OHLC candles: '+key);
  }
  return input;
}
const partition=(i,total)=>i<Math.floor(total*.6)?'development':
  i<Math.floor(total*.8)?'validation':'holdout';
export function replayWalkForward(raw) {
  const {market,symbol,timeframe,bars,parentBars,m1}=validate(raw);
  const signalList=[]; const partitions=['development','validation','holdout'];
  const groups=Object.fromEntries(partitions.map(x=>[x,{created:0,entered:0,settled:0,tp1:0,stopped:0,expired:0,open:0}]));
  let minuteIndex=0;
  // Progress strictly chronologically: update only signals published before this M1.
  function advanceThrough(timestamp){
    while(minuteIndex<m1.length && m1[minuteIndex].end<=timestamp){
      const candle=m1[minuteIndex++];
      for(const {signal} of signalList)if(candle.end>signal.detectedAt &&
        ['WAITING','OPEN'].includes(signal.state))advanceSignalWithCandle(signal,candle);
    }
  }
  for(let i=35;i<bars.length;i++){
    const candle=bars[i];
    advanceThrough(candle.end);
    if(signalList.some(({signal})=>['WAITING','OPEN','UNCERTAIN'].includes(signal.state)))continue;
    const signal=detectSignal(bars.slice(0,i+1),market,symbol,timeframe,
      parentBars.filter(c=>c.end<=candle.end));
    if(signal)signalList.push({signal,group:partition(i,bars.length)});
  }
  advanceThrough(m1.at(-1).end);
  for(const {signal,group} of signalList){
    groups[group].created++;
    if(signal.events.some(e=>e.type==='ENTRY'))groups[group].entered++;
    if(signal.events.some(e=>e.type==='TP1'))groups[group].tp1++;
    if(signal.events.some(e=>e.type==='STOP'))groups[group].stopped++;
    if(signal.state==='EXPIRED')groups[group].expired++;
    if(['OPEN','WAITING','UNCERTAIN'].includes(signal.state))groups[group].open++;
    if(['STOPPED','COMPLETED'].includes(signal.state))groups[group].settled++;
  }
  return {strategyVersion:3,config:{market,symbol,timeframe,development:60,validation:20,holdout:20,
    optimization:'disabled',source:'user-provided real historical closed candles'},
    windows:groups,signals:signalList.map(({signal,group})=>({id:signal.id,window:group,side:signal.side,
      event:signal.structureEvent?.type,state:signal.state,hitTargets:signal.hitTargets,
      createdAt:signal.detectedAt,entryAt:signal.events.find(e=>e.type==='ENTRY')?.at||null}))};
}
if(process.argv[1] && import.meta.url===new URL('file://'+process.argv[1]).href) {
  if(!process.argv[2])throw new Error('Usage: node backend/replay.js candles.json');
  const report=replayWalkForward(JSON.parse(readFileSync(process.argv[2],'utf8')));
  process.stdout.write(JSON.stringify(report,null,2)+'\n');
}
