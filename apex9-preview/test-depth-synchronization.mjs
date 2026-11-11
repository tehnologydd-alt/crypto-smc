import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseDepthSnapshot} from '../updates/v90-market-depth.mjs';
import {synchronizeSpotDepth,DEPTH_SYNC_POLICY}
 from './depth-synchronization.mjs';
import {parseLiveBookMessage} from './live-depth-streams.mjs';

const T=Date.UTC(2026,10,11,18,30,0),asset='BTCUSDT';
const levels=(venue,bidQty=2,askQty=2)=>{
 const number=venue==='okx'?5:6;
 const bids=Array.from({length:number},(_,i)=>
  [String(100-i*.02),String(bidQty),'0','1']);
 const asks=Array.from({length:number},(_,i)=>
  [String(100.1+i*.02),String(askQty),'0','1']);
 return {bids,asks};
};
function book(venue,receivedAt,{bidQty=2,askQty=2,
 symbol=asset}={}){
 const data=levels(venue,bidQty,askQty);
 const payload=venue==='okx'?
  {code:'0',data:[{...data,ts:String(receivedAt-100),seqId:21}]}:
  {...data,lastUpdateId:12};
 return parseDepthSnapshot(venue,symbol,payload,receivedAt);
}
test('the SAME verified price band is used rather than total 20 vs 50 levels',()=>{
 const binance=book('binance',T,{bidQty:3,askQty:1});
 const okx=book('okx',T+900,{bidQty:1,askQty:3});
 const report=synchronizeSpotDepth([binance,okx],{
  asset,now:T+1100});
 assert.equal(report.state,'SYNCED');
 assert.equal(report.comparable,true);
 assert.equal(report.asset,asset);
 assert.equal(report.lagMs,900);
 assert.ok(report.commonBandBps>=DEPTH_SYNC_POLICY.minBandBps);
 assert.ok(report.commonBandBps<=10);
 assert.ok(report.binanceLevels.bid>=2);
 assert.ok(report.binanceLevels.ask>=2);
 assert.ok(report.okxLevels.bid>=2);
 assert.ok(report.okxLevels.ask>=2);
 assert.ok(report.binanceImbalancePct>0);
 assert.ok(report.okxImbalancePct<0);
 assert.ok(report.differencePctPoints>0);
 assert.equal(report.predictive,false);
 assert.equal(report.affectsForecast,false);
 assert.equal(report.timeBasis,'LOCAL_RECEIPT_NOT_SIMULTANEOUS_EXCHANGE');
 assert.equal(binance.collectionMethod,'PUBLIC_REST_BOOK_SNAPSHOT');
 assert.equal(okx.collectionMethod,'PUBLIC_REST_BOOK_SNAPSHOT');
 assert.equal(binance.snapshotLevelsMax,100);
 assert.equal(okx.snapshotLevelsMax,50);
 assert.equal(binance.visibleBook.bids.length,6);
 assert.equal(okx.visibleBook.bids.length,5);
});
test('WS and REST can pair only when received at same time and same band',()=>{
 const b=book('binance',T);
 b.collectionMethod='PUBLIC_WS_BOOK_SNAPSHOT';
 b.snapshotLevelsMax=20;
 const o=book('okx',T+1000);
 const result=synchronizeSpotDepth([b,o],{asset,now:T+2000});
 assert.equal(result.state,'SYNCED');
 assert.equal(result.commonBandBps>0,true);
});
test('cannot manufacture matched data from missing or stale venue',()=>{
 const binance=book('binance',T);
 const okx=book('okx',T+1000);
 const missing=synchronizeSpotDepth([binance],{asset,now:T+5000});
 assert.equal(missing.state,'WAITING');
 assert.equal(missing.comparable,false);
 const stale=synchronizeSpotDepth([binance,okx],{
  asset,now:T+DEPTH_SYNC_POLICY.maxAgeMs+2000});
 assert.equal(stale.state,'STALE');
 assert.equal(stale.binanceImbalancePct,null);
 assert.equal(stale.okxImbalancePct,null);
});
test('do not compare two successful books from different moments',()=>{
 const binance=book('binance',T);
 const okx=book('okx',T+DEPTH_SYNC_POLICY.maxPairLagMs+1);
 const result=synchronizeSpotDepth([binance,okx],{
  asset,now:T+DEPTH_SYNC_POLICY.maxPairLagMs+500});
 assert.equal(result.state,'MISALIGNED');
 assert.equal(result.comparable,false);
 assert.equal(result.commonBandBps,null);
 assert.equal(result.binanceImbalancePct,null);
 assert.equal(result.okxImbalancePct,null);
 assert.equal(result.lagMs,DEPTH_SYNC_POLICY.maxPairLagMs+1);
});
test('never cross symbols, including a stale value from a previous favorite',()=>{
 const binance=book('binance',T);
 const okx=book('okx',T+1000,{symbol:'ETHUSDT'});
 const mismatch=synchronizeSpotDepth([binance,okx],{
  asset,now:T+1100});
 assert.equal(mismatch.state,'DIFFERENT_ASSET');
 assert.equal(mismatch.comparable,false);
});
test('narrow OKX book with inadequate near-mid coverage is not compared',()=>{
 const binance=book('binance',T);
 const okx=book('okx',T+100);
 const m=okx.mid;
 okx.visibleBook.bids=[
  {price:100,qty:2,notional:200},
  {price:99.999,qty:2,notional:199.998}
 ];
 okx.visibleBook.asks=[
  {price:100.1,qty:2,notional:200.2},
  {price:100.101,qty:2,notional:200.202}
 ];
 assert.ok(m>100&&m<100.1);
 const r=synchronizeSpotDepth([binance,okx],{asset,now:T+1000});
 assert.equal(r.state,'INSUFFICIENT_COVERAGE');
 assert.equal(r.comparable,false);
 assert.equal(r.differencePctPoints,null);
});
test('top 8 largest notional levels cannot replace actual ordered depth',()=>{
 const binance=book('binance',T),okx=book('okx',T+1000);
 // These are ranked by size, NOT by price proximity; no band proof.
 delete okx.visibleBook;
 const r=synchronizeSpotDepth([binance,okx],{asset,now:T+1500});
 assert.equal(r.state,'INVALID');
 assert.equal(r.comparable,false);
});
test('real public WS parser supplies near-price levels without persisting them to Room',()=>{
 const bPayload=JSON.stringify({
  ...levels('binance'),lastUpdateId:100
 });
 const oPayload=JSON.stringify({
  arg:{channel:'books5',instId:'BTC-USDT'},
  data:[{...levels('okx'),instId:'BTC-USDT',ts:String(T),seqId:10}]
 });
 const b=parseLiveBookMessage('binance',asset,bPayload,T);
 const o=parseLiveBookMessage('okx',asset,oPayload,T+200);
 assert.equal(b.state,'OK');
 assert.equal(o.state,'OK');
 assert.equal(b.data.snapshotLevelsMax,20);
 assert.equal(o.data.snapshotLevelsMax,5);
 assert.ok(b.data.visibleBook.bids.length>0);
 assert.ok(o.data.visibleBook.asks.length>0);
 assert.equal(synchronizeSpotDepth([b.data,o.data],{
  asset,now:T+500}).state,'SYNCED');
 const bridge=readFileSync(new URL('./mobile-bridge.mjs',import.meta.url),'utf8');
 assert.equal(bridge.includes('visibleBook:'),false);
});
test('UI keeps Bybit out and never creates a synchronized trading signal',()=>{
 const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
 const app=read('./app.mjs'),markup=read('./index.html'),
  pack=read('../apex9-android/scripts/prepare-web.mjs'),
  module=read('./depth-synchronization.mjs');
 assert.ok(app.includes('selectDepthComparison(activeBooks'));
 assert.ok(app.includes('comparison.state===\'SYNCED\''));
 assert.ok(app.includes('latestRestDepth.get(venue)'));
 assert.ok(app.includes('if(depthStream?.isFresh(venue))'));
 assert.ok(markup.includes('id="depth-sync-status"'));
 assert.ok(pack.includes("'depth-synchronization.mjs'"));
 assert.equal(module.includes('setInterval('),false);
 assert.equal(module.includes('fetch('),false);
 assert.equal(module.includes('WebSocket('),false);
 assert.equal(module.includes('tradeDirection'),false);
});
