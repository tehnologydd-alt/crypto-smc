import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gzipSync} from 'node:zlib';
import {MULTIVENUE,venueTradeConfig,parseVenueTrades,
 validateVenueTrade,decodePublicFrame,createMultivenueStreams}
 from './multivenue-trades.mjs';
import {findCrossVenueWindows,findNearbyChainObservations}
 from './trade-temporal-links.mjs';
import {saveMobileVenueTrade,getMobileVenueTradeHistory}
 from './mobile-bridge.mjs';
const A='BTCUSDT',T=Date.UTC(2026,10,12,11,30);
const uuid='01234567-89ab-cdef-0123-456789abcdef';
const bybit=()=>JSON.stringify({topic:'publicTrade.'+A,type:'snapshot',ts:T,
 data:[{T,s:A,S:'Buy',v:'4',p:'50000',i:uuid}]});
const okx=()=>JSON.stringify({arg:{channel:'trades',instId:'BTC-USDT'},
 data:[{tradeId:'12345',px:'50000',sz:'4',side:'sell',ts:String(T)}]});
const kraken=()=>JSON.stringify({channel:'trade',type:'update',data:[
 {symbol:'BTC/USDT',side:'buy',qty:4,price:50000,trade_id:999,timestamp:new Date(T).toISOString()}]});
const bingx=()=>JSON.stringify({dataType:'BTC-USDT@trade',data:
 {e:'trade',E:T,s:'BTC-USDT',t:616,p:'50000',q:'4',T,m:true}});
const coinbase=()=>JSON.stringify({type:'match',trade_id:600,
 side:'sell',product_id:'BTC-USD',price:'50000',size:'4',
 time:new Date(T).toISOString()});
const samples={bybit:bybit(),okx:okx(),kraken:kraken(),bingx:bingx(),
 coinbase:coinbase()};
const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');

