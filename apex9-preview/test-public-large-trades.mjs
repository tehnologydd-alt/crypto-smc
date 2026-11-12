import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseBinanceAggTrade,validateLargeTrade,largeTradeStreamUrl,
 createLargeTradeStream,LARGE_TRADE_SOURCE} from './large-trade-stream.mjs';
import {saveMobileLargeTrade,getMobileLargeTradeHistory} from './mobile-bridge.mjs';

const ASSET='BTCUSDT',T=Date.UTC(2026,10,12,11,30);
const sample=(id=100,opts={})=>JSON.stringify({
 e:'aggTrade',E:T,s:ASSET,a:id,p:'50000.00',q:'4.00000000',
 f:120,l:130,T,m:false,M:true,...opts
});
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');

test('official Binance raw aggTrade parses large taker execution, not whale ownership',()=>{
 const r=parseBinanceAggTrade(sample(7),ASSET,T+100);
 assert.equal(r.state,'OK');
 const t=r.trade;
 assert.equal(t.aggregateId,7);
 assert.equal(t.quoteNotional,200000);
 assert.equal(t.takerSide,'BUY_TAKER');
 assert.equal(t.walletOwner,null);
 assert.equal(t.exchangeFlow,null);
 assert.equal(t.blockchainTxHash,null);
 assert.equal(t.source,LARGE_TRADE_SOURCE);
 assert.equal(validateLargeTrade(t,ASSET,{now:T+100}),true);
 const sell=parseBinanceAggTrade(sample(9,{m:true}),ASSET,T+100);
 assert.equal(sell.trade.takerSide,'SELL_TAKER');
 assert.equal(sell.trade.buyerIsMaker,true);
 assert.equal(largeTradeStreamUrl(ASSET),
  'wss://stream.binance.com:9443/ws/btcusdt@aggTrade');
 assert.equal(largeTradeStreamUrl('BTC'),null);
});
test('reject wrong ticker, fake wallet movement, incomplete quote and old data',()=>{
 assert.equal(parseBinanceAggTrade(sample(4,{s:'ETHUSDT'}),ASSET,T+200).state,'INVALID');
 assert.equal(parseBinanceAggTrade(sample(4,{e:'depth'}),ASSET,T+200).state,'INVALID');
 assert.equal(parseBinanceAggTrade(sample(4,{q:'0.001'}),ASSET,T+200).state,'BELOW_THRESHOLD');
 assert.equal(parseBinanceAggTrade(sample(4,{T:T+1000}),ASSET,T).state,'INVALID');
 assert.equal(parseBinanceAggTrade(sample(4),ASSET,T+130000).state,'INVALID');
 const r=parseBinanceAggTrade(sample(4),ASSET,T+200).trade;
 assert.equal(validateLargeTrade({...r,walletOwner:'Binance whale'},ASSET,{now:T+200}),false);
 assert.equal(validateLargeTrade({...r,exchangeFlow:'exchange_inflow'},ASSET,{now:T+200}),false);
 assert.equal(validateLargeTrade({...r,quoteNotional:1000000},ASSET,{now:T+200}),false);
 const combined=JSON.stringify({stream:'btcusdt@aggTrade',data:JSON.parse(sample(8))});
 assert.equal(parseBinanceAggTrade(combined,ASSET,T+100).state,'OK');
});
test('foreground favorite only, duplicate aggregate IDs ignored, switch closes sockets',()=>{
 let t=T;
 const connections=[],trades=[],statuses=[];
 const s=createLargeTradeStream({
  now:()=>t,socketFactory:url=>{
   const ws={url,closed:false,
    close(){this.closed=true},
    onopen:null,onmessage:null,onclose:null,onerror:null};
   connections.push(ws);return ws;
  },
  onTrade:x=>trades.push(x),onStatus:x=>statuses.push(x)
 });
 const gate={symbol:ASSET,visible:true,favorite:true,native:true,dataArea:true};
 for(const k of ['visible','favorite','native','dataArea'])
  assert.equal(s.sync({...gate,[k]:false}),false);
 assert.equal(connections.length,0);
 assert.equal(s.sync(gate),true);
 assert.equal(connections.length,1);
 connections[0].onopen();
 t+=300;
 connections[0].onmessage({data:sample(41)});
 connections[0].onmessage({data:sample(41)});
 assert.equal(trades.length,1);
 assert.equal(trades[0].trade.aggregateId,41);
 assert.equal(s.sync({...gate,symbol:'ETHUSDT'}),true);
 assert.equal(connections[0].closed,true);
 assert.equal(connections.length,2);
 assert.equal(s.sync({...gate,visible:false}),false);
 assert.equal(connections[1].closed,true);
 assert.equal(statuses.some(x=>x.status==='LIVE'),true);
});
test('Android source-scoped market archive is separate from on-chain whale history',async()=>{
 const code=read('../apex9-android/native/src/main/java/com/apexintelligence/research/ApexNativePlugin.kt');
 const dao=read('../apex9-android/native/src/main/java/com/apexintelligence/research/ApexDatabase.kt');
 assert.ok(code.includes('fun getLargeTradeHistory(call: PluginCall)'));
 assert.ok(code.includes('validatedLargeTrade('));
 assert.ok(code.includes('source == "binance:spot:aggtrade"'));
 assert.ok(dao.includes('suspend fun largeTradeHistory('));
 const app=read('./app.mjs'),markup=read('./index.html');
 const stages=read('../apex9-android/scripts/prepare-web.mjs');
 assert.ok(app.includes('initLargeTradeDashboard('));
 assert.ok(app.includes('largeTradeDashboard.sync()'));
 assert.ok(markup.includes('id="large-trade-threshold"'));
 assert.ok(markup.includes('id="large-trade-search"'));
 assert.ok(markup.includes('НЕ официальный Whale Alert'));
 assert.ok(stages.includes("'large-trade-stream.mjs'"));
 assert.ok(stages.includes("'large-trade-dashboard.mjs'"));
});
test('native save and history verify source identity and preserve exact aggregate ID',async()=>{
 const old=globalThis.window,now=Date.now(),AS='ETHUSDT';
 const message=JSON.stringify({
  e:'aggTrade',E:now,s:AS,a:1777,p:'3000.00',q:'100.000',
  T:now-50,m:true
 });
 const trade=parseBinanceAggTrade(message,AS,now).trade;
 assert.ok(trade);
 const sent=[];
 globalThis.window={Capacitor:{Plugins:{ApexNative:{
  saveObservation:async p=>{sent.push(p);return {saved:true}},
  getLargeTradeHistory:async p=>({source:'BINANCE_SPOT_AGGTRADE_ROOM_V1',
   rows:[{asset:AS,source:LARGE_TRADE_SOURCE,
    observedAt:trade.tradeAt,collectedAt:trade.receivedAt,
    payload:JSON.stringify(trade)}]})
 }}}};
 try{
  assert.equal((await saveMobileLargeTrade(trade)).saved,true);
  assert.equal(sent[0].id,'aggtrade:'+AS+':1777');
  assert.equal(sent[0].kind,'market');
  const h=await getMobileLargeTradeHistory(AS,10);
  assert.equal(h.complete,true);
  assert.equal(h.events.length,1);
  assert.equal(h.events[0].aggregateId,1777);
 }finally{globalThis.window=old}
});
