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
  // The generator sees only candles already closed at each historical instant.
  for(let i=35;i<bars.length;i++){
    const candle=bars[i],sample=bars.slice(0,i+1);
    const parent=parentBars.filter(c=>c.end<=candle.end);
    const signal=detectSignal(sample,market,symbol,timeframe,parent);
    if(!signal)continue;
    // Keep the same no-overlap-per-asset/TF rule as production, per partition.
    if(signalList.some(r=>r.signal.state==='WAITING'||r.signal.state==='OPEN'?r.signal.detectedAt<=signal.detectedAt &&
      r.lastProcessed < signal.detectedAt:false))continue;
    const group=partition(i,bars.length);groups[group].created++;
    const outcome={signal,group,lastProcessed:signal.detectedAt};
    // M1 replay never consumes a bar at or before published signal timestamp.
    for(const c of m1) {
      if(c.end<=signal.detectedAt)continue;
      if(c.end>bars.at(-1).end)break;
      if(['STOPPED','COMPLETED','EXPIRED','CANCELLED','UNCERTAIN'].includes(signal.state))break;
      advanceSignalWithCandle(signal,c);
      outcome.lastProcessed=c.end;
    }
    if(signal.events.some(e=>e.type==='ENTRY'))groups[group].entered++;
    if(signal.events.some(e=>e.type==='TP1'))groups[group].tp1++;
    if(signal.events.some(e=>e.type==='STOP'))groups[group].stopped++;
    if(signal.state==='EXPIRED')groups[group].expired++;
    if(signal.state==='OPEN'||signal.state==='WAITING')groups[group].open++;
    if(signal.state==='STOPPED'||signal.state==='COMPLETED')groups[group].settled++;
    signalList.push(outcome);
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
