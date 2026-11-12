import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeLiquidityHistory,studyVisibleLiquidity} from './liquidity-core.mjs';
const asset='BTCUSDT',now=1700000400000;
function sample(venue='binance',minute=0,{imbalance=.2,spread=10}={}){
 const observedAt=now-120000+minute*60000;
 const mid=1000, bid=mid*(1-spread/20000),ask=mid*(1+spread/20000);
 const bidNotional=1000*(1+imbalance),askNotional=1000*(1-imbalance);
 return {asset,source:venue+':spot:depth',observedAt,
  collectedAt:observedAt+30,payload:JSON.stringify({
   sampleScope:'LIMITED_PUBLIC_SNAPSHOT',bestBid:bid,bestAsk:ask,
   spreadBps:spread,visibleDepthImbalance:imbalance,
   bidNotional,askNotional,bidLevels:100,askLevels:100
  })};
}
test('normalizes only authentic coherent limited public snapshots',()=>{
 const rows=[sample(),sample('bybit'),{...sample(),asset:'ETHUSDT'},{
  ...sample(),payload:'{not valid'
 }];
 const result=normalizeLiquidityHistory(rows,asset);
 assert.equal(result.length,2);
 assert.deepEqual(result.map(x=>x.venue),['binance','bybit']);
});
test('spread and visible-depth totals cannot contradict snapshot fields',()=>{
 const wrong=sample();
 wrong.payload=JSON.stringify({...JSON.parse(wrong.payload),spreadBps:50});
 assert.equal(normalizeLiquidityHistory([wrong],asset).length,0);
 const wrongNotional=sample();
 wrongNotional.payload=JSON.stringify({...JSON.parse(wrongNotional.payload),bidNotional:10});
 assert.equal(normalizeLiquidityHistory([wrongNotional],asset).length,0);
});
test('one or two recent snapshots are fresh but cannot establish a temporal trend',()=>{
 const r=studyVisibleLiquidity([sample(),sample('binance',1)],{now,asset});
 assert.equal(r.venues[0].status,'OBSERVED');
 assert.equal(r.venues[0].trendState,'COLLECTING');
 assert.equal(r.venues[0].imbalanceChange,null);
});
test('three independent recent points create retrospective change for one venue only',()=>{
 const rows=[sample('binance',0,{imbalance:-.2,spread:12}),
  sample('binance',1,{imbalance:0,spread:11}),
  sample('binance',2,{imbalance:.2,spread:10}),
  sample('bybit',2,{imbalance:-.5,spread:50})];
 // The last test sample is captured 30 ms AFTER the nominal 'now'.
 // Compare only once this synthetic reception actually happened.
 const r=studyVisibleLiquidity(rows,{now:now+1000,asset});
 assert.equal(r.venues[0].status,'OBSERVED');
 assert.equal(r.venues[0].trendState,'OBSERVED');
 assert.ok(Math.abs(r.venues[0].imbalanceChange-.4)<1e-9);
 assert.ok(Math.abs(r.venues[0].spreadChangeBps+2)<1e-9);
 assert.equal(r.venues[1].status,'OBSERVED');
 assert.equal(r.venues[1].trendState,'COLLECTING');
 assert.equal(r.venues[1].imbalanceChange,null);
});
test('stale records remain visible as history, never current quotes',()=>{
 const r=studyVisibleLiquidity([sample(),sample('binance',1),sample('binance',2)],{
  now:now+7200000,asset
 });
 assert.equal(r.venues[0].status,'HISTORICAL');
 assert.equal(r.venues[0].samples,3);
});
test('no fake data on empty or unsupported inputs',()=>{
 const r=studyVisibleLiquidity([],{now,asset});
 assert.equal(r.status,'EMPTY');assert.equal(r.samples,0);
 assert.equal(studyVisibleLiquidity([], {now,asset:'bad symbol'}).status,'INVALID');
});

test('an old one-hour outage does not keep a new clean streak in LOW_COVERAGE',()=>{
 const rows=[
  sample('binance',-240,{imbalance:-.8}),
  sample('binance',-239,{imbalance:-.7}),
  sample('binance',0,{imbalance:.1}),
  sample('binance',1,{imbalance:.2}),
  sample('binance',2,{imbalance:.3})
 ];
 const r=studyVisibleLiquidity(rows,{asset,now:now+1000});
 const v=r.venues[0];
 assert.equal(v.status,'OBSERVED');
 assert.equal(v.samples,5);
 assert.equal(v.continuousSamples,3);
 assert.equal(v.longestGapMs>3600000,true);
 assert.ok(Math.abs(v.imbalanceChange-.2)<1e-9);
});
test('an incomplete streak cannot establish a trend despite many old samples',()=>{
 const rows=Array.from({length:30},(_,i)=>sample('binance',-300+i));
 rows.push(sample('binance',0),sample('binance',1));
 const r=studyVisibleLiquidity(rows,{asset,now});
 assert.equal(r.venues[0].samples,32);
 assert.equal(r.venues[0].continuousSamples,2);
 assert.equal(r.venues[0].status,'OBSERVED');
 assert.equal(r.venues[0].trendState,'COLLECTING');
 assert.equal(r.venues[0].imbalanceChange,null);
});
