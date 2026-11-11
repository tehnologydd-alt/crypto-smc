import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createForegroundDepthPolicy,FOREGROUND_DEPTH_POLICY}
 from './foreground-depth-policy.mjs';
import {collectVisibleDepth} from './research.mjs';

const A='ETHUSDT',NOW=1794400000000;
test('foreground favorite with Android Room gets independent one-minute venue cadence',()=>{
 let now=NOW;
 const policy=createForegroundDepthPolicy({now:()=>now});
 const ready={visible:true,favorite:true,native:true};
 assert.equal(policy.allowed(A,'binance',ready).allowed,true);
 assert.equal(policy.allowed(A,'okx',ready).allowed,true);
 policy.record(A,'binance','OK');
 assert.equal(policy.allowed(A,'binance',ready).allowed,false);
 assert.equal(policy.allowed(A,'okx',ready).allowed,true);
 now+=FOREGROUND_DEPTH_POLICY.successGapMs-1;
 assert.equal(policy.allowed(A,'binance',ready).allowed,false);
 now++;
 assert.equal(policy.allowed(A,'binance',ready).allowed,true);
});
test('never poll hidden app, unsupported asset, missing favorite or no native Room',()=>{
 const p=createForegroundDepthPolicy({now:()=>NOW});
 const gate={visible:true,favorite:true,native:true};
 for(const cfg of [
  {...gate,visible:false},{...gate,favorite:false},
  {...gate,native:false},{...gate,busy:true}])
  assert.equal(p.allowed(A,'binance',cfg).allowed,false);
 assert.equal(p.allowed('BAD SYMBOL','binance',gate).reason,'INVALID');
 assert.equal(p.allowed(A,'unknown',gate).reason,'INVALID');
 assert.equal(p.record(A,'okx','FAKE_WIN'),false);
});
test('429 and unsupported spot delay only the affected provider',()=>{
 let now=NOW;
 const p=createForegroundDepthPolicy({now:()=>now});
 const gate={visible:true,favorite:true,native:true};
 p.record(A,'okx','RATE_LIMITED');
 assert.equal(p.allowed(A,'okx',gate).allowed,false);
 assert.equal(p.allowed(A,'binance',gate).allowed,true);
 now+=599999;
 assert.equal(p.allowed(A,'okx',gate).allowed,false);
 now++;
 assert.equal(p.allowed(A,'okx',gate).allowed,true);
 p.record(A,'okx','NOT_LISTED');
 now+=FOREGROUND_DEPTH_POLICY.notListedGapMs-1;
 assert.equal(p.allowed(A,'okx',gate).allowed,false);
 now++;
 assert.equal(p.allowed(A,'okx',gate).allowed,true);
});
test('transient offline errors back off, then success resets interval',()=>{
 let now=NOW;
 const p=createForegroundDepthPolicy({now:()=>now});
 const gate={visible:true,favorite:true,native:true};
 p.record(A,'binance','OFFLINE');
 now+=60000;
 assert.equal(p.allowed(A,'binance',gate).allowed,false);
 now+=60000;
 assert.equal(p.allowed(A,'binance',gate).allowed,true);
 p.record(A,'binance','OFFLINE');
 now+=3*60000;
 assert.equal(p.allowed(A,'binance',gate).allowed,false);
 now+=60000;
 assert.equal(p.allowed(A,'binance',gate).allowed,true);
 p.record(A,'binance','OK');
 now+=60000;
 assert.equal(p.allowed(A,'binance',gate).allowed,true);
});
test('only genuine public depth GETs, without a ticker/news request',async()=>{
 const requests=[];
 const now=1700000000000;
 const result=await collectVisibleDepth(A,{now:()=>now,
  fetchImpl:async(url,opts)=>{
   requests.push({url,opts});
   const okx=url.includes('okx.com');
   return {ok:true,status:200,json:async()=>okx?
    {code:'0',data:[{bids:[['100','2','0','1']],
     asks:[['101','2','0','1']],ts:String(now-100),seqId:1}]}:
    {lastUpdateId:2,bids:[['100','2']],asks:[['101','3']]}};
  }});
 assert.equal(result.state,'COLLECTED');
 assert.equal(result.sources.length,2);
 assert.equal(result.depth.length,2);
 assert.deepEqual(result.depth.map(v=>v.venue),['binance','okx']);
 assert.equal(requests.length,2);
 assert.ok(requests.every(r=>r.url.includes('/market/books?')||r.url.includes('depth?')));
 assert.ok(requests.every(r=>r.opts.credentials==='omit'));
 assert.equal(result.collectedAt,now);
 const one=await collectVisibleDepth(A,{venues:['okx'],now:()=>now,
  fetchImpl:async()=>({ok:false,status:429})});
 assert.equal(one.sources[0].state,'RATE_LIMITED');
 assert.equal(one.depth.length,0);
});
test('APK adapter, foreground guards and statuses are wired without new worker',()=>{
 const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
 const app=read('./app.mjs');
 const native=read('./mobile-bridge.mjs');
 const pipeline=read('../apex9-android/scripts/prepare-web.mjs');
 const history=read('./liquidity-dashboard.mjs');
 const dao=read('../apex9-android/native/src/main/java/com/apexintelligence/research/ApexDatabase.kt');
 const plugin=read('../apex9-android/native/src/main/java/com/apexintelligence/research/ApexNativePlugin.kt');
 assert.ok(pipeline.includes("'foreground-depth-policy.mjs'"));
 assert.ok(app.includes("document.body.dataset.view!=='asset'"));
 assert.ok(app.includes('hasMobileObservationStorage()'));
 assert.ok(app.includes('foregroundDepthPolicy.allowed('));
 assert.ok(app.includes('foregroundDepthPolicy.record('));
 assert.ok(app.includes('await saveMobileSnapshot(sample)'));
 assert.ok(app.includes('void refreshVisibleDepth()'));
 assert.ok(native.includes("typeof plugin()?.saveObservation==='function'"));
 assert.ok(history.includes("lastAsset=asset"));
 assert.ok(dao.includes('suspend fun liquidityHistoryForSource('));
 assert.ok(plugin.includes('dao.liquidityHistoryForSource(asset, "binance:spot:depth", perVenue)'));
 assert.ok(plugin.includes('dao.liquidityHistoryForSource(asset, "okx:spot:depth", limit / 2)'));
 assert.ok(history.includes("'Снимков в выборке'"));
 assert.equal(read('./foreground-depth-policy.mjs').includes('fetch('),false);
 assert.equal(read('./foreground-depth-policy.mjs').includes('setInterval('),false);
});
