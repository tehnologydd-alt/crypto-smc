import test from 'node:test';
import assert from 'node:assert/strict';
import {auditCandleSeries,auditVisibleDepth,auditNetwork,
 inspectOutcomeRow,auditForwardResearch,wilson95,MIN_FORWARD_SAMPLES} from './evidence-lab.mjs';
const H=3600000,base=1700000000000-1700000000000%H;
const now=base+80*H;
function candle(i){
 const t=base+i*H;
 return {t,closeAt:t+H-1,open:100,high:103,low:99,close:101,volume:40,closed:true};
}
function forecast(i,{asset='BTCUSDT',outcome='WITHIN_RANGE',completed=true}={}){
 const anchor=base+(i*4+1)*H-1;
 const publishedAt=anchor+1000,targetCloseAt=anchor+4*H;
 return {id:'range1:'+asset+':1h:'+anchor,asset,interval:'1h',publishedAt,
  hypothesis:JSON.stringify({model:'EMPIRICAL_CLOSE_RANGE_V1',
   anchorCloseAt:anchor,targetCloseAt,anchorClose:100,bandLow:95,bandHigh:105,
   horizonBars:4,sampleBars:96}),
  evaluation:completed?{
   outcome,actualClose:outcome==='WITHIN_RANGE'?101:110,
   targetCloseAt,evaluatedAt:targetCloseAt+1000}:null};
}
test('candle quality reports real missing intervals and offline age',()=>{
 const rows=[candle(0),candle(1),candle(4),candle(5)];
 const r=auditCandleSeries(rows,'1h',{now:base+20*H});
 assert.equal(r.samples,4);assert.equal(r.gaps,2);
 assert.ok(Math.abs(r.coverage-4/6)<1e-9);
 assert.equal(r.state,'HISTORICAL');
 assert.equal(auditCandleSeries([candle(1),candle(1)],'1h',{now}).state,'INVALID');
});
test('unavailable network and depth remain empty, not inferred',()=>{
 const r=auditVisibleDepth([],'BTCUSDT',{now});
 assert.equal(r.samples,0);assert.equal(r.venues.length,2);
 assert.equal(auditNetwork([],'GRAMUSDT',{now}).chain,'ton');
 assert.equal(auditNetwork([],'SOLUSDT',{now}).state,'UNSUPPORTED');
});
test('forecasts with evaluated outcome cannot be published after future period',()=>{
 const a=forecast(0);
 assert.equal(inspectOutcomeRow(a,{now}).state,'EVALUATED');
 const changed={...a,publishedAt:JSON.parse(a.hypothesis).targetCloseAt+1};
 assert.equal(inspectOutcomeRow(changed,{now}).state,'INVALID');
});
test('a forged result does not contribute to observed coverage',()=>{
 const a=forecast(0);
 const corrupt={...a,evaluation:{...a.evaluation,outcome:'OUTSIDE_RANGE'}};
 assert.equal(inspectOutcomeRow(corrupt,{now}).state,'INVALID');
 const summary=auditForwardResearch([a,corrupt],{now});
 assert.equal(summary.counts.evaluated,1);
 assert.equal(summary.counts.invalid,1);
});
test('pending overdue observations are not counted as failures',()=>{
 const rows=[forecast(0,{completed:false}),forecast(18,{completed:false})];
 const result=auditForwardResearch(rows,{now});
 assert.equal(result.counts.evaluated,0);
 assert.equal(result.counts.dueUnevaluated,1);
 assert.equal(result.counts.awaiting,1);
});
test('duplicate and temporally overlapping scenarios do not inflate counts',()=>{
 const a=forecast(0),b=forecast(0);
 const h=JSON.parse(a.hypothesis);const overlap=forecast(1);
 const changed={...overlap,id:'range1:BTCUSDT:1h:'+(h.anchorCloseAt+H),
  hypothesis:JSON.stringify({...JSON.parse(overlap.hypothesis),
   anchorCloseAt:h.anchorCloseAt+H,targetCloseAt:h.targetCloseAt+H}),
  publishedAt:h.anchorCloseAt+H+1000,
  evaluation:{...overlap.evaluation,targetCloseAt:h.targetCloseAt+H,
   evaluatedAt:h.targetCloseAt+H+500}};
 const r=auditForwardResearch([a,b,changed],{now});
 assert.equal(r.counts.invalid,1);assert.equal(r.counts.excludedOverlaps,1);
 assert.equal(r.cohorts[0].independentWindows,1);
});
test('under 30 nonoverlapping outcomes cannot claim calibrated coverage',()=>{
 const rows=Array.from({length:29},(_,i)=>forecast(i));
 const r=auditForwardResearch(rows,{now:base+500*H});
 assert.equal(r.cohorts[0].status,'INSUFFICIENT');
 assert.equal(r.cohorts[0].coverage,null);
});
test('30 genuinely forward-tested windows get only a descriptive Wilson interval',()=>{
 const rows=Array.from({length:MIN_FORWARD_SAMPLES},(_,i)=>
  forecast(i,{outcome:i<24?'WITHIN_RANGE':'OUTSIDE_RANGE'}));
 const r=auditForwardResearch(rows,{now:base+500*H,totalPublished:50});
 assert.equal(r.cohorts[0].status,'REPORTABLE');
 assert.ok(Math.abs(r.cohorts[0].coverage-.8)<1e-12);
 assert.ok(r.cohorts[0].interval95.lower<.8);
 assert.ok(r.cohorts[0].interval95.upper>.8);
 assert.equal(r.truncated,true);
 assert.ok(wilson95(0,30).upper<.2);
});
test('different asset samples do not get pooled into a fake general confidence',()=>{
 const a=Array.from({length:20},(_,i)=>forecast(i));
 const b=Array.from({length:20},(_,i)=>forecast(i,{asset:'ETHUSDT'}));
 const r=auditForwardResearch([...a,...b],{now:base+500*H});
 assert.equal(r.cohorts.length,2);
 assert.ok(r.cohorts.every(x=>x.status==='INSUFFICIENT'));
});
