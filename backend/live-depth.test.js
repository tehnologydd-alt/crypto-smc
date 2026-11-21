import test from 'node:test';
import assert from 'node:assert/strict';
import { LiveDepthBook, LiveDepthRegistry } from './live-depth.js';
import { depthGate } from './order-book.js';

const generateBook=(id=100,bidQty=2,askQty=1)=>({
  lastUpdateId:id,
  bids:Array.from({length:110},(_,i)=>[(100-i*.01).toFixed(2),String(bidQty)]),
  asks:Array.from({length:110},(_,i)=>[(100.02+i*.01).toFixed(2),String(askQty)])
});
const msg=(symbol,first,last,pu=null,b=[],a=[])=>({
  e:'depthUpdate',s:symbol,U:first,u:last,
  ...(pu==null?{}:{pu}),b,a
});
const flush=async()=>{await new Promise(resolve=>setImmediate(resolve));};
test('spot buffers WS deltas until the REST update ID; updates/zero removals are applied',async()=>{
  let now=100000;
  let complete;
  const book=new LiveDepthBook({market:'spot',symbol:'BTCUSDT',now:()=>now,
    fetchSnapshot:()=>new Promise(resolve=>{complete=resolve;})});
  book.receive(msg('BTCUSDT',99,100,null,[['100.00','100']],[]));
  assert.equal(book.snapshot().status,'syncing');
  book.receive(msg('BTCUSDT',101,101,null,[['100.00','7']],[]));
  complete(generateBook(100));await flush();
  assert.equal(book.snapshot().status,'live');
  assert.equal(book.snapshot().lastUpdateId,101);
  assert.equal(book.bids.get(100),7);
  now+=2000;
  book.receive(msg('BTCUSDT',102,102,null,[['100.00','0']],[]));
  assert.equal(book.bids.has(100),false);
  assert.equal(book.snapshot().lastUpdateId,102);
});
test('sequence gap invalidates a spot snapshot and initiates fresh REST sync',async()=>{
  let now=200000,calls=0;
  const book=new LiveDepthBook({market:'spot',symbol:'BTCUSDT',now:()=>now,
    fetchSnapshot:async()=>generateBook(calls++?301:100)});
  book.receive(msg('BTCUSDT',101,102));await flush();
  assert.equal(book.snapshot().status,'live');
  book.receive(msg('BTCUSDT',205,206));
  assert.equal(book.snapshot().status,'syncing');
  await flush();
  assert.notEqual(book.snapshot().status,'live');
  book.receive(msg('BTCUSDT',302,302));
  assert.equal(book.snapshot().status,'live');
  assert.equal(book.snapshot().lastUpdateId,302);
});
test('futures requires matching pu; out-of-sequence diff causes resync',async()=>{
  let now=300000,version=100;
  const book=new LiveDepthBook({market:'futures',symbol:'ETHUSDT',now:()=>now,
    fetchSnapshot:async()=>generateBook(version)});
  book.receive(msg('ETHUSDT',99,101,98));await flush();
  assert.equal(book.snapshot().status,'live');
  book.receive(msg('ETHUSDT',101,102,999));
  assert.equal(book.snapshot().status,'syncing');
  version=200;await flush();
  book.receive(msg('ETHUSDT',199,201,198));
  assert.equal(book.snapshot().status,'live');
  book.receive(msg('ETHUSDT',202,204,201));
  assert.equal(book.snapshot().lastUpdateId,204);
});
test('D2 filter only accepts fresh synchronized 10s depth and persistent imbalance',async()=>{
  let now=100000;
  const book=new LiveDepthBook({market:'spot',symbol:'BTCUSDT',now:()=>now,
    fetchSnapshot:async()=>generateBook()});
  book.receive(msg('BTCUSDT',101,101));await flush();
  for(let i=0;i<7;i++){
    now+=2000;book.receive(msg('BTCUSDT',102+i,102+i));
  }
  const live=book.snapshot();
  assert.equal(live.status,'live');
  assert.ok(live.imbalance>.6);
  assert.ok(live.observations>=4);
  assert.ok(live.observationMs>=10000);
  assert.equal(depthGate(live,{market:'spot',symbol:'BTCUSDT',side:'LONG',closedAt:now-1000,observedAt:now}).allowed,true);
  assert.equal(depthGate(live,{market:'spot',symbol:'BTCUSDT',side:'SHORT',closedAt:now-1000,observedAt:now}).allowed,false);
  assert.equal(depthGate({...live,source:'binance_rest_depth'},{market:'spot',symbol:'BTCUSDT',side:'LONG',closedAt:now-1000,observedAt:now}).allowed,false);
  now+=11000;
  assert.equal(book.snapshot().status,'stale');
});
test('registry isolates spot and futures symbols and prunes removed subscriptions',async()=>{
  const registry=new LiveDepthRegistry({now:()=>1000,fetchSnapshot:async()=>generateBook(100)});
  registry.ingest('spot',msg('BTCUSDT',101,102));await flush();
  assert.equal(registry.snapshot('spot','BTCUSDT').status,'live');
  assert.notEqual(registry.snapshot('futures','BTCUSDT').status,'live');
  registry.invalidate('spot');
  assert.notEqual(registry.snapshot('spot','BTCUSDT').status,'live');
  registry.prune(['ETHUSDT']);
  assert.equal(registry.books.has('spot:BTCUSDT'),false);
});