test('all five new feeds have public, source-scoped subscription contracts',()=>{
 for(const v of MULTIVENUE){
  const cfg=venueTradeConfig(v,A);
  assert.ok(cfg.url.startsWith('wss://'));
  assert.ok(cfg.subscribe);
  assert.ok(cfg.symbol);
  assert.equal(cfg.quote,v==='coinbase'?'USD':'USDT');
 }
 assert.equal(venueTradeConfig('kraken','BAD'),null);
 assert.equal(venueTradeConfig('coinbase','BTCUSDT').symbol,'BTC-USD');
});
test('Bybit OKX Kraken BingX Coinbase public event parsing preserves real identities and taker side',()=>{
 const sides={bybit:'BUY_TAKER',okx:'SELL_TAKER',kraken:'BUY_TAKER',
  bingx:'SELL_TAKER',coinbase:'BUY_TAKER'};
 for(const v of MULTIVENUE){
  const rows=parseVenueTrades(v,A,samples[v],T+100);
  assert.equal(rows.length,1,v);
  const t=rows[0];
  assert.equal(t.venue,v);
  assert.equal(t.takerSide,sides[v],v);
  assert.equal(t.quoteNotional,200000,v);
  assert.equal(t.walletOwner,null);
  assert.equal(t.exchangeFlow,null);
  assert.equal(t.blockchainTxHash,null);
  assert.equal(validateVenueTrade(t,A,{now:T+100}),true);
  assert.equal(validateVenueTrade({...t,walletOwner:'someone'},A,{now:T+100}),false);
 }
});
test('do not mistake Coinbase maker side for aggressor or USD for USDT',()=>{
 const buy=parseVenueTrades('coinbase',A,coinbase(),T+100)[0];
 assert.equal(buy.takerSide,'BUY_TAKER'); // maker sells, taker buys
 assert.equal(buy.quoteCurrency,'USD');
 assert.equal(validateVenueTrade({...buy,quoteCurrency:'USDT'},A,{now:T+100}),false);
 assert.equal(parseVenueTrades('coinbase',A,
  JSON.stringify({...JSON.parse(coinbase()),product_id:'ETH-USD'}),T+100).length,0);
});
test('wrong venue symbols, stale data, low notional and deceptive metadata are rejected',()=>{
 assert.deepEqual(parseVenueTrades('bybit',A,
  bybit().replace('"BTCUSDT"','"ETHUSDT"'),T+100),[]);
 assert.equal(parseVenueTrades('okx',A,okx(),T+120001).length,0);
 assert.equal(parseVenueTrades('bingx',A,
  bingx().replace('"q":"4"','"q":"0.001"'),T+100).length,0);
 assert.deepEqual(parseVenueTrades('kraken',A,
  kraken().replace('BTC/USDT','ETH/USDT'),T+100),[]);
 assert.deepEqual(parseVenueTrades('coinbase',A,
  coinbase().replace('"match"','"ticker"'),T+100),[]);
});
test('BingX GZIP decoding is explicit; unknown binary is never silently treated as trades',async()=>{
 const text=bingx(),data=gzipSync(Buffer.from(text));
 const bytes=data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength);
 const decoded=await decodePublicFrame(bytes,'bingx');
 if(typeof DecompressionStream==='function')assert.equal(decoded,text);
 else assert.equal(decoded,null);
 assert.equal(await decodePublicFrame(bytes,'kraken'),null);
});
test('market coincidence is time proximity, never a wallet route or causal claim',()=>{
 const events=MULTIVENUE.slice(0,3).map((venue,i)=>
  parseVenueTrades(venue,A,samples[venue],T+100+i*200)[0]);
 const clusters=findCrossVenueWindows(events);
 assert.equal(clusters.length,1);
 assert.equal(clusters[0].venues.length,3);
 assert.equal(clusters[0].sameTrader,null);
 assert.equal(clusters[0].transferRoute,null);
 assert.equal(clusters[0].causalEvidence,false);
 const nearby=findNearbyChainObservations(events,[{
  observedAt:T+100,source:'blockscout:ethereum:transactions'}]);
 assert.equal(nearby.length,1);
 assert.equal(nearby[0].walletToExchangeIdentified,false);
 assert.equal(findCrossVenueWindows([events[0]]).length,0);
});
test('five channels are gated to current favorite and stop on asset change',async()=>{
 let now=T+100,ws=[],received=[],statuses=[];
 const manager=createMultivenueStreams({
  now:()=>now,socketFactory:url=>{
   const x={url,closed:false,sent:[],
    send(s){this.sent.push(JSON.parse(s))},
    close(){this.closed=true}};
   ws.push(x);return x;
  },onTrades:e=>received.push(e),onStatus:e=>statuses.push(e)
 });
 const gate={symbol:A,visible:true,favorite:true,native:true,dataArea:true};
 assert.equal(manager.sync({...gate,favorite:false}),false);
 assert.equal(ws.length,0);
 assert.equal(manager.sync(gate),true);
 assert.equal(ws.length,5);
 for(const socket of ws)socket.onopen();
 assert.ok(ws.every(x=>x.sent.length===1));
 const bybitWs=ws.find(x=>x.url.includes('bybit.com'));
 bybitWs.onmessage({data:bybit()});
 await new Promise(resolve=>setImmediate(resolve));
 bybitWs.onmessage({data:bybit()}); // identical trade ID
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(received.length,1);
 assert.equal(received[0].trades[0].venue,'bybit');
 manager.sync({...gate,symbol:'ETHUSDT'});
 assert.ok(ws.slice(0,5).every(x=>x.closed));
 assert.equal(ws.length,10);
 manager.sync({...gate,visible:false});
 assert.ok(ws.slice(5).every(x=>x.closed));
});
test('Android Room stores separate source IDs and read-only source-scoped trade data',async()=>{
 const code=read('../apex9-android/native/src/main/java/com/apexintelligence/research/ApexNativePlugin.kt');
 const db=read('../apex9-android/native/src/main/java/com/apexintelligence/research/ApexDatabase.kt');
 const stage=read('../apex9-android/scripts/prepare-web.mjs');
 assert.ok(code.includes('validatedMultivenueTrade('));
 assert.ok(code.includes('fun getMultivenueTradeHistory('));
 assert.ok(db.includes('suspend fun multivenueTradeHistory('));
 assert.ok(stage.includes("'multivenue-trades.mjs'"));
 assert.ok(stage.includes("'trade-temporal-links.mjs'"));
 const old=globalThis.window,received=[],trade=parseVenueTrades('okx',A,okx(),T+200)[0];
 const real={...trade,receivedAt:Date.now(),tradeAt:Date.now()-100};
 globalThis.window={Capacitor:{Plugins:{ApexNative:{
  saveObservation:async item=>{received.push(item);return {saved:true}},
  getMultivenueTradeHistory:async()=>({source:'MULTIVENUE_SPOT_TRADES_ROOM_V1',
   rows:[{asset:A,source:real.source,observedAt:real.tradeAt,
    collectedAt:real.receivedAt,payload:JSON.stringify(real)}]})
 }}}};
 try{
  assert.equal((await saveMobileVenueTrade(real)).saved,true);
  assert.equal(received[0].id,'spottrade:okx:'+A+':12345');
  assert.equal(received[0].kind,'market');
  const archive=await getMobileVenueTradeHistory(A);
  assert.equal(archive.complete,true);
  assert.equal(archive.events[0].source,'okx:spot:trades');
 }finally{globalThis.window=old}
});
