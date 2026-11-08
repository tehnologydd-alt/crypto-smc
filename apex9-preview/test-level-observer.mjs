import test from 'node:test';
import assert from 'node:assert/strict';
import {parseLevelObservations,studyQuotedLevels} from './level-observer.mjs';
const asset='BTCUSDT',now=1740000000000;
function frame(venue,offset, levels=[{side:'BID',price:99,quantity:40,notional:3960,relativeToMedian:3}]){
 const observedAt=now-120000+offset*60000;
 return {asset,source:venue+':spot:depth',observedAt,
  collectedAt:observedAt+30,payload:JSON.stringify({
   sampleScope:'LIMITED_PUBLIC_SNAPSHOT',
   levelSelection:'TOP_8_NOTIONAL_PER_SIDE',bestBid:100,bestAsk:101,
   topVisibleLevels:levels
  })};
}
test('does not invent levels from old summary-only snapshots',()=>{
 const old=frame('binance',0);
 old.payload=JSON.stringify({sampleScope:'LIMITED_PUBLIC_SNAPSHOT',bestBid:100,bestAsk:101});
 assert.deepEqual(parseLevelObservations([old],asset),[]);
});
test('rejects impossible levels, wrong asset, and inconsistent notional',()=>{
 const a=frame('binance',0);
 const bad=JSON.parse(a.payload);bad.topVisibleLevels[0].notional=900;
 assert.equal(parseLevelObservations([{...a,payload:JSON.stringify(bad)}],asset).length,0);
 assert.equal(parseLevelObservations([{...a,asset:'ETHUSDT'}],asset).length,0);
 const crossed=JSON.parse(a.payload);crossed.topVisibleLevels[0].price=102;
 assert.equal(parseLevelObservations([{...a,payload:JSON.stringify(crossed)}],asset).length,0);
});
test('repeated sampled price level requires at least three visits over two minutes',()=>{
 const hist=[frame('binance',0),frame('binance',1),frame('binance',2)];
 const r=studyQuotedLevels(hist,{asset,now:now+1000});
 assert.equal(r.venues[0].active.length,1);
 assert.equal(r.venues[0].active[0].state,'REPEATED');
 assert.equal(r.venues[0].active[0].seenCount,3);
 assert.equal(r.venues[1].status,'NO_LEVEL_DATA');
 const sparse=studyQuotedLevels(hist.slice(0,2),{asset,now:now+1000});
 assert.equal(sparse.venues[0].active[0].state,'RECENT');
});
test('missing latest top sample is not labeled cancellation or relocation',()=>{
 const lvl={side:'BID',price:99,quantity:40,notional:3960,relativeToMedian:3};
 const other={side:'BID',price:98,quantity:40,notional:3920,relativeToMedian:3};
 const hist=[frame('binance',0,[lvl]),frame('binance',1,[lvl]),frame('binance',3,[other])];
 const r=studyQuotedLevels(hist,{asset,now:now+61000});
 assert.equal(r.venues[0].absent.length,1);
 assert.equal(r.venues[0].absent[0].state,'NOT_IN_LATEST_SAMPLE');
 assert.match(r.warning,/not proof of cancellation/);
});
test('Binance and Bybit cannot form cross-venue persistent levels',()=>{
 const hist=[frame('binance',0),frame('bybit',1),frame('binance',2)];
 const r=studyQuotedLevels(hist,{asset,now:now+1000});
 assert.equal(r.venues[0].active[0].state,'RECENT');
 assert.equal(r.venues[1].active[0].seenCount,1);
});
test('historical samples cannot be labeled current',()=>{
 const r=studyQuotedLevels([frame('bybit',0)],{asset,now:now+86400000});
 assert.equal(r.venues[1].status,'HISTORICAL');
});
