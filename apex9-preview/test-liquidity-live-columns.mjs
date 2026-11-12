import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {currentLiquidityBooks} from './liquidity-current.mjs';
import {parseLiveBookMessage} from './live-depth-streams.mjs';

const T=Date.UTC(2026,10,12,9,49,18),ASSET='ZECUSDT';
const binance=ts=>parseLiveBookMessage('binance',ASSET,JSON.stringify({
 lastUpdateId:987,
 bids:[['990.69','2'],['990.68','1']],
 asks:[['990.73','2'],['990.74','1']]
}),ts).data;
const okx=ts=>parseLiveBookMessage('okx',ASSET,JSON.stringify({
 arg:{channel:'books5',instId:'ZEC-USDT'},
 data:[{instId:'ZEC-USDT',ts:String(ts-80),seqId:456,
  bids:[['990.58','2','0','1'],['990.57','1','0','1']],
  asks:[['990.67','2','0','1'],['990.68','1','0','1']]}]
}),ts).data;
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');

test('one fresh verified WS snapshot per exchange updates current column without history quota',()=>{
 const b=binance(T+1000),o=okx(T+900);
 assert.equal(b.collectionMethod,'PUBLIC_WS_BOOK_SNAPSHOT');
 assert.equal(o.collectionMethod,'PUBLIC_WS_BOOK_SNAPSHOT');
 const result=currentLiquidityBooks([b,o],{asset:ASSET,now:T+1100});
 assert.equal(result.state,'OK');
 for(const venue of ['binance','okx']){
  assert.equal(result.venues[venue].state,'FRESH');
  assert.equal(result.venues[venue].source,'WS');
  assert.ok(Number.isFinite(result.venues[venue].imbalancePct));
  assert.ok(Number.isFinite(result.venues[venue].spreadBps));
 }
 assert.equal(result.venues.binance.at,T+1000);
 assert.equal(result.venues.okx.at,T+900);
});
test('old books, wrong symbols and future reception never masquerade as live',()=>{
 const b=binance(T);
 assert.equal(currentLiquidityBooks([b],{asset:ASSET,now:T+12001})
  .venues.binance.state,'STALE');
 assert.equal(currentLiquidityBooks([{...b,symbol:'ETHUSDT'}],
  {asset:ASSET,now:T+100}).venues.binance.state,'UNAVAILABLE');
 assert.equal(currentLiquidityBooks([b],{asset:ASSET,now:T-100})
  .venues.binance.state,'UNAVAILABLE');
 assert.equal(currentLiquidityBooks([{...b,visibleDepthImbalance:2}],
  {asset:ASSET,now:T+200}).venues.binance.state,'UNAVAILABLE');
 assert.equal(currentLiquidityBooks([], {asset:ASSET,now:T+200})
  .venues.okx.state,'UNAVAILABLE');
});
test('REST is explicit snapshot, never falsely called continuous WS',()=>{
 const r={...okx(T),collectionMethod:'PUBLIC_REST_BOOK_SNAPSHOT',
  snapshotLevelsMax:50};
 const report=currentLiquidityBooks([r],{asset:ASSET,now:T+700});
 assert.equal(report.venues.okx.state,'FRESH');
 assert.equal(report.venues.okx.source,'REST');
 assert.equal(report.venues.okx.depthMax,50);
});
test('live columns update from the very same asset books, Room history stays separate',()=>{
 const app=read('./app.mjs'),dash=read('./liquidity-dashboard.mjs'),
  stream=read('./live-depth-streams.mjs'),css=read('./styles.css');
 assert.match(app,/liquidityDashboard\.setVisibleBooks\(chosen,activeBooks\)/);
 assert.match(dash,/currentLiquidityBooks\(visibleBooks/);
 assert.match(dash,/card\.dataset\.venue=v\.venue/);
 assert.match(dash,/getMobileLiquidityHistory\(asset,160\)/);
 assert.match(dash,/История Room · последний сохранённый снимок/);
 assert.match(dash,/paintVisible\(\)/);
 assert.match(stream,/if\(received-lane\.lastRenderedAt>=1000\)/);
 assert.match(stream,/if\(changed&&received-lane\.lastSavedAt>=LIVE_BOOK_POLICY\.saveGapMs\)/);
 assert.match(css,/\.liquidity-current/);
});
