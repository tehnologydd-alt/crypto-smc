import test from 'node:test';
import assert from 'node:assert/strict';
import { RULES, RULE_KEYS } from './strategy-rules.js';
import { depthGate } from './order-book.js';
import { detectResearchSignals } from './strategy.js';
const HOUR=3600000;
function bullish(period=HOUR,start=0,count=40) {
  return Array.from({length:count},(_,i)=>{
    const time=start+i*period;
    const candle={time,end:time+period-1,open:100,high:101,low:99,close:100,volume:1};
    if(i===count-10)candle.high=103;
    if(i===count-2)Object.assign(candle,{open:101,close:100,high:102});
    if(i===count-1)Object.assign(candle,{open:102.5,low:102.5,high:107,close:106});
    return candle;
  });
}
function parentFor(bars) {
  const last=bars.at(-1).end;
  return bullish(4*HOUR,last-20*4*HOUR+1,20);
}
function book(closedAt,extra={}) {
  return {source:'binance_ws_depth',status:'live',market:'spot',symbol:'BTCUSDT',
    capturedAt:closedAt+2000,lastUpdateId:99121,
    levels:100,bestBid:105.99,bestAsk:106.01,spreadPct:.019,
    bidUsdt:200000,askUsdt:100000,imbalance:2/3,averageImbalance:.65,
    observedSince:closedAt-30000,observationMs:32000,observations:15,updates:50,
    bids:[],asks:[],...extra};
}
test('research revisions use D2 synchronized orderbook and keep D1 REST archived',()=>{
  assert.deepEqual(RULES.map(r=>r.key),['v0.1','v0.2-D2','v0.3-D2','v0.2-B5','v0.3-B5']);
  assert.ok(RULE_KEYS.includes('v0.2-D1'));
  assert.ok(RULE_KEYS.includes('v0.3-D1'));
  assert.ok(RULE_KEYS.includes('v0.2'));
  assert.ok(RULE_KEYS.includes('v0.2-L1'));
});
test('live order-book filter demands observed stable depth not a REST picture',()=>{
  const close=5000000,s=book(close);
  const options={market:'spot',symbol:'BTCUSDT',side:'LONG',closedAt:close,observedAt:close+3000};
  assert.equal(depthGate(s,options).allowed,true);
  assert.equal(depthGate({...s,source:'binance_rest_depth'},options).allowed,false);
  assert.equal(depthGate({...s,observations:1},options).allowed,false);
  assert.equal(depthGate({...s,observationMs:1000},options).allowed,false);
  assert.equal(depthGate({...s,averageImbalance:.42},options).allowed,false);
  assert.equal(depthGate({...s,capturedAt:close-2000},options).allowed,false);
  assert.equal(depthGate(s,{...options,observedAt:close+20000}).allowed,false);
  assert.equal(depthGate(s,{...options,market:'futures'}).allowed,false);
  assert.equal(depthGate(s,{...options,side:'SHORT'}).allowed,false);
});
test('three independent research arms only appear for a live sequenced book',()=>{
  const bars=bullish(),at=bars.at(-1).end;
  const live=book(at),parent=parentFor(bars);
  assert.deepEqual(detectResearchSignals(bars,'spot','BTCUSDT','1h',parent,
    null,at+3000).map(s=>s.ruleVersion),['v0.1']);
  const found=detectResearchSignals(bars,'spot','BTCUSDT','1h',parent,live,at+3000);
  assert.deepEqual(found.map(s=>s.ruleVersion),RULES.filter(r=>!r.background).map(r=>r.key));
  assert.equal(new Set(found.map(s=>s.id)).size,3);
  assert.equal(found[1].ruleSnapshot.book.lastUpdateId,99121);
  assert.equal(found[1].detectedAt,live.capturedAt);
  assert.equal(found[1].events[0].at,live.capturedAt);
  assert.notEqual(found[0].events,found[1].events);
  assert.deepEqual(detectResearchSignals(bars,'spot','BTCUSDT','1h',null,live,at+3000)
    .map(s=>s.ruleVersion),['v0.1','v0.2-D2']);
  assert.deepEqual(detectResearchSignals(bars,'spot','BTCUSDT','1h',parent,
    {...live,source:'binance_rest_depth'},at+3000).map(s=>s.ruleVersion),['v0.1']);
});
test('candle volume cannot count as orderbook depth',()=>{
  const bars=bullish(),at=bars.at(-1).end;
  bars.at(-1).volume=1e10;
  assert.deepEqual(detectResearchSignals(bars,'spot','BTCUSDT','1h',parentFor(bars),
    null,at+3000).map(s=>s.ruleVersion),['v0.1']);
});
