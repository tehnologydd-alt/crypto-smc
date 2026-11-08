import test from 'node:test';
import assert from 'node:assert/strict';
import {RESEARCH_METHOD,buildResearchHypothesis,evaluateResearchHypothesis} from './forecast-core.mjs';
const step=3600000,base=1720000000000-baseMod();
function baseMod(){return 1720000000000%step;}
function series(count=110,{drift=.0012,unfinished=false}={}){
 let p=120;
 return Array.from({length:count},(_,i)=>{
  const t=base+i*step,open=p;
  p*=Math.exp(drift+Math.sin(i*.8)*.002);
  return {t,closeAt:t+step-1,open,high:Math.max(open,p)*1.001,
   low:Math.min(open,p)*.999,close:p,volume:10,closed:!unfinished||i<count-1};
 });
}
function buildWithFuture(){
 const bars=series(110);const train=bars.slice(0,105),last=train.at(-1);
 const pub=last.closeAt+500;
 const output=buildResearchHypothesis('BTCUSDT','1h',train,{now:pub});
 return {bars,train,output,pub};
}
test('fresh closed H1 prices produce a deterministic hypothesis but no calibrated probability',()=>{
 const {output}=buildWithFuture();
 assert.equal(output.state,'READY');
 const f=output.forecast;
 assert.equal(f.method,RESEARCH_METHOD);
 assert.equal(f.calibratedProbability,null);
 assert.equal(f.empiricalSamples,92);
 assert.equal(f.targetCloseAt-f.anchorCloseAt,4*step);
 assert.ok(f.bandLow<f.anchorClose&&f.bandHigh>f.anchorClose);
 assert.ok(!('trade' in f));
});
test('not enough bars, stale data and gaps block publication',()=>{
 const bars=series(110);
 assert.equal(buildResearchHypothesis('BTCUSDT','1h',bars.slice(-45),{now:bars.at(-1).closeAt+500}).state,'INSUFFICIENT');
 const b=buildResearchHypothesis('BTCUSDT','1h',bars,{now:bars.at(-1).closeAt+8*step});
 assert.equal(b.state,'STALE');
 const gap=series(110);gap[20]={...gap[20],t:gap[20].t+1};
 assert.equal(buildResearchHypothesis('BTCUSDT','1h',gap,{now:gap.at(-1).closeAt+500}).state,'INVALID');
});
test('a forming bar with extreme values cannot alter a published range',()=>{
 const bars=series(110,{unfinished:true});
 bars.at(-1).close=1000000;
 const now=bars.at(-2).closeAt+500;
 const r=buildResearchHypothesis('BTCUSDT','1h',bars,{now});
 assert.equal(r.state,'READY');
 assert.ok(r.forecast.anchorClose<1000);
});
test('no hindsight: evaluation cannot finish before the target close time',()=>{
 const {bars,output,pub}=buildWithFuture();
 const f=output.forecast;
 assert.equal(evaluateResearchHypothesis(f,bars,{now:pub}).state,'NOT_DUE');
 assert.equal(evaluateResearchHypothesis(f,bars.slice(0,107),{now:f.targetCloseAt+100}).state,'NEEDS_DATA');
});
test('outcomes require every exact closed H1 bar after publication',()=>{
 const {bars,output}=buildWithFuture();
 const f=output.forecast;const now=f.targetCloseAt+3000;
 const observed=evaluateResearchHypothesis(f,bars,{now});
 assert.equal(observed.state,'EVALUATED');
 assert.ok(['WITHIN_RANGE','OUTSIDE_RANGE'].includes(observed.outcome));
 assert.equal(observed.targetCloseAt,f.targetCloseAt);
 const gap=bars.filter(c=>c.closeAt!==f.anchorCloseAt+2*step);
 assert.equal(evaluateResearchHypothesis(f,gap,{now}).state,'NEEDS_DATA');
 const stillForming=bars.map(c=>c.closeAt===f.targetCloseAt?{...c,closed:false}:c);
 assert.equal(evaluateResearchHypothesis(f,stillForming,{now}).state,'NEEDS_DATA');
});
test('changing forecast method/interval cannot silently evaluate',()=>{
 const {bars,output}=buildWithFuture();
 const other={...output.forecast,method:'BAD'};
 assert.equal(evaluateResearchHypothesis(other,bars,{now:other.targetCloseAt+1000}).state,'INVALID');
});
