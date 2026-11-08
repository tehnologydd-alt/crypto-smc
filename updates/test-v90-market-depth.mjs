import test from 'node:test';
import assert from 'node:assert/strict';
import {parseDepthSnapshot,fetchPublicDepth} from './v90-market-depth.mjs';
const now=1700000000000;
const binance={lastUpdateId:11,bids:[['100','2'],['99','3']],asks:[['101','1'],['102','2']]};
const bybit={retCode:0,result:{s:'BTCUSDT',b:[['100','2']],a:[['101','1']],ts:now-100,u:12}};
test('Binance book normalizes as limited snapshot, no fake exchange timestamp',()=>{
 const r=parseDepthSnapshot('binance','BTCUSDT',binance,now);
 assert.equal(r.bestBid,100);assert.equal(r.bestAsk,101);
 assert.equal(r.bidNotional,497);assert.equal(r.askNotional,305);
 assert.equal(r.exchangeTimestamp,null);
 assert.equal(r.sampleScope,'LIMITED_PUBLIC_SNAPSHOT');
 assert.equal(r.calibratedProbability,null);
});
test('Bybit snapshot retains authoritative timestamp',()=>{
 const r=parseDepthSnapshot('bybit','BTCUSDT',bybit,now);
 assert.equal(r.exchangeTimestamp,now-100);
 assert.equal(r.updateId,12);
});
test('crossed books, bad levels and future exchange timestamps rejected',()=>{
 assert.throws(()=>parseDepthSnapshot('binance','BTCUSDT',{...binance,asks:[['99','1']]},now));
 assert.throws(()=>parseDepthSnapshot('binance','BTCUSDT',{...binance,bids:[['100','0']]},now));
 assert.throws(()=>parseDepthSnapshot('bybit','BTCUSDT',{...bybit,result:{...bybit.result,ts:now+90000}},now));
});
test('public GET with fixed host and no credentials',async()=>{
 let request;
 const out=await fetchPublicDepth('binance','BTCUSDT',{now:()=>now,fetchImpl:async (url,opts)=>{
  request={url,opts};return {ok:true,status:200,json:async()=>binance};
 }});
 assert.equal(out.state,'OK');
 assert.ok(request.url.startsWith('https://data-api.binance.vision/api/v3/depth?'));
 assert.deepEqual(request.opts,{method:'GET',signal:undefined,cache:'no-store',credentials:'omit'});
});
test('rate limits are reported, never backfilled by invented snapshots',async()=>{
 const r=await fetchPublicDepth('bybit','BTCUSDT',{fetchImpl:async()=>({status:429,ok:false})});
 assert.equal(r.state,'RATE_LIMITED');assert.equal(r.data,null);
});
test('invalid symbol rejects before network access',async()=>{
 const r=await fetchPublicDepth('binance','BTCUSDT&key=abc',{fetchImpl:()=>{throw Error('must not call network')}});
 assert.equal(r.state,'INVALID');assert.equal(r.data,null);
});
test('network exception reported as OFFLINE',async()=>{
 const r=await fetchPublicDepth('binance','BTCUSDT',{fetchImpl:async()=>{throw Error('blocked')}});
 assert.equal(r.state,'OFFLINE');assert.equal(r.data,null);
});

test('Bybit response-level exchange timestamp overrides snapshot fallback',()=>{
 const r=parseDepthSnapshot('bybit','BTCUSDT',{...bybit,ts:now-200},now);
 assert.equal(r.exchangeTimestamp,now-200);
});
test('stale Bybit timestamp is rejected rather than appearing fresh',()=>{
 assert.throws(()=>parseDepthSnapshot('bybit','BTCUSDT',{...bybit,ts:now-500000},now),/stale/);
});
test('Bybit business-level rate limit is not mistaken for an available book',async()=>{
 const r=await fetchPublicDepth('bybit','BTCUSDT',{fetchImpl:async()=>({
  ok:true,status:200,json:async()=>({retCode:10006,retMsg:'Too many requests'})
 })});
 assert.equal(r.state,'RATE_LIMITED');assert.equal(r.data,null);
});

test('largest visible price buckets are bounded by side and source median',()=>{
 const r=parseDepthSnapshot('binance','BTCUSDT',{
  lastUpdateId:13,
  bids:[['100','1'],['99','1'],['98','8'],['97','2']],
  asks:[['101','1'],['102','3'],['103','1']]
 },now);
 assert.equal(r.levelSelection,'TOP_8_NOTIONAL_PER_SIDE');
 assert.equal(r.topVisibleLevels.length,7);
 const bigBid=r.topVisibleLevels.find(x=>x.side==='BID'&&x.price===98);
 assert.ok(bigBid);
 assert.equal(bigBid.notional,784);
 assert.ok(bigBid.relativeToMedian>3);
 assert.ok(r.topVisibleLevels.every(x=>
   ['BID','ASK'].includes(x.side)&&x.quantity>0&&x.notional>0));
 assert.equal(r.calibratedProbability,null);
});
test('large source depth cannot overflow the bounded level snapshot',()=>{
 const bids=Array.from({length:100},(_,i)=>[String(100-i*.01),'1']);
 const asks=Array.from({length:100},(_,i)=>[String(101+i*.01),'1']);
 const r=parseDepthSnapshot('binance','BTCUSDT',{bids,asks,lastUpdateId:15},now);
 assert.equal(r.topVisibleLevels.length,16);
 assert.equal(r.topVisibleLevels.filter(x=>x.side==='BID').length,8);
 assert.equal(r.topVisibleLevels.filter(x=>x.side==='ASK').length,8);
});
