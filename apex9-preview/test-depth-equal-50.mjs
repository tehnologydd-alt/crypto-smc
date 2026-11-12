import test from 'node:test';
import assert from 'node:assert/strict';
import {fetchPublicDepth,parseDepthSnapshot} from '../updates/v90-market-depth.mjs';
import {selectDepthComparison,needsMatchedRest}
 from './depth-comparison-selector.mjs';
import {synchronizeSpotDepth} from './depth-synchronization.mjs';

const T=Date.UTC(2026,10,11,18,30,0),asset='BTCUSDT';
const rows=(n=50)=>({
 bids:Array.from({length:n},(_,i)=>[String(100-i*0.02),'2','0','1']),
 asks:Array.from({length:n},(_,i)=>[String(100.1+i*0.02),'1','0','1'])
});
const payload=(venue,n=50)=>{
 const data=rows(n);
 return venue==='binance'?{lastUpdateId:123,...data}:
  {code:'0',data:[{...data,ts:String(T-100),seqId:333}]};
};
test('paired REST requests ask BOTH public exchanges for 50 real price levels',async()=>{
 const urls=[];
 const fetchImpl=async url=>{
  urls.push(url);
  return {ok:true,status:200,json:async()=>payload(url.includes('binance')?'binance':'okx')};
 };
 const [b,o]=await Promise.all(['binance','okx'].map(venue=>
  fetchPublicDepth(venue,asset,{fetchImpl,now:()=>T,levelLimit:50})));
 assert.deepEqual([b.state,o.state],['OK','OK']);
 assert.ok(urls.some(x=>x.includes('limit=50')));
 assert.ok(urls.some(x=>x.includes('sz=50')));
 for(const x of [b.data,o.data]){
  assert.equal(x.snapshotLevelsMax,50);
  assert.equal(x.visibleBook.bids.length,50);
  assert.equal(x.visibleBook.asks.length,50);
  assert.equal(x.collectionMethod,'PUBLIC_REST_BOOK_SNAPSHOT');
 }
 const match=selectDepthComparison([],[b.data,o.data],{asset,now:T+250});
 assert.equal(match.method,'PAIRED_REST');
 assert.equal(match.levelsEqual,true);
 assert.equal(match.comparison.state,'SYNCED');
 assert.equal(match.comparison.affectsForecast,false);
 assert.equal(match.comparison.predictive,false);
});
test('pairing refreshes incomparable books only when both REST providers are due',()=>{
 const binance=parseDepthSnapshot('binance',asset,payload('binance',6),T);
 binance.collectionMethod='PUBLIC_WS_BOOK_SNAPSHOT';
 binance.snapshotLevelsMax=20;
 const okxPayload={code:'0',data:[{
  bids:[['100','2'],['99.999','2']],
  asks:[['100.1','2'],['100.101','2']],ts:String(T-100),seqId:123
 }]};
 const okx=parseDepthSnapshot('okx',asset,okxPayload,T+150);
 okx.collectionMethod='PUBLIC_WS_BOOK_SNAPSHOT';
 okx.snapshotLevelsMax=5;
 const live=[binance,okx];
 assert.equal(synchronizeSpotDepth(live,{asset,now:T+200}).state,'INSUFFICIENT_COVERAGE');
 assert.equal(needsMatchedRest(live,{asset,now:T+250,
  due:{binance:true,okx:true}}),true);
 assert.equal(needsMatchedRest(live,{asset,now:T+250,
  due:{binance:true,okx:false}}),false);
 assert.equal(needsMatchedRest(live,{asset,now:T+15000,
  due:{binance:true,okx:true}}),true); // stale books need a fresh pair
 assert.equal(needsMatchedRest(live,{asset:'ETHUSDT',now:T+250,
  due:{binance:true,okx:true}}),false);
});
test('never borrow a stale, cross-asset or unmatched REST snapshot',()=>{
 const binance=parseDepthSnapshot('binance',asset,payload('binance',6),T);
 const okx=parseDepthSnapshot('okx',asset,payload('okx',5),T);
 binance.snapshotLevelsMax=50;okx.snapshotLevelsMax=50;
 assert.equal(selectDepthComparison([], [binance,okx],{asset,now:T+15000})
  .comparison.comparable,false);
 assert.equal(selectDepthComparison([], [binance],{asset,now:T+500})
  .comparison.comparable,false);
 assert.equal(selectDepthComparison([], [binance,{...okx,symbol:'ETHUSDT'}],
  {asset,now:T+500}).comparison.comparable,false);
 const report=selectDepthComparison([binance,okx],[],
  {asset,now:T+500});
 assert.equal(report.method,'CURRENT');
 assert.equal(report.comparison.comparable,true);
});
test('selected asset only, no polling or private API dependencies',async()=>{
 const selector=await import('./depth-comparison-selector.mjs');
 assert.ok(selector.needsMatchedRest&&selector.selectDepthComparison);
});

test('live WS plus fallback REST may request aligned 50/50 when both due',()=>{
 const ws=parseDepthSnapshot('binance',asset,payload('binance',6),T);
 ws.collectionMethod='PUBLIC_WS_BOOK_SNAPSHOT';ws.snapshotLevelsMax=20;
 const rest=parseDepthSnapshot('okx',asset,payload('okx',50),T+150);
 rest.collectionMethod='PUBLIC_REST_BOOK_SNAPSHOT';rest.snapshotLevelsMax=50;
 const due={binance:true,okx:true};
 assert.equal(needsMatchedRest([ws],{asset,now:T+250,due}),true);
 assert.equal(needsMatchedRest([ws,rest],{asset,now:T+250,due}),
  synchronizeSpotDepth([ws,rest],{asset,now:T+250}).state!=='SYNCED');
 assert.equal(needsMatchedRest([],{asset,now:T+250,due}),true);
 assert.equal(needsMatchedRest([ws,{...rest,symbol:'ETHUSDT'}],
  {asset,now:T+250,due}),false);
 assert.equal(needsMatchedRest([ws,rest],{asset,now:T+250,
  due:{binance:true,okx:false}}),false);
});
