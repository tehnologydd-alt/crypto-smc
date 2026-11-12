import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createForegroundBookStreams,parseLiveBookMessage,streamAddress,
 LIVE_BOOK_POLICY} from './live-depth-streams.mjs';
import {normalizeLiquidityHistory} from './liquidity-core.mjs';
const T=Date.UTC(2026,10,11,15),A='BTCUSDT',B='ETHUSDT';
const binance=id=>JSON.stringify({lastUpdateId:id,
 bids:[['100','2'],['99','1']],asks:[['101','2'],['102','1']]});
const okx=(ts=T,id=1,instId='BTC-USDT')=>JSON.stringify({
 arg:{channel:'books5',instId},
 data:[{instId,bids:[['100','2','0','2']],asks:[['101','3','0','2']],
  ts:String(ts),seqId:id}]
});
function setup(){
 let time=T;
 const connections=[],samples=[],statuses=[],books=[];
 const manager=createForegroundBookStreams({
  now:()=>time,
  socketFactory:url=>{
   const ws={url,closed:false,sent:[],onopen:null,onmessage:null,
    onerror:null,onclose:null,send(payload){this.sent.push(payload);},
    close(){this.closed=true;}};
   connections.push(ws);return ws;
  },
  onSample:item=>samples.push(item),
  onBook:item=>books.push(item),
  onStatus:item=>statuses.push(item)
 });
 return {manager,connections,samples,statuses,books,
  get now(){return time},set now(value){time=value}};
}
test('public snapshot streams use correct production ports and fixed pair',()=>{
 assert.equal(streamAddress('binance',A),
  'wss://stream.binance.com:9443/ws/btcusdt@depth20');
 assert.equal(streamAddress('okx',A),'wss://ws.okx.com/ws/v5/public');
 assert.equal(streamAddress('okx','BTCUSDT&x'),null);
 assert.equal(streamAddress('unknown',A),null);
 assert.equal(streamAddress('okx','GRAM'),null);
 assert.equal(streamAddress('binance',B),
  'wss://stream.binance.com:9443/ws/ethusdt@depth20');
});
test('Binance and OKX snapshots are source-checked, not merged as deltas',()=>{
 const x=parseLiveBookMessage('binance',A,binance(42),T);
 assert.equal(x.state,'OK');
 assert.equal(x.data.market,'SPOT');
 assert.equal(x.data.sampleScope,'LIMITED_PUBLIC_SNAPSHOT');
 assert.equal(x.data.snapshotLevelsMax,20);
 assert.equal(x.data.exchangeTimestamp,null);
 assert.equal(x.data.collectionMethod,'PUBLIC_WS_BOOK_SNAPSHOT');
 assert.equal(parseLiveBookMessage('okx',A,okx(T-100,43),T).state,'OK');
 const y=parseLiveBookMessage('okx',A,okx(T-100,43),T).data;
 assert.equal(y.snapshotLevelsMax,5);
 assert.equal(y.exchangeTimestamp,T-100);
 assert.equal(y.updateId,43);
 assert.equal(parseLiveBookMessage('okx',A,okx(T-100,45,'ETH-USDT'),T).state,
  'INVALID');
 assert.equal(parseLiveBookMessage('binance',A,'{broken',T).state,'INVALID');
 assert.equal(parseLiveBookMessage('okx',A,JSON.stringify({
  event:'error',msg:'rejected'}),T).state,'REMOTE_ERROR');
 assert.equal(parseLiveBookMessage('okx',A,'pong',T).state,'KEEPALIVE');
});
test('no websocket opens outside a visible favorite Android Data view',()=>{
 const v=setup();
 const gate={asset:A,visible:true,favorite:true,native:true,dataArea:true};
 for(const change of [
  {...gate,visible:false},{...gate,favorite:false},
  {...gate,native:false},{...gate,dataArea:false}]){
  assert.equal(v.manager.sync(change),false);
  assert.equal(v.connections.length,0);
 }
 assert.equal(v.manager.sync(gate),true);
 assert.equal(v.connections.length,2);
 assert.equal(v.manager.getStatus().active,true);
 assert.ok(v.connections.every(s=>s.url.startsWith('wss://')));
 assert.equal(v.connections.some(s=>s.url.includes('8443')),false);
 assert.equal(v.manager.sync({...gate,dataArea:false}),false);
 assert.ok(v.connections.every(s=>s.closed));
 assert.equal(v.manager.getStatus().active,false);
});
test('no more than one source-checkpoint every 30s; REST resumes on stale feed',()=>{
 const v=setup();
 const gate={asset:A,visible:true,favorite:true,native:true,dataArea:true};
 v.manager.sync(gate);
 const [bin,ok]=v.connections;
 bin.onopen();ok.onopen();
 assert.equal(ok.sent.length,1);
 assert.deepEqual(JSON.parse(ok.sent[0]),{
  op:'subscribe',args:[{channel:'books5',instId:'BTC-USDT'}]});
 bin.onmessage({data:binance(3)});
 ok.onmessage({data:okx(T-100,4)});
 assert.deepEqual(v.samples.map(x=>x.venue),['binance','okx']);
 assert.equal(v.samples[0].depth.snapshotLevelsMax,20);
 assert.equal(v.samples[1].depth.snapshotLevelsMax,5);
 assert.equal(v.manager.isFresh('binance'),true);
 v.now+=1000;
 bin.onmessage({data:binance(4)});
 ok.onmessage({data:okx(v.now-100,5)});
 assert.equal(v.samples.length,2);
 v.now+=LIVE_BOOK_POLICY.saveGapMs;
 bin.onmessage({data:binance(6)});
 ok.onmessage({data:okx(v.now-100,6)});
 assert.equal(v.samples.length,4);
 assert.equal(v.samples[3].collectedAt,v.now);
 v.now+=LIVE_BOOK_POLICY.healthyBinanceMs+1;
 assert.equal(v.manager.isFresh('binance'),false);
 assert.equal(v.manager.isFresh('okx'),true);
});
test('out-of-order updateId fails closed, backs off, preserves other venue',()=>{
 const v=setup(),gate={asset:A,visible:true,favorite:true,native:true,dataArea:true};
 v.manager.sync(gate);
 const [bin,ok]=v.connections;
 bin.onopen();ok.onopen();
 bin.onmessage({data:binance(9)});
 ok.onmessage({data:okx(v.now-100,10)});
 bin.onmessage({data:binance(8)});
 assert.equal(bin.closed,true);
 assert.equal(v.manager.isFresh('binance'),false);
 assert.equal(v.manager.isFresh('okx'),true);
 assert.equal(v.statuses.some(s=>s.venue==='binance'&&s.state==='SEQUENCE_RESET'),true);
 v.manager.tick();assert.equal(v.connections.length,2);
 v.now+=LIVE_BOOK_POLICY.reconnectGapMs;
 v.manager.tick();assert.equal(v.connections.length,3);
 assert.equal(v.connections[2].url.includes('binance'),true);
});
test('OKX heartbeat and expiry cannot fabricate fresh book snapshots',()=>{
 const v=setup(),gate={asset:A,visible:true,favorite:true,native:true,dataArea:true};
 v.manager.sync(gate);
 const ok=v.connections[1];
 ok.onopen();
 v.now+=LIVE_BOOK_POLICY.okxPingMs+1000;
 v.manager.tick();
 assert.equal(ok.sent.at(-1),'ping');
 v.now+=LIVE_BOOK_POLICY.okxPingMs+1000;
 v.manager.tick();
 assert.equal(ok.closed,true);
 assert.equal(v.manager.isFresh('okx'),false);
 assert.equal(v.samples.length,0);
});
test('asset switch discards stale old socket and never mixes pair history',()=>{
 const v=setup(),gate={asset:A,visible:true,favorite:true,native:true,dataArea:true};
 v.manager.sync(gate);
 const old=v.connections[0];old.onopen();
 const handler=old.onmessage;
 v.manager.sync({...gate,asset:B});
 assert.equal(old.closed,true);
 assert.equal(v.connections.length,4);
 handler({data:binance(100)});
 assert.equal(v.samples.length,0);
 assert.equal(v.manager.getStatus().asset,B);
 v.manager.stop();
 assert.equal(v.manager.getStatus().active,false);
});
test('Room snapshots preserve WS depth cap for each venue; legacy REST stays separate',()=>{
 const make=(source,collectionMethod,snapshotLevelsMax,ts)=>({
  asset:A,source,observedAt:ts,collectedAt:ts,
  payload:JSON.stringify({sampleScope:'LIMITED_PUBLIC_SNAPSHOT',
   bestBid:100,bestAsk:101,spreadBps:(1/100.5)*10000,
   visibleDepthImbalance:0,
   bidNotional:200,askNotional:200,bidLevels:2,askLevels:2,
   collectionMethod,snapshotLevelsMax})
 });
 const items=[
  make('binance:spot:depth','PUBLIC_REST_BOOK_SNAPSHOT',100,T-120000),
  make('binance:spot:depth','PUBLIC_WS_BOOK_SNAPSHOT',20,T-60000),
  make('okx:spot:depth','PUBLIC_WS_BOOK_SNAPSHOT',5,T-30000)
 ];
 const clean=normalizeLiquidityHistory(items,A);
 assert.deepEqual(clean.map(r=>[r.venue,r.collectionMethod,r.snapshotLevelsMax]),
  [['binance','REST',100],['binance','WS',20],['okx','WS',5]]);
});
test('Android/Web integrations only observe foreground and bounded persistence',()=>{
 const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
 const app=read('./app.mjs'),bridge=read('./mobile-bridge.mjs'),
  pack=read('../apex9-android/scripts/prepare-web.mjs'),
  html=read('./index.html');
 assert.ok(app.includes('createForegroundBookStreams('));
 assert.ok(app.includes('!depthStream?.isFresh(venue)'));
 assert.ok(app.includes('syncDepthStreams();'));
 assert.ok(app.includes('depthStream?.stop();'));
 assert.ok(app.includes("el('view-asset').dataset.assetArea!=='data'"));
 assert.ok(bridge.includes("collectionMethod:depth.collectionMethod==='PUBLIC_WS_BOOK_SNAPSHOT'"));
 assert.ok(pack.includes("'live-depth-streams.mjs'"));
 assert.ok(html.includes('id="depth-stream-status"'));
 assert.ok(app.includes("const activeBooks=['binance','okx'].map(venue=>"));
 const dashboard=read('./liquidity-dashboard.mjs');
 assert.ok(dashboard.includes("v.venue==='binance'||v.venue==='okx'"));
 const levels=read('./level-dashboard.mjs');
 assert.ok(levels.includes("filter(v=>v.venue!=='bybit')"));
 const core=read('./live-depth-streams.mjs');
 assert.equal(core.includes('setInterval('),false);
 assert.equal(core.includes('fetch('),false);
 assert.equal(core.includes('wss://ws.okx.com:8443'),false);
 assert.equal(read('./research.mjs').includes('export {parseDepthSnapshot};'),true);
});

test('unchanged verified WS snapshot refreshes live column, not Room history',()=>{
 const v=setup(),gate={asset:A,visible:true,favorite:true,
  native:true,dataArea:true};
 v.manager.sync(gate);
 const [bin,ok]=v.connections;bin.onopen();ok.onopen();
 bin.onmessage({data:binance(30)});
 ok.onmessage({data:okx(T-100,10)});
 assert.equal(v.books.length,2);
 assert.equal(v.samples.length,2);
 v.now+=1200;
 // Same exchange sequence and same visible book, genuinely received again.
 bin.onmessage({data:binance(30)});
 ok.onmessage({data:okx(v.now-100,10)});
 assert.equal(v.books.length,4);
 assert.equal(v.samples.length,2);
 assert.equal(v.books[3].depth.receivedAt,v.now);
});
