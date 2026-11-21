import test from 'node:test';
import assert from 'node:assert/strict';
import { detectSignal, advanceSignalWithCandle, parseKlines, analyzeStructure } from './strategy.js';
import { MarketStructureEngine, ZonesDetector, ContextRegimeFilter, previousAtr } from './smc-v3.js';
import { newModel, validModel, learnFromOutcome, scoreSignal } from './learning.js';

const HOUR=3600000;
function bullish(period=HOUR, start=0, count=40) {
  return Array.from({length:count},(_,i)=>{
    const time=start+i*period, standard={time,end:time+period-1,open:100,high:101,low:99,close:100,volume:1};
    if(i===count-10) return {...standard,high:103};
    if(i===count-2) return {...standard,open:101,close:100,high:102};
    if(i===count-1) return {...standard,open:102.5,low:102.5,high:107,close:106};
    return standard;
  });
}
function parentFor(bars){
  const last=bars.at(-1).end;
  return bullish(4*HOUR,last-20*4*HOUR+1,20);
}
function basicSignal(){
 return {side:'LONG',state:'WAITING',entryLow:99,entryHigh:101,entry:100,
  stop:98,targets:[102,104,106],hitTargets:0,expiresAt:999999999999,
  detectedAt:0,events:[]};
}

test('confirmed swing only appears after both right bars close',()=>{
  const bars=bullish();
  const before=MarketStructureEngine.analyze(bars.slice(0,32));
  assert.equal(before.swings.some(s=>s.time===bars[30].time),false);
  const after=MarketStructureEngine.analyze(bars.slice(0,33));
  assert.equal(after.swings.some(s=>s.time===bars[30].time),true);
});
test('break requires close, emits typed BOS once and does not repaint',()=>{
  const bars=bullish();
  const wick=[...bars];wick[39]={...bars[39],open:100,close:102,low:99,high:107};
  assert.equal(MarketStructureEngine.analyze(wick).breaks.length,0);
  const s=MarketStructureEngine.analyze(bars);
  assert.equal(s.breaks.at(-1).type,'BOS');assert.equal(s.regime,'up');
  assert.equal(s.breaks.filter(x=>x.id===s.breaks.at(-1).id).length,1);
});
test('FVG has minimum size, direction and explicit fill states',()=>{
  const bars=bullish();
  const zones=ZonesDetector.scan(bars);
  const gap=zones.fvg.find(z=>z.time===bars.at(-1).time && z.direction==='up');
  assert.ok(gap);assert.equal(gap.status,'active');
  assert.deepEqual([gap.low,gap.high],[101,102.5]);
  const touch={...bars.at(-1),time:bars.at(-1).end+1,end:bars.at(-1).end+HOUR,open:105,high:106,low:102,close:105};
  const partial=ZonesDetector.fvg([...bars,touch]).find(z=>z.id===gap.id);
  assert.equal(partial.status,'mitigated');
  const fill={...touch,time:touch.end+1,end:touch.end+HOUR,low:100,close:104};
  assert.equal(ZonesDetector.fvg([...bars,touch,fill]).find(z=>z.id===gap.id).status,'filled');
});
test('OB is linked to displacement event and kept distinct from FVG',()=>{
  const b=bullish(),s=MarketStructureEngine.analyze(b),zones=ZonesDetector.scan(b,s);
  assert.equal(zones.ob.at(-1).originEventId,s.breaks.at(-1).id);
  assert.equal(zones.ob.at(-1).time,b[38].time);
  assert.ok(previousAtr(b,39)>0);
});
test('HTF must be present, closed and in matching trend',()=>{
  const b=bullish(),event=MarketStructureEngine.analyze(b).breaks.at(-1);
  assert.equal(ContextRegimeFilter.evaluate(event,b,null,'1h').allowed,false);
  assert.equal(ContextRegimeFilter.evaluate(event,b,parentFor(b),'1h').allowed,true);
  const htf=parentFor(b).map((c,i)=>i===19?{...c,time:b.at(-1).end+100,end:b.at(-1).end+4*HOUR,close:106}:c);
  assert.equal(ContextRegimeFilter.evaluate(event,b,htf,'1h').allowed,false);
});
test('v3 signal requires structural BOS + active OB/FVG + closed HTF',()=>{
  const b=bullish();
  assert.equal(detectSignal(b,'spot','BTCUSDT','1h'),null);
  const signal=detectSignal(b,'spot','BTCUSDT','1h',parentFor(b));
  assert.ok(signal);
  assert.equal(signal.strategyVersion,3);assert.equal(signal.structureEvent.type,'BOS');
  assert.equal(signal.entry,100.5);assert.equal(signal.targets.length,3);
  assert.equal(signal.state,'WAITING');
  assert.equal(analyzeStructure(b).breaks.at(-1).type,'BOS');
});
test('M1 stop beats target on ambiguous candle; no synthetic order fill',()=>{
  const signal=basicSignal();
  advanceSignalWithCandle(signal,{high:100.5,low:99.5,close:100,end:1});
  assert.equal(signal.state,'OPEN');
  advanceSignalWithCandle(signal,{high:107,low:97,close:100,end:2});
  assert.equal(signal.state,'STOPPED');assert.equal(signal.hitTargets,0);
});
test('v3 model cannot learn from old v2 outcomes',()=>{
  const model=newModel();const b=bullish();
  const signal=detectSignal(b,'spot','BTCUSDT','1h',parentFor(b));
  assert.equal(validModel(model),true);assert.equal(validModel({...model,version:2}),false);
  signal.quality=scoreSignal(model,signal.features);signal.state='STOPPED';
  assert.equal(learnFromOutcome(model,{...signal,strategyVersion:2}),false);
  assert.equal(learnFromOutcome(model,signal),true);
  assert.equal(learnFromOutcome(model,signal),false);
  assert.equal(model.samples,1);
});
test('unfinished Binance candles are excluded',()=>{
  const now=Date.now();const rows=[[now-1000,'1','2','0.5','1.5','1',now+1000],
    [now-120000,'1','2','0.5','1.5','1',now-60000]];
  assert.equal(parseKlines(rows,now).length,1);
});
