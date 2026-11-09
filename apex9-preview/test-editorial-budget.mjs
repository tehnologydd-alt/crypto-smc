import test from 'node:test';
import assert from 'node:assert/strict';
import {createEditorialBudget,utcBudgetDay} from './editorial-budget.mjs';
const makeStorage=()=>{
 const store=new Map();
 return {getItem:key=>store.has(key)?store.get(key):null,
  setItem:(key,value)=>store.set(key,value),store};
};
const epoch=Date.UTC(2026,10,9,14);
test('fresh cache and concurrent callers consume one request, even across controllers',async()=>{
 const storage=makeStorage();let time=epoch,calls=0;
 const request=async()=>{calls++;return {state:'OK',articles:[{title:'A'}]};};
 const controller=createEditorialBudget({storage,now:()=>time});
 const [a,b]=await Promise.all([
  controller.load('news',request),controller.load('news',request)]);
 assert.equal(calls,1);
 assert.equal(a.state,'OK');assert.equal(b.state,'OK');
 const reload=createEditorialBudget({storage,now:()=>time+2000});
 const c=await reload.load('news',request);
 assert.equal(c.source,'CACHE');assert.equal(calls,1);
 assert.equal(reload.status('news').remaining,11);
 assert.equal(reload.status('macro').remaining,6);
});
test('hard daily limit counts failures, exposes stale labelled cache, resets in UTC',async()=>{
 const storage=makeStorage();let time=epoch,n=0;
 const budget=createEditorialBudget({storage,now:()=>time});
 for(let i=0;i<12;i++){
  const result=await budget.load('news',async()=>{
   n++;return i===0?{state:'OK',articles:[{title:'Earlier'}]}:
    {state:'RATE_LIMITED',articles:[]};
  },{force:true});
  assert.ok(['OK','STALE'].includes(result.state));
  time+=45*60000;
 }
 const stopped=await budget.load('news',async()=>{n++;}, {force:true});
 assert.equal(n,12);
 assert.equal(stopped.state,'STALE');
 assert.equal(stopped.sourceState,'LIMIT_REACHED');
 assert.equal(budget.status('news').remaining,0);
 time+=49*3600000;
 const reset=budget.status('news');
 assert.equal(reset.remaining,12);
 assert.equal(utcBudgetDay(time),'2026-11-12');
});
test('no storage or corrupt ledger fails closed; no network used',async()=>{
 let calls=0;
 const bad=createEditorialBudget({storage:null,now:()=>epoch});
 const result=await bad.load('calendar',async()=>{calls++;});
 assert.equal(result.state,'STORAGE_UNAVAILABLE');
 const storage=makeStorage();
 storage.setItem('apex9:public-editorial-budget:v3','not-json');
 const x=await createEditorialBudget({storage,now:()=>epoch})
  .load('news',async()=>{calls++;});
 assert.equal(x.state,'STORAGE_UNAVAILABLE');
 assert.equal(calls,0);
});
test('failed requests consume attempts and do not bypass cache TTL',async()=>{
 const storage=makeStorage();let calls=0,t=Date.UTC(2026,10,9,0);
 const budget=createEditorialBudget({storage,now:()=>t});
 let r=await budget.load('calendar',async()=>{calls++;return {state:'OFFLINE',events:[]};});
 assert.equal(r.state,'OFFLINE');
 assert.equal(r.quota.remaining,1);
 r=await budget.load('calendar',async()=>{calls++;return {state:'OFFLINE',events:[]};});
 assert.equal(r.state,'WAIT_INTERVAL');
 assert.equal(calls,1);
 t+=12*3600000;
 r=await budget.load('calendar',async()=>{calls++;return {state:'OFFLINE',events:[]};});
 assert.equal(calls,2);
 assert.equal(r.quota.remaining,0);
 r=await budget.load('calendar',async()=>{calls++;return {state:'OK',events:[]};});
 assert.equal(calls,2);assert.equal(r.state,'LIMIT_REACHED');
});

test('minimum spacing prevents retry bursts even with force',async()=>{
 const storage=makeStorage(),budget=createEditorialBudget({storage,now:()=>epoch});
 let calls=0;
 const request=async()=>{calls++;return {state:'OK',articles:[]};};
 const first=await budget.load('macro',request,{force:true});
 const second=await budget.load('macro',request,{force:true});
 assert.equal(first.source,'NETWORK');
 assert.equal(second.state,'STALE');
 assert.equal(second.sourceState,'WAIT_INTERVAL');
 assert.equal(calls,1);
 assert.equal(budget.status('macro').used,1);
});

test('asset news uses one shared daily allowance with separate per-symbol caches',async()=>{
 const storage=makeStorage();let t=epoch,calls=0;
 const budget=createEditorialBudget({storage,now:()=>t});
 const request=async symbol=>{calls++;return {state:'OK',data:{asset:symbol,articles:[]}};};
 const btc=await budget.load('assetNews',()=>request('BTCUSDT'),{key:'BTCUSDT'});
 assert.equal(btc.state,'OK');assert.equal(btc.data.asset,'BTCUSDT');
 const ethTooSoon=await budget.load('assetNews',()=>request('ETHUSDT'),{key:'ETHUSDT'});
 assert.equal(ethTooSoon.state,'WAIT_INTERVAL');
 t+=90*60000;
 const eth=await budget.load('assetNews',()=>request('ETHUSDT'),{key:'ETHUSDT'});
 assert.equal(eth.state,'OK');assert.equal(eth.data.asset,'ETHUSDT');
 const cached=await budget.load('assetNews',()=>request('BTCUSDT'),{key:'BTCUSDT'});
 assert.equal(cached.source,'CACHE');assert.equal(cached.data.asset,'BTCUSDT');
 assert.equal(calls,2);
 assert.equal(budget.status('assetNews').used,2);
});

test('UTC daily reset does not bypass minimum provider spacing across midnight',async()=>{
 const storage=makeStorage();let t=Date.UTC(2026,10,9,23,55);
 const b=createEditorialBudget({storage,now:()=>t});
 let count=0;
 const fn=async()=>{count++;return {state:'OK',articles:[]};};
 assert.equal((await b.load('news',fn)).source,'NETWORK');
 t=Date.UTC(2026,10,10,0,2);
 const blocked=await b.load('news',fn,{force:true});
 assert.equal(blocked.state,'STALE');
 assert.equal(blocked.sourceState,'WAIT_INTERVAL');
 assert.equal(b.status('news').remaining,12);
 assert.equal(count,1);
 t+=45*60000;
 assert.equal((await b.load('news',fn,{force:true})).source,'NETWORK');
 assert.equal(count,2);
});

test('BLS numeric data is limited to three attempts per UTC day',async()=>{
 const storage=makeStorage();let t=Date.UTC(2026,10,9,0),calls=0;
 const budget=createEditorialBudget({storage,now:()=>t});
 for(let i=0;i<3;i++){
  assert.equal((await budget.load('macroData',async()=>{
   calls++;return {state:'OK',indicators:[{value:3}]};
  },{force:true})).state,'OK');
  t+=8*3600000;
 }
 const exceeded=await budget.load('macroData',async()=>{calls++;},{force:true});
 assert.equal(calls,3);
 assert.equal(exceeded.sourceState,'LIMIT_REACHED');
});
