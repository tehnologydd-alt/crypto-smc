import test from 'node:test';
import assert from 'node:assert/strict';
import {getMobileStatus,getMobileHistory,saveMobileSnapshot,setMobileSettings,getMobileCandles,saveMobileCandles,getMobileAssetResearchForecasts,getMobileAssetResearchArchive,getMobileCandleArchive ,getMobileOnChainHistory,saveMobileOnChainObservation} from './mobile-bridge.mjs';
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

test('archive pages over 75 without mixing assets or repeating timestamps',async()=>{
 const history=Array.from({length:5},(_,i)=>({
  id:'f'+(5-i),asset:'BTCUSDT',publishedAt:5000-i*1000
 }));
 const calls=[];
 globalThis.window={Capacitor:{Plugins:{ApexNative:{
  getResearchForecasts:async ({asset,offset,limit})=>{
   calls.push({asset,offset,limit});
   return {asset,assetScoped:true,offset,
    publishedCount:5,evaluatedCount:3,
    forecasts:history.slice(offset,offset+limit)};
  }
 }}}};
 const result=await getMobileAssetResearchArchive('BTCUSDT',{pageSize:2});
 assert.deepEqual(calls.map(x=>x.offset),[0,2,4]);
 assert.equal(result.complete,true);
 assert.equal(result.publishedCount,5);
 assert.equal(result.forecasts.length,5);
 assert.deepEqual(result.forecasts.map(x=>x.id),['f5','f4','f3','f2','f1']);
 globalThis.window=originalWindow;
});
test('bounded journal correctly reports incomplete evidence above archive cap',async()=>{
 const history=Array.from({length:5},(_,i)=>({
  id:'f'+(5-i),asset:'BTCUSDT',publishedAt:5000-i*1000
 }));
 globalThis.window={Capacitor:{Plugins:{ApexNative:{
  getResearchForecasts:async ({asset,offset,limit})=>({
   asset,assetScoped:true,offset,publishedCount:5,evaluatedCount:3,
   forecasts:history.slice(offset,offset+limit)})
 }}}};
 const result=await getMobileAssetResearchArchive('BTCUSDT',{pageSize:2,maxRows:3});
 assert.equal(result.complete,false);
 assert.equal(result.publishedCount,5);
 assert.equal(result.forecasts.length,3);
 globalThis.window=originalWindow;
});
test('native journal changes mid-pagination and fails closed without partial rows',async()=>{
 globalThis.window={Capacitor:{Plugins:{ApexNative:{
  getResearchForecasts:async ({asset,offset})=>({
   asset,assetScoped:true,offset,
   publishedCount:offset?4:3,evaluatedCount:1,
   forecasts:offset?[{id:'f1',asset,publishedAt:1000}]:[
    {id:'f3',asset,publishedAt:3000},
    {id:'f2',asset,publishedAt:2000}]})
 }}}};
 const result=await getMobileAssetResearchArchive('BTCUSDT',{pageSize:2});
 assert.equal(result.complete,false);
 assert.equal(result.forecasts.length,0);
 assert.match(result.error,/изменился/);
 globalThis.window=originalWindow;
});
test('old native plugin without page offset cannot claim complete archive',async()=>{
 globalThis.window={Capacitor:{Plugins:{ApexNative:{
  getResearchForecasts:async ({asset})=>({
   asset,assetScoped:true,publishedCount:1,evaluatedCount:0,
   forecasts:[{id:'f',asset,publishedAt:1000}]})
 }}}};
 const result=await getMobileAssetResearchArchive('BTCUSDT');
 assert.equal(result.complete,false);
 assert.match(result.error,/обновление Android/);
 globalThis.window=originalWindow;
});
test('candle archive assembles actual past pages in chronological order',async()=>{
 const H=3600000;
 const bars=[1,2,4,5].map(i=>({
  t:i*H,closeAt:(i+1)*H-1,open:100,high:105,low:95,
  close:101,volume:10,closed:true
 }));
 const calls=[];
 globalThis.window={Capacitor:{Plugins:{ApexNative:{
  getCandles:async ({asset,interval,offset,limit})=>{
   calls.push(offset);
   return {asset,interval,offset,totalCount:4,
    candles:bars.slice().reverse().slice(offset,offset+limit).reverse()};
  }
 }}}};
 const r=await getMobileCandleArchive('BTCUSDT','1h',{pageSize:2});
 assert.deepEqual(calls,[0,2]);
 assert.equal(r.complete,true);
 assert.deepEqual(r.candles.map(x=>x.t),[H,2*H,4*H,5*H]);
 assert.equal(r.candles[2].t-r.candles[1].t,2*H);
 globalThis.window=originalWindow;
});
test('candle archive detects repeated bars across page boundary',async()=>{
 const H=3600000;
 const bar=t=>({t,closeAt:t+H-1,open:100,high:105,
  low:95,close:101,volume:10,closed:true});
 let request=0;
 globalThis.window={Capacitor:{Plugins:{ApexNative:{
  getCandles:async({asset,interval,offset})=>{
   request++;
   return {asset,interval,offset,totalCount:4,
    candles:offset?[bar(3*H),bar(2*H)]:[bar(3*H),bar(4*H)]};
  }
 }}}};
 const r=await getMobileCandleArchive('BTCUSDT','1h',{pageSize:2});
 assert.equal(request,2);
 assert.equal(r.candles.length,0);
 assert.match(r.error,/повторная|порядок/);
 globalThis.window=originalWindow;
});

test('settings bridge has explicit notification and keep-awake options',async()=>{
 const args={keepScreenOn:true,forecastAlertsEnabled:true,alertStop:false};
 let saved=null;
 globalThis.window={Capacitor:{Plugins:{ApexNative:{
  setSettings:async data=>{saved=data;return data;}
 },LocalNotifications:{requestPermissions:async()=>({display:'granted'})}}}};
 const result=await setMobileSettings(args);
 assert.equal(result.keepScreenOn,true);
 assert.deepEqual(saved,args);
 const {requestMobileForecastNotificationPermission}=await import('./mobile-bridge.mjs');
 assert.equal((await requestMobileForecastNotificationPermission()).granted,true);
 globalThis.window=originalWindow;
});
