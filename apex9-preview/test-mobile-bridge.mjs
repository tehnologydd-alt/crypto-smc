import test from 'node:test';
import assert from 'node:assert/strict';
import {getMobileStatus,getMobileHistory,saveMobileSnapshot,setMobileSettings} from './mobile-bridge.mjs';
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
