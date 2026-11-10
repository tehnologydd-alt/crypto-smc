import test from 'node:test';
import assert from 'node:assert/strict';
import {createResearchLayerBudget} from './research-layer-budget.mjs';
const now=Date.UTC(2026,10,10,9);
function memory(){const m=new Map();return{
 getItem:k=>m.has(k)?m.get(k):null,
 setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k),raw:m
}}
test('one manual request, short cache and local spacing are enforced',async()=>{
 let at=now,count=0;
 const b=createResearchLayerBudget({storage:memory(),now:()=>at});
 const first=await b.load('derivatives','BTCUSDT',async()=>{
  count++;return {state:'OK',data:{symbol:'BTCUSDT'}}});
 assert.equal(first.state,'OK');assert.equal(first.cache,'NETWORK');
 assert.equal(first.quota.used,1);
 const second=await b.load('derivatives','BTCUSDT',async()=>{throw Error('no GET')});
 assert.equal(second.cache,'FRESH');
 const blocked=await b.load('derivatives','ETHUSDT',async()=>{
  count++;return {state:'OK'}});
 assert.equal(blocked.state,'WAIT_INTERVAL');
 assert.equal(count,1);
 at+=11*60000;
 const accepted=await b.load('derivatives','ETHUSDT',async()=>{
  count++;return {state:'OK'}});
 assert.equal(accepted.state,'OK');assert.equal(count,2);
});
test('failed requests count against budget and cannot be retried indefinitely',async()=>{
 let at=now,count=0;
 const b=createResearchLayerBudget({storage:memory(),now:()=>at});
 for(let i=0;i<6;i++){
  const r=await b.load('wallet','ethereum:0x'+'a'.repeat(40)+i,async()=>{
   count++;return {state:'OFFLINE'}});
  assert.equal(r.state,'OFFLINE');
  at+=2*60000;
 }
 assert.equal(count,6);
 assert.equal(b.status('wallet').used,6);
 assert.equal((await b.load('wallet','ethereum:0x'+'b'.repeat(40),async()=>{
  throw Error('no GET');})).state,'DAILY_LIMIT');
});
test('missing storage, corrupt ledgers and invalid request keys fail closed',async()=>{
 const missing=createResearchLayerBudget({storage:null,now:()=>now});
 assert.equal((await missing.load('wallet','bitcoin:known',async()=>{
  throw Error('must not call')})).state,'STORAGE_UNAVAILABLE');
 const store=memory();
 store.setItem('apex9:research-layer-budget:v1','{broken}');
 const corrupt=createResearchLayerBudget({storage:store,now:()=>now});
 assert.equal((await corrupt.load('derivatives','BTCUSDT',async()=>{
  throw Error('must not call')})).state,'STORAGE_UNAVAILABLE');
 assert.equal((await corrupt.load('other','BTCUSDT',async()=>({state:'OK'}))).state,'INVALID');
});
test('wallet cache removed on explicit clear without resetting request counts',async()=>{
 const store=memory(),b=createResearchLayerBudget({storage:store,now:()=>now});
 const key='ethereum:0x'+'a'.repeat(40);
 await b.load('wallet',key,async()=>({state:'OK',data:{amount:1}}));
 assert.equal(b.clear('wallet',key),true);
 assert.equal(store.getItem('apex9:research-layer-cache:v1:wallet:'+key),null);
 assert.equal(b.status('wallet').used,1);
});
test('concurrent identical checks use one GET and one allowance',async()=>{
 const b=createResearchLayerBudget({storage:memory(),now:()=>now});
 let resolve,reached=0;
 const gate=new Promise(done=>resolve=done);
 const a=b.load('derivatives','BTCUSDT',async()=>{
  reached++;await gate;return {state:'OK'}});
 const c=b.load('derivatives','BTCUSDT',async()=>{
  reached++;return {state:'OK'}});
 resolve();
 const all=await Promise.all([a,c]);
 assert.equal(reached,1);assert.equal(all[0].state,'OK');
 assert.equal(b.status('derivatives').used,1);
});
