import test from 'node:test';
import assert from 'node:assert/strict';
import {createRadarObservation,validateRadarObservation,compareRadarObservations,
 mergeRadarObservation,readRadarChanges,saveRadarChanges,
 RADAR_CHANGE_STORE_KEY,radarChangeCount} from './radar-changes.mjs';
import {filterRadarRows,describeRadarFrame} from './radar-core.mjs';
import {compareMarketFrames,MARKET_FRAMES} from './market-core.mjs';

const step=3600000;
const candle=Math.floor(1800000000000/step)*step-1;
const frame=(at,other={})=>({
 status:'OK',interval:'1h',lastClosedAt:at,source:'Binance Spot',
 direction:'UP',mode:'RANGE',velocityPctPerBar:.2,
 accelerationPctPerBar2:.11,volumeRatio:1.2,...other
});
const row=(at,other={})=>({
 symbol:'ETHUSDT',analysis:describeRadarFrame(frame(at,other))
});
const make=(at,other={})=>createRadarObservation(row(at,other),'1h',{now:at+60000});
const mockStorage=()=>{
 const map=new Map();
 return {getItem:key=>map.get(key)||null,setItem:(key,value)=>map.set(key,value)};
};

test('record only complete valid H1 bars with exact native source and clock',()=>{
 const valid=make(candle);
 assert.ok(valid);
 assert.equal(valid.source,'Binance Spot');
 assert.equal(valid.candleAt,candle);
 assert.equal(valid.direction,'UP');
 assert.equal(valid.mode,'RANGE');
 assert.equal(validateRadarObservation(valid),true);
 assert.equal(validateRadarObservation({...valid,source:'approximation'}),false);
 assert.equal(validateRadarObservation({...valid,candleAt:candle-100}),false);
 assert.equal(validateRadarObservation({...valid,observedAt:candle+4*step}),false);
 assert.equal(validateRadarObservation({...valid,movement:Infinity}),false);
 assert.equal(createRadarObservation(
  {symbol:'ETHUSDT',analysis:describeRadarFrame({...frame(candle),status:'STALE'})},
  '1h',{now:candle+60000}),null);
 assert.equal(createRadarObservation(row(candle),'5m',{now:candle+60000}),null);
});

test('baseline and same candle are never fabricated as a new change',()=>{
 const earlier=make(candle-step);
 const later=make(candle);
 assert.equal(compareRadarObservations(null,later).state,'BASELINE');
 assert.equal(compareRadarObservations(earlier,earlier).state,'SAME_CANDLE');
 assert.equal(compareRadarObservations(later,earlier).state,'OLDER_CANDLE');
 const store={};
 assert.equal(mergeRadarObservation(store,earlier).state,'BASELINE');
 const repeated=mergeRadarObservation(store,{...earlier,observedAt:earlier.observedAt+60000});
 assert.equal(repeated.state,'BASELINE');
 assert.equal(store['ETHUSDT|1h'].latest.candleAt,earlier.candleAt);
});

test('changes require new closed bars, verified direction and regime transitions',()=>{
 const before=make(candle-step);
 const after=make(candle,{direction:'DOWN',mode:'DIRECTIONAL',
  velocityPctPerBar:-.6,accelerationPctPerBar2:-.12,volumeRatio:2.1});
 const result=compareRadarObservations(before,after);
 assert.equal(result.state,'CHANGED');
 assert.equal(result.span,1);
 assert.equal(result.beforeAt,before.candleAt);
 assert.deepEqual(result.events.map(x=>x.kind),
  ['DIRECTION','MODE','SPEED_UP','VOLUME_UP']);
 const stable=compareRadarObservations(before,make(candle));
 assert.equal(stable.state,'STABLE');
 assert.deepEqual(stable.events,[]);
});
test('missing eight-plus candle path cannot claim exact sequence of changes',()=>{
 const old=make(candle-9*step);
 const fresh=make(candle,{direction:'DOWN',mode:'DIRECTIONAL'});
 assert.equal(compareRadarObservations(old,fresh).state,'GAP');
 assert.deepEqual(compareRadarObservations(old,fresh).events,[]);
 const forged={...fresh,symbol:'XRPUSDT'};
 assert.equal(compareRadarObservations(old,forged).state,'INCOMPARABLE');
});
test('history survives restart, keeps prior comparison when same candle repeats',()=>{
 const store=mockStorage();
 const a=make(candle-step);
 const b=make(candle,{direction:'DOWN',velocityPctPerBar:-.5});
 const records={};
 mergeRadarObservation(records,a);
 assert.equal(mergeRadarObservation(records,b).state,'CHANGED');
 assert.equal(saveRadarChanges(store,records),true);
 assert.ok(store.getItem(RADAR_CHANGE_STORE_KEY));
 const reopened=readRadarChanges(store);
 assert.ok(reopened['ETHUSDT|1h']);
 const still=mergeRadarObservation(reopened,{...b,observedAt:b.observedAt+30000});
 assert.equal(still.state,'CHANGED');
 assert.equal(reopened['ETHUSDT|1h'].latest.observedAt,b.observedAt);
 assert.equal(radarChangeCount([{change:still},{change:{state:'BASELINE'}}]),1);
});
test('untrusted local history and storage failures cannot add fabricated records',()=>{
 const storage=mockStorage();
 storage.setItem(RADAR_CHANGE_STORE_KEY,'{broken');
 assert.deepEqual(readRadarChanges(storage),{});
 storage.setItem(RADAR_CHANGE_STORE_KEY,JSON.stringify({
  version:1,records:[{latest:{symbol:'ETHUSDT',version:1}}]}));
 assert.deepEqual(readRadarChanges(storage),{});
 assert.equal(saveRadarChanges({setItem(){throw Error('blocked');}},{}),false);
 assert.deepEqual(readRadarChanges({getItem(){throw Error('blocked');}}),{});
});
test('changed-only filter uses actual two-candle event state',()=>{
 const clean={symbol:'ETHUSDT',quoteVolume:300,analysis:{state:'OK',direction:'UP',mode:'RANGE'},
  change:{state:'BASELINE',events:[]}};
 const modified={symbol:'BTCUSDT',quoteVolume:100,analysis:{state:'OK',direction:'DOWN',mode:'MIXED'},
  change:{state:'CHANGED',events:[{kind:'DIRECTION'}]}};
 assert.deepEqual(filterRadarRows([clean,modified],{filter:'events'}).map(x=>x.symbol),['BTCUSDT']);
 assert.deepEqual(filterRadarRows([clean,modified],{sort:'events'}).map(x=>x.symbol),
  ['BTCUSDT','ETHUSDT']);
});
test('timeframe agreement works only for actual OK directional histories',()=>{
 const frames={};
 for(const interval of MARKET_FRAMES){
  frames[interval]={asset:'ETHUSDT',interval,state:'OFFLINE',summary:null};
 }
 frames['1h']={asset:'ETHUSDT',interval:'1h',state:'OK',
  summary:{status:'OK',interval:'1h',direction:'UP',mode:'DIRECTIONAL'}};
 frames['4h']={asset:'ETHUSDT',interval:'4h',state:'OK',
  summary:{status:'OK',interval:'4h',direction:'DOWN',mode:'RANGE'}};
 let checked=compareMarketFrames(frames,{asset:'ETHUSDT'});
 assert.equal(checked.state,'DIVERGENT');
 assert.equal(checked.available,2);
 frames['4h'].state='STALE';
 checked=compareMarketFrames(frames,{asset:'ETHUSDT'});
 assert.equal(checked.available,1);
 assert.equal(checked.state,'INSUFFICIENT');
});
