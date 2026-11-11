import test from 'node:test';
import assert from 'node:assert/strict';
import {createSourceReliability,RELIABILITY_PROVIDERS} from './source-reliability.mjs';
import {createFreeSourceBudget} from './free-source-budget.mjs';
const DAY=86400000;
const origin=Date.UTC(2026,9,21,12);
function memoryStorage(){
 const values=new Map();
 return {getItem:k=>values.has(k)?values.get(k):null,
  setItem:(k,v)=>values.set(k,v),values};
}
test('new providers never receive a synthetic percent or successful response',()=>{
 let t=origin;
 const ledger=createSourceReliability({storage:memoryStorage(),now:()=>t});
 const rows=ledger.overview().rows;
 assert.deepEqual(rows.map(x=>x.provider),RELIABILITY_PROVIDERS);
 assert.equal(rows.every(x=>x.attempts===0&&x.availabilityPercent===null),true);
 assert.equal(ledger.overview().persisted,true);
});
test('only 12 actual responses on two days unlock descriptive availability',()=>{
 let t=origin;
 const storage=memoryStorage();
 const ledger=createSourceReliability({storage,now:()=>t});
 for(let i=0;i<12;i++){
  t=origin+(i<6?i*1000:DAY+(i-6)*1000);
  const state=i===8?'RATE_LIMITED':i===10?'INVALID':'OK';
  const data=state==='OK'?{observedAt:t-60000,priceUsd:5}:null;
  assert.equal(ledger.record({provider:'paprika',result:{state,data},
   at:t,latencyMs:150+i}),true);
 }
 const score=ledger.summary('paprika');
 assert.equal(score.state,'OBSERVED');
 assert.equal(score.attempts,12);
 assert.equal(score.uniqueDays,2);
 assert.equal(score.ok,10);
 assert.equal(score.rateLimited,1);
 assert.equal(score.invalid,1);
 assert.equal(score.availabilityPercent,83.3);
 assert.equal(score.freshness.checked,10);
 assert.equal(score.freshness.percent,100);
 assert.equal(score.latencyMedianMs,155.5);
 const reload=createSourceReliability({storage,now:()=>t});
 assert.equal(reload.summary('paprika').ok,10);
});
test('12 results from a single day do not unlock a misleading percentage',()=>{
 let t=origin;
 const x=createSourceReliability({storage:memoryStorage(),now:()=>t});
 for(let i=0;i<12;i++){
  t=origin+i*1000;
  x.record({provider:'okx',result:{state:'OK',data:{observedAt:t}}});
 }
 const summary=x.summary('okx');
 assert.equal(summary.state,'COLLECTING');
 assert.equal(summary.availabilityPercent,null);
 assert.equal(summary.freshness.checked,0); // OKX timestamp is local receipt
});
test('cached responses, local budget pauses and repeat view do not inflate statistics',async()=>{
 let t=origin,calls=0;
 const storage=memoryStorage();
 const reliability=createSourceReliability({storage,now:()=>t});
 const budget=createFreeSourceBudget({storage,now:()=>t,onNetworkResult:ev=>
  reliability.record({provider:ev.provider,result:ev.result,
   at:ev.at,latencyMs:ev.latencyMs})});
 const fetcher=async()=>{calls++;return {state:'OK',data:{observedAt:t-60000}};};
 const first=await budget.load('fear',fetcher,{key:'global'});
 assert.equal(first.source,'NETWORK');
 const cache=await budget.load('fear',fetcher,{key:'global'});
 assert.equal(cache.source,'CACHE');
 assert.equal(calls,1);
 assert.equal(reliability.summary('fear').attempts,1);
 t+=6*3600000+1000;
 const error=await budget.load('fear',async()=>{calls++;return {state:'RATE_LIMITED'}},
  {key:'global'});
 assert.equal(error.state,'STALE');
 assert.equal(error.sourceState,'RATE_LIMITED');
 assert.equal(calls,2);
 assert.equal(reliability.summary('fear').attempts,2);
 assert.equal(reliability.summary('fear').rateLimited,1);
 const paused=await budget.load('fear',fetcher,{key:'global'});
 assert.equal(paused.sourceState,'WAIT_INTERVAL');
 assert.equal(reliability.summary('fear').attempts,2);
});
test('unknown source time is not silently labelled fresh',()=>{
 let t=origin;
 const x=createSourceReliability({storage:memoryStorage(),now:()=>t});
 x.record({provider:'dex',result:{state:'OK',data:{observedAt:t}}});
 assert.equal(x.summary('dex').freshness.checked,0);
 x.record({provider:'paprika',result:{state:'OK',
  data:{observedAt:t-5*3600000}}});
 assert.equal(x.summary('paprika').freshness.checked,1);
 assert.equal(x.summary('paprika').freshness.confirmed,0);
});
test('USD disagreement is descriptive, never assigned to a provider',()=>{
 let t=origin;
 const x=createSourceReliability({storage:memoryStorage(),now:()=>t});
 assert.equal(x.compareUsd({asset:'BTCUSDT',one:100,two:102}),true);
 assert.equal(x.compareUsd({asset:'BTCUSDT',one:100,two:120}),false);
 assert.equal(x.overview().comparisons.count,1);
 assert.ok(x.overview().comparisons.medianDeltaPercent>1);
 assert.equal(x.compareUsd({asset:'BTCUSDT',one:100,two:Infinity}),false);
});
test('no storage is explicitly memory-only rather than persistent',()=>{
 const x=createSourceReliability({storage:null,now:()=>origin});
 x.record({provider:'fear',result:{state:'OK',data:{observedAt:origin}}});
 assert.equal(x.summary('fear').attempts,1);
 assert.equal(x.overview().persisted,false);
});
