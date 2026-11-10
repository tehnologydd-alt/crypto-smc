import test from 'node:test';
import assert from 'node:assert/strict';
import {selectRadarAutoFrame,radarExpectedClose,radarFavoriteSignature,
 readRadarAutoCheckpoints,writeRadarAutoCheckpoint,markRadarAutoFailure,RADAR_AUTO_FRAMES
} from './radar-auto-policy.mjs';
import {createRadarDisplayCache,radarRowFromHistory} from './radar-display-cache.mjs';
import {mergeRadarObservation,createRadarObservation,
 readRadarChanges,saveRadarChanges} from './radar-changes.mjs';
const mem=()=>{const data=new Map();return{
 getItem:key=>data.get(key)||null,setItem:(key,val)=>data.set(key,val)
}};
const NOW=Date.UTC(2026,10,10,12,30);
const frame='15m',step=900000;
const closed=Math.floor(NOW/step)*step-1;
const observation=(symbol,at,now=at+31000,opts={})=>
 ({version:1,symbol,interval:'15m',candleAt:at,observedAt:now,
 direction:'UP',mode:'RANGE',movement:.23,acceleration:.04,
 volumeRatio:1.2,source:'Binance Spot',...opts});
test('M15/H1/H4/D1 schedule independently by actual completed candle boundary',()=>{
 assert.deepEqual(RADAR_AUTO_FRAMES,['15m','1h','4h','1d']);
 assert.equal(radarExpectedClose('15m',NOW+31000),closed);
 assert.equal(radarExpectedClose('15m',NOW+1000),closed-step);
 assert.equal(radarExpectedClose('1h',NOW+31000),
  Date.UTC(2026,10,10,11,59,59,999));
 assert.equal(radarExpectedClose('5m',NOW),null);
});
test('only favorites scheduled, all frames progress once per close',()=>{
 const storage=mem(),marks=readRadarAutoCheckpoints(storage);
 const favorites=['ETHUSDT','BTCUSDT','ETHUSDT'];
 assert.equal(radarFavoriteSignature(favorites),'BTCUSDT,ETHUSDT');
 assert.equal(selectRadarAutoFrame([],marks,{now:NOW}).state,'NO_FAVORITES');
 for(const expected of RADAR_AUTO_FRAMES){
  const next=selectRadarAutoFrame(favorites,marks,{now:NOW+31000});
  assert.equal(next.frame,expected);
  assert.equal(writeRadarAutoCheckpoint(storage,marks,next,NOW+31000),true);
 }
 assert.equal(selectRadarAutoFrame(favorites,marks,{now:NOW+31000}).state,'CURRENT');
 assert.equal(readRadarAutoCheckpoints(storage)['15m'].signature,'BTCUSDT,ETHUSDT');
 const newClose=selectRadarAutoFrame(favorites,marks,{now:NOW+step+31000});
 assert.equal(newClose.frame,'15m');
 assert.equal(selectRadarAutoFrame(['BTCUSDT'],marks,{now:NOW+31000}).frame,'15m');
});
test('cache uses only verified old observations and keeps prior genuine changes',()=>{
 const storage=mem(),cache=createRadarDisplayCache({storage,now:()=>NOW+35000});
 const old=observation('BTCUSDT',closed-step,closed-step+31000);
 const latest=observation('BTCUSDT',closed,NOW+31000,
  {direction:'DOWN',mode:'DIRECTIONAL',movement:-.45});
 const records={};
 mergeRadarObservation(records,old);
 assert.equal(mergeRadarObservation(records,latest).state,'CHANGED');
 assert.equal(saveRadarChanges(storage,records),true);
 assert.equal(cache.save('15m',Object.values(records)),true);
 const restored=createRadarDisplayCache({storage,now:()=>NOW+60000});
 const value=restored.read('15m',['BTCUSDT','SOLUSDT']);
 assert.equal(value.length,1);
 assert.equal(value[0].symbol,'BTCUSDT');
 assert.equal(value[0].saved,true);
 assert.equal(value[0].change.state,'CHANGED');
 assert.equal(restored.read('15m',['ETHUSDT']).length,0);
 assert.equal(restored.read('1h',['BTCUSDT']).length,0);
 assert.equal(readRadarChanges(storage)['BTCUSDT|15m'].latest.candleAt,closed);
});
test('cache rejects invalid or fabricated source records',()=>{
 const storage=mem(),cache=createRadarDisplayCache({storage,now:()=>NOW});
 const bad={...observation('BTCUSDT',closed),source:'untrusted'};
 assert.equal(radarRowFromHistory(bad),null);
 assert.equal(cache.save('15m',[{latest:bad}]),false);
 assert.deepEqual(cache.read('15m',['BTCUSDT']),[]);
});
test('native history is historical, and must not invent current-candle events',()=>{
 const earlier=observation('ETHUSDT',closed-step,closed-step+31000);
 const later=observation('ETHUSDT',closed,NOW+31000,
  {direction:'DOWN'});
 const row=radarRowFromHistory(later,earlier);
 assert.equal(row.change.state,'CHANGED');
 assert.equal(row.analysis.lastClosedAt,closed);
 assert.equal(row.saved,true);
});

test('a failed source check allows just one delayed retry, not repeated polling',()=>{
 const storage=mem(),marks={},assets=['BTCUSDT'],at=NOW+31000;
 const plan=selectRadarAutoFrame(assets,marks,{now:at});
 assert.equal(plan.state,'DUE');
 writeRadarAutoCheckpoint(storage,marks,plan,at);
 assert.equal(markRadarAutoFailure(storage,marks,plan,at),true);
 assert.notEqual(selectRadarAutoFrame(assets,marks,{now:at+60000}).frame,plan.frame);
 const retry=selectRadarAutoFrame(assets,marks,{now:at+11*60000});
 assert.equal(retry.frame,plan.frame);
 writeRadarAutoCheckpoint(storage,marks,retry,at+11*60000);
 markRadarAutoFailure(storage,marks,retry,at+11*60000);
 assert.equal(selectRadarAutoFrame(assets,marks,{now:at+12*60000}).frame===plan.frame,false);
 assert.equal(selectRadarAutoFrame(assets,marks,{now:at+16*60000}).frame,plan.frame);
 // Above switch is a genuinely NEW M15 close, rather than a third retry.
 assert.notEqual(selectRadarAutoFrame(assets,marks,{now:at+16*60000}).close,plan.close);
});
