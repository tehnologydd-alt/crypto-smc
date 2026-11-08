import test from 'node:test';
import assert from 'node:assert/strict';
import {planHistoricalH1Repair,checkHistoricalH1Chunk,
 HISTORICAL_REPAIR_STEP} from './historical-repair.mjs';
import {repairMobileH1Archive} from './mobile-bridge.mjs';
const originalWindow=globalThis.window;
const H=HISTORICAL_REPAIR_STEP;
const now=1800000030000;

test('fixed 30, 90 and 180 day plans contain only past aligned H1 windows',()=>{
 for(const days of [30,90,180]){
  const p=planHistoricalH1Repair('TONUSDT',days,{now});
  assert.equal(p.state,'READY');
  assert.equal(p.expectedBars,days*24);
  assert.equal(p.windows.length,Math.ceil(days*24/240));
  assert.ok(p.windows.every(x=>x.bars>=1&&x.bars<=240));
  assert.equal(p.windows[0].startTime,p.startTime);
  assert.equal(p.windows.at(-1).endExclusive,p.endExclusive);
  assert.equal(p.endExclusive,Math.floor(now/H)*H);
  for(let i=1;i<p.windows.length;i++)
   assert.equal(p.windows[i].startTime,p.windows[i-1].endExclusive);
 }
});
test('invalid assets, windows and unapproved days are rejected',()=>{
 for(const symbol of ['btcusdt','BTC!USDT','BTCUSDT;DELETE']){
  assert.equal(planHistoricalH1Repair(symbol,30,{now}).state,'INVALID');
 }
 assert.equal(planHistoricalH1Repair('BTCUSDT',7,{now}).state,'INVALID');
 assert.equal(planHistoricalH1Repair('BTCUSDT',90,{now:0}).state,'INVALID');
});
test('source response cannot claim mismatched totals or source',()=>{
 const window=planHistoricalH1Repair('BTCUSDT',30,{now}).windows[0];
 const source={...window,state:'VERIFIED',added:120,existing:120,source:'BINANCE_SPOT_H1'};
 assert.equal(checkHistoricalH1Chunk(window,{...source,bars:240}).state,'OK');
 assert.equal(checkHistoricalH1Chunk(window,{...source,bars:239}).state,'INVALID');
 assert.equal(checkHistoricalH1Chunk(window,{...source,bars:240,added:241}).state,'INVALID');
 assert.equal(checkHistoricalH1Chunk(window,{...source,bars:240,source:'UNKNOWN'}).state,'INVALID');
 assert.equal(checkHistoricalH1Chunk(window,{...source,bars:240,asset:'ETHUSDT'}).state,'INVALID');
});
test('successful on-demand repair uses three sequential verified native chunks',async()=>{
 const calls=[],progress=[];
 globalThis.window={Capacitor:{Plugins:{ApexNative:{
  repairHistoricalH1:async args=>{
   calls.push(args);
   return {...args,bars:(args.endExclusive-args.startTime)/H,
    state:calls.length===2?'ALREADY_STORED':'VERIFIED',
    added:calls.length===2?0:240,
    existing:calls.length===2?240:0,
    source:calls.length===2?'LOCAL_ROOM_CACHE':'BINANCE_SPOT_H1'};
  }
 }}}};
 const result=await repairMobileH1Archive('BTCUSDT',{
  days:30,now,onProgress:r=>progress.push(r)
 });
 assert.equal(result.state,'COMPLETE');
 assert.equal(calls.length,3);
 assert.equal(result.added,480);
 assert.equal(result.existing,240);
 assert.deepEqual(progress.map(p=>p.processed),[1,2,3]);
 globalThis.window=originalWindow;
});
test('stop after first chunk leaves verified source data intact',async()=>{
 let stop=false;
 globalThis.window={Capacitor:{Plugins:{ApexNative:{
  repairHistoricalH1:async args=>({
   ...args,bars:(args.endExclusive-args.startTime)/H,
   state:'VERIFIED',source:'BINANCE_SPOT_H1',added:240,existing:0})
 }}}};
 const result=await repairMobileH1Archive('BTCUSDT',{
  days:30,now,shouldStop:()=>stop,onProgress:()=>{stop=true;}
 });
 assert.equal(result.state,'CANCELLED');
 assert.equal(result.processed,1);
 assert.equal(result.added,240);
 globalThis.window=originalWindow;
});
test('provider rate limit halts without claiming a full archive',async()=>{
 let called=0;
 globalThis.window={Capacitor:{Plugins:{ApexNative:{
  repairHistoricalH1:async args=>{
   called++;
   if(called===2)throw Error('Binance ограничил запросы (HTTP 429)');
   return {...args,bars:240,state:'VERIFIED',
    source:'BINANCE_SPOT_H1',added:240,existing:0};
  }
 }}}};
 const result=await repairMobileH1Archive('BTCUSDT',{days:30,now});
 assert.equal(result.state,'ERROR');
 assert.equal(result.processed,1);
 assert.equal(result.added,240);
 assert.equal(called,2);
 assert.match(result.error,/429/);
 globalThis.window=originalWindow;
});
test('web preview and old Android version cannot claim any historical repair',async()=>{
 delete globalThis.window;
 assert.equal((await repairMobileH1Archive('BTCUSDT',{days:30,now})).state,'UNSUPPORTED');
 globalThis.window={Capacitor:{Plugins:{ApexNative:{}}}};
 assert.equal((await repairMobileH1Archive('BTCUSDT',{days:30,now})).state,'UNSUPPORTED');
 globalThis.window=originalWindow;
});
