import test from 'node:test';
import assert from 'node:assert/strict';
import {getMobileStatus,getMobileHistory,saveMobileSnapshot,setMobileSettings,getMobileCandles,saveMobileCandles,getMobileAssetResearchForecasts ,getMobileOnChainHistory,saveMobileOnChainObservation} from './mobile-bridge.mjs';
const originalWindow=globalThis.window;
test('web preview does not invent native persistence',async()=>{
 delete globalThis.window;
 const r=await getMobileStatus();
 assert.equal(r.native,false);
 assert.equal((await saveMobileSnapshot({symbol:'BTCUSDT'})).saved,0);
 assert.equal((await getMobileHistory('BTCUSDT')).observations.length,0);
 await assert.rejects(()=>setMobileSettings({asset:'BTCUSDT'}));
 globalThis.window=originalWindow;
});
test('native bridge stores only real ticker and depth metadata',async()=>{
 const records=[];
 globalThis.window={Capacitor:{Plugins:{ApexNative:{
  saveObservation:async options=>{records.push(options);return {saved:true};},
  getStatus:async()=>({native:true,observationCount:records.length,forecastCount:0,
    asset:'BTCUSDT',backgroundSyncEnabled:false,latestObservationAt:0}),
  getObservations:async()=>({observations:records}),
  setSettings:async options=>options
 }}}};
 const snapshot={symbol:'BTCUSDT',collectedAt:1700000000000,
  ticker:{scope:'24H_SPOT_SNAPSHOT',observedAt:1699999999000,price:500,changePercent:2,quoteVolume:900},
  depth:[{sampleScope:'LIMITED_PUBLIC_SNAPSHOT',venue:'binance',receivedAt:1700000000000,
   bestBid:499,bestAsk:501,spreadBps:40,visibleDepthImbalance:.1}]};
 const result=await saveMobileSnapshot(snapshot);
 assert.equal(result.saved,2);
 assert.deepEqual(records.map(x=>x.kind),['market','liquidity']);
 assert.equal(JSON.parse(records[0].payload).price,500);
 assert.equal((await getMobileStatus()).observationCount,2);
 assert.equal((await getMobileHistory('BTCUSDT')).observations.length,2);
 assert.equal((await setMobileSettings({asset:'BTCUSDT',backgroundSyncEnabled:true})).backgroundSyncEnabled,true);
 globalThis.window=originalWindow;
});
test('failed source snapshot creates no stored evidence',async()=>{
 const records=[];
 globalThis.window={Capacitor:{Plugins:{ApexNative:{saveObservation:async item=>{
  records.push(item);return {saved:true};
 }}}}};
 const result=await saveMobileSnapshot({symbol:'GRAMUSDT',collectedAt:Date.now(),ticker:null,depth:[]});
 assert.equal(result.saved,0);
 assert.equal(records.length,0);
 globalThis.window=originalWindow;
});

test('native candle history persists closed observations only and reads cached rows',async()=>{
 const rows=[];
 globalThis.window={Capacitor:{Plugins:{ApexNative:{
  saveCandles:async x=>{rows.push(...x.candles);return {saved:x.candles.length};},
  getCandles:async()=>({candles:rows})
 }}}};
 const raw=[
  {t:1000,closeAt:1999,open:100,high:103,low:99,close:102,volume:10,closed:true},
  {t:2000,closeAt:2999,open:102,high:107,low:102,close:106,volume:20,closed:false}
 ];
 const result=await saveMobileCandles('BTCUSDT','1h',raw);
 assert.equal(result.saved,1);
 assert.equal(rows.length,1);
 const read=await getMobileCandles('BTCUSDT','1h');
 assert.equal(read.candles.length,1);
 assert.equal(read.source,'LOCAL_ROOM_CACHE');
 globalThis.window=originalWindow;
});

