import test from 'node:test';
import assert from 'node:assert/strict';
import {LIMITS,schedule,reserveBudget,budgetStatus} from './budget-governor.mjs';
import worker from './worker.mjs';

const ts=value=>Date.parse(value);
const TOKEN='this-is-a-unit-test-only-long-bearer-secret';
const origin='https://apex-ai.example.test';
const headers={Authorization:'Bearer '+TOKEN};
const evidence={role:'analyst',evidence:[
 {source_id:'unit-test-only',observed_at:123,text:'No actual market evidence used in this test'}
]};

test('Kyiv schedule has precise daylight and overnight boundaries in winter',()=>{
 assert.equal(schedule(ts('2026-11-13T20:59:00Z')).mode,'ACTIVE');
 assert.equal(schedule(ts('2026-11-13T21:00:00Z')).mode,'ECO');
 assert.equal(schedule(ts('2026-11-14T05:59:00Z')).mode,'ECO');
 assert.equal(schedule(ts('2026-11-14T06:00:00Z')).mode,'ACTIVE');
 assert.equal(schedule(ts('2026-11-13T21:00:00Z')).nightKey,'2026-11-13');
 assert.equal(schedule(ts('2026-11-14T05:59:00Z')).nightKey,'2026-11-13');
 assert.equal(schedule(ts('2026-11-14T06:00:00Z')).nightKey,'');
 assert.equal(schedule(ts('2026-11-14T06:00:00Z')).localDay,'2026-11-14');
});

test('Kyiv summer DST changes UTC start but not local 08:00-23:00 policy',()=>{
 assert.equal(schedule(ts('2026-07-13T04:59:00Z')).mode,'ECO');
 assert.equal(schedule(ts('2026-07-13T05:00:00Z')).mode,'ACTIVE');
 assert.equal(schedule(ts('2026-07-13T19:59:00Z')).mode,'ACTIVE');
 assert.equal(schedule(ts('2026-07-13T20:00:00Z')).mode,'ECO');
});

test('reservation binds one atomic day-month-night and cooldown transaction',async()=>{
 const observed=[];
 const db={prepare:sql=>({bind:(...args)=>({
  first:async()=>{observed.push({sql,args});return {service:'language',
   day_used:1,month_used:1,night_used:1,last_at:args[5]};}
 })})};
 const at=ts('2026-11-13T21:15:00Z');
 const r=await reserveBudget(db,'language',at);
 assert.equal(r.mode,'ECO');
 assert.deepEqual(observed[0].args,[
  'language','2026-11-13','2026-11','2026-11-13',1,at,
  LIMITS.language.nightGapMs,LIMITS.language.daily,
  LIMITS.language.monthly,LIMITS.language.night
 ]);
 assert.match(observed[0].sql,/night_used<\?10/);
 assert.match(observed[0].sql,/month_used<\?9/);
 assert.match(observed[0].sql,/RETURNING service/);
});

test('unknown services, missing D1, and denied reservations always fail closed',async()=>{
 assert.equal(await reserveBudget(null,'language'),null);
 assert.equal(await reserveBudget({prepare(){throw Error('down')}},'unknown'),null);
 assert.equal(await reserveBudget({prepare(){return {bind(){return {first:async()=>null}}}}},'booster'),null);
 await assert.rejects(()=>reserveBudget({prepare(){throw Error('down')}},'language'),/down/);
});

test('budget status includes actual D1 attempt counters but never claims billing visibility',async()=>{
 const now=ts('2026-11-14T02:00:00Z');
 const db={prepare:()=>({bind:service=>({first:async()=>({
  day_key:'2026-11-14',day_used:service==='language'?2:12,
  month_key:'2026-11',month_used:service==='language'?8:75,
  night_key:'2026-11-13',night_used:service==='language'?1:3,
  last_at:now-100000
 })})})};
 const response=await budgetStatus(db,now);
 assert.equal(response.clock.mode,'ECO');
 assert.equal(response.usage.language.dailyUsed,2);
 assert.equal(response.usage.language.nightUsed,1);
 assert.equal(response.usage.booster.nightUsed,3);
 assert.equal(response.usage.booster.monthlyUsed,75);
 assert.equal(response.billingObserved,false);
 assert.equal(response.neuronUsageObserved,false);
 assert.match(response.warning,/NOT real billing/);
});

test('worker exposes status only with auth and refuses quota-store outage',async()=>{
 const req=token=>new Request(origin+'/v1/budget/status',{
  headers:token?{Authorization:'Bearer '+token}:{}
 });
 assert.equal((await worker.fetch(req(null),{APEX_EDGE_TOKEN:TOKEN})).status,401);
 const response=await worker.fetch(req(TOKEN),{APEX_EDGE_TOKEN:TOKEN});
 assert.equal(response.status,503);
 assert.equal((await response.json()).state,'BUDGET_STORE_UNAVAILABLE');
});

test('missing quota storage blocks language agents and external Cloud Run requests',async()=>{
 let called=0;
 const env={
  APEX_EDGE_TOKEN:TOKEN,
  AI:{run:async()=>{called++;return {response:'not called'};}},
  COMPUTE_ORIGIN:'https://cpu.example.test',
  APEX_COMPUTE_TOKEN:'unit-test-backend-token'
 };
 const llm=await worker.fetch(new Request(origin+'/v1/agents/analyze',{
  method:'POST',headers,body:JSON.stringify(evidence)
 }),env);
 assert.equal(llm.status,503);
 const features=Object.fromEntries([
  'return_1m','return_5m','volatility_15m','volume_z_15m',
  'spread_bps','book_imbalance','large_trade_pressure',
  'whale_flow_score','relative_volume','cross_venue_disagreement'
 ].map(key=>[key,0]));
 const cpu=await worker.fetch(new Request(origin+'/v1/boosters/predict',{
  method:'POST',headers,body:JSON.stringify({observation:{
   asset:'BTCUSDT',source_ids:['unit-test-only'],features
  }})
 }),env);
 assert.equal(cpu.status,503);
 assert.equal((await cpu.json()).state,'BUDGET_STORE_UNAVAILABLE');
 assert.equal(called,0);
});
