import test from 'node:test';
import assert from 'node:assert/strict';
import {matrixFromNativeRadar,createMarketMatrixCache} from './market-matrix-cache.mjs';
import {radarExpectedClose} from './radar-auto-policy.mjs';
import {compareMarketFrames} from './market-core.mjs';
const now=Date.UTC(2026,10,10,12,30,31);
const mem=()=>{const data=new Map();return{
 getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)
}};
function observation(asset,frame,at=now){
 return {version:1,symbol:asset,interval:frame,
  candleAt:radarExpectedClose(frame,at),observedAt:at,
  direction:'UP',mode:'DIRECTIONAL',movement:.12,acceleration:.02,
  volumeRatio:1.3,source:'Binance Spot'};
}
test('actual native completed-candle records fill four timeframes at once',()=>{
 const native={native:true,records:['15m','1h','4h','1d'].map(frame=>({
  latest:observation('AVAXUSDT',frame)}))};
 const frames=matrixFromNativeRadar(native,'AVAXUSDT',{now});
 assert.deepEqual(Object.keys(frames),['15m','1h','4h','1d']);
 assert.equal(compareMarketFrames(frames,{asset:'AVAXUSDT'}).available,4);
 assert.equal(compareMarketFrames(frames,{asset:'AVAXUSDT'}).state,'UP_CONTEXT');
});
test('a different asset, invalid source or missing future candle is never fresh',()=>{
 const old=observation('AVAXUSDT','15m',now-15*60000);
 const sourceWrong={...observation('BTCUSDT','1h'),source:'Fake prices'};
 const native={native:true,records:[{latest:old},{latest:sourceWrong}]};
 const frames=matrixFromNativeRadar(native,'AVAXUSDT',{now});
 assert.equal(frames['15m'].state,'CACHE');
 assert.equal(frames['1h'],undefined);
 assert.deepEqual(matrixFromNativeRadar(native,'ETHUSDT',{now}),{});
 assert.deepEqual(matrixFromNativeRadar({native:false,records:[{latest:old}]},
  'AVAXUSDT',{now}),{});
});
test('verified matrix persists by asset but reopens explicitly as historical cache',()=>{
 const storage=mem();const input={
  '15m':{asset:'AVAXUSDT',interval:'15m',state:'OK',
   summary:{status:'OK',direction:'DOWN',mode:'MIXED',
    lastClosedAt:radarExpectedClose('15m',now)}},
  '1h':{asset:'AVAXUSDT',interval:'1h',state:'OK',
   summary:{status:'OK',direction:'DOWN',mode:'RANGE',
    lastClosedAt:radarExpectedClose('1h',now)}}
 };
 const cache=createMarketMatrixCache({storage,now:()=>now});
 assert.equal(cache.save('AVAXUSDT',input),true);
 const reread=createMarketMatrixCache({storage,now:()=>now+3*60000});
 const rows=reread.read('AVAXUSDT').frames;
 assert.equal(rows['15m'].state,'CACHE');
 assert.equal(rows['15m'].summary.direction,'DOWN');
 assert.equal(compareMarketFrames(rows,{asset:'AVAXUSDT'}).available,0);
 assert.equal(reread.read('BTCUSDT'),null);
});
test('corrupt, expired and fabricated matrix entries are excluded',()=>{
 const storage=mem();const clock=now;
 const cache=createMarketMatrixCache({storage,now:()=>clock});
 assert.equal(cache.save('ETHUSDT',{
  '15m':{asset:'SOLUSDT',interval:'15m',state:'OK',
   summary:{direction:'UP',mode:'RANGE',lastClosedAt:now}}
 }),false);
 assert.equal(cache.read('ETHUSDT'),null);
 assert.equal(cache.save('SOLUSDT',{
  '15m':{asset:'SOLUSDT',interval:'15m',state:'OK',
   summary:{direction:'UP',mode:'RANGE',
    lastClosedAt:radarExpectedClose('15m',now)}}
 }),true);
 const old=createMarketMatrixCache({storage,now:()=>now+8*86400000});
 assert.equal(old.read('SOLUSDT'),null);
});