test('network evidence persists only from completed provider observations',async()=>{
 const saves=[],history=[];
 globalThis.window={Capacitor:{Plugins:{ApexNative:{
  saveObservation:async item=>{saves.push(item);history.push({...item,payload:item.payload});
   return {saved:true};},
  getOnChainHistory:async()=>({rows:history})
 }}}};
 const captured=1794139200000;
 const data={scope:'BITCOIN_NETWORK_OBSERVATION',chain:'bitcoin',
  provider:'mempool.space',observedAt:captured,collectedAt:captured,
  mempoolCount:1200,mempoolVBytes:43000,mempoolFeesSats:2000,
  notDirectionalEvidence:true};
 const persisted=await saveMobileOnChainObservation('BTCUSDT',{
  state:'OK',chain:'bitcoin',data
 });
 assert.equal(persisted.saved,true);
 assert.equal(saves[0].kind,'onchain');
 assert.equal(saves[0].source,'mempool:bitcoin:network');
 const got=await getMobileOnChainHistory('BTCUSDT');
 assert.equal(got.source,'LOCAL_ROOM_NETWORK_HISTORY');
 assert.equal(got.rows.length,1);
 const bad=await saveMobileOnChainObservation('BTCUSDT',{state:'OFFLINE',data:null});
 assert.equal(bad.saved,false);
 assert.equal(saves.length,1);
 globalThis.window=originalWindow;
});

test('asset journal requests one asset even when global journal is crowded',async()=>{
 const calls=[];
 globalThis.window={Capacitor:{Plugins:{ApexNative:{
  getResearchForecasts:async options=>{
   calls.push(options);
   return {assetScoped:true,asset:options.asset,publishedCount:2,
    evaluatedCount:1,forecasts:[
     {id:'a',asset:'BTCUSDT'},{id:'b',asset:'BTCUSDT'}]};
  }
 }}}};
 const r=await getMobileAssetResearchForecasts('BTCUSDT',75);
 assert.deepEqual(calls,[{asset:'BTCUSDT',limit:75}]);
 assert.equal(r.native,true);
 assert.equal(r.assetScoped,true);
 assert.equal(r.complete,true);
 assert.equal(r.publishedCount,2);
 assert.equal(r.evaluatedCount,1);
 globalThis.window=originalWindow;
});
test('75 selected-asset rows cannot impersonate a complete archive of 85',async()=>{
 globalThis.window={Capacitor:{Plugins:{ApexNative:{
  getResearchForecasts:async()=>({
   assetScoped:true,asset:'TONUSDT',forecasts:[{asset:'TONUSDT'}],
   publishedCount:85,evaluatedCount:74})
 }}}};
 const r=await getMobileAssetResearchForecasts('TONUSDT');
 assert.equal(r.complete,false);
 assert.equal(r.publishedCount,85);
 globalThis.window=originalWindow;
});
test('old Android that ignores asset query fails closed',async()=>{
 globalThis.window={Capacitor:{Plugins:{ApexNative:{
  getResearchForecasts:async()=>({
   forecasts:[{asset:'ETHUSDT'}],publishedCount:100,evaluatedCount:50})
 }}}};
 const r=await getMobileAssetResearchForecasts('BTCUSDT');
 assert.equal(r.assetScoped,false);
 assert.equal(r.publishedCount,null);
 assert.equal(r.forecasts.length,0);
 assert.match(r.error,/Обновите APEX/);
 globalThis.window=originalWindow;
});
test('cross-asset records, contradictory totals and bad assets are rejected',async()=>{
 globalThis.window={Capacitor:{Plugins:{ApexNative:{
  getResearchForecasts:async()=>({
   assetScoped:true,asset:'BTCUSDT',forecasts:[{asset:'ETHUSDT'}],
   publishedCount:1,evaluatedCount:2})
 }}}};
 const r=await getMobileAssetResearchForecasts('BTCUSDT');
 assert.equal(r.complete,false);
 assert.equal(r.publishedCount,null);
 assert.match(r.error,/непроверяемую выборку/);
 assert.match((await getMobileAssetResearchForecasts('ethusdt')).error,/Некорректный актив/);
 globalThis.window=originalWindow;
});
