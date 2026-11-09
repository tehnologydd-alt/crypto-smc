import test from 'node:test';
import assert from 'node:assert/strict';
import {createNewsM5Budget} from './news-m5-budget.mjs';
const base=Date.UTC(2026,10,9,14);
const makeStore=()=>{const map=new Map();return {
 getItem:k=>map.has(k)?map.get(k):null,
 setItem:(k,v)=>map.set(k,v)
};};
const successful=()=>({state:'PARTIAL',observations:[{minutes:15}]});
test('one request then short cache; a new story within minimum interval is blocked',async()=>{
 let time=base,count=0;
 const b=createNewsM5Budget({storage:makeStore(),now:()=>time});
 const r=await b.load('BTCUSDT',base-3600000,async()=>{count++;return successful()});
 assert.equal(r.state,'PARTIAL');assert.equal(r.cached,false);
 assert.equal(r.quota.used,1);
 const again=await b.load('BTCUSDT',base-3600000,async()=>{throw Error('cache missed')});
 assert.equal(again.state,'PARTIAL');assert.equal(again.cached,true);
 const blocked=await b.load('BTCUSDT',base-3600001,async()=>{count++;return successful()});
 assert.equal(blocked.state,'WAIT_INTERVAL');assert.equal(count,1);
 time+=2*60000;
 const allowed=await b.load('BTCUSDT',base-3600001,async()=>{count++;return successful()});
 assert.equal(allowed.state,'PARTIAL');assert.equal(count,2);
});
test('failed attempts reserve quota and local day limits remain real',async()=>{
 let time=base;
 const b=createNewsM5Budget({storage:makeStore(),now:()=>time});
 for(let i=0;i<8;i++){
  const r=await b.load('ETHUSDT',base-3600000+i,async()=>({state:'OFFLINE'}));
  assert.equal(r.state,'OFFLINE');
  time+=120000;
 }
 assert.equal(b.status().used,8);
 assert.equal(b.status().remaining,0);
 assert.equal((await b.load('ETHUSDT',base-3601000,successful)).state,'DAILY_LIMIT');
});
test('missing storage blocks request rather than bypassing quota guard',async()=>{
 const b=createNewsM5Budget({storage:null,now:()=>base});
 const r=await b.load('BTCUSDT',base-3600000,async()=>{throw Error('should not call');});
 assert.equal(r.state,'STORAGE_UNAVAILABLE');
});
test('simultaneous same-story checks share one upstream request',async()=>{
 const b=createNewsM5Budget({storage:makeStore(),now:()=>base});
 let requests=0,finish;
 const pending=new Promise(resolve=>finish=resolve);
 const first=b.load('BTCUSDT',base-3600000,async()=>{requests++;await pending;return successful()});
 const second=b.load('BTCUSDT',base-3600000,async()=>{requests++;return successful()});
 finish();
 const [a,c]=await Promise.all([first,second]);
 assert.equal(requests,1);
 assert.deepEqual(a,c);
});
