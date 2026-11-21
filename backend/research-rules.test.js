import test from 'node:test';
import assert from 'node:assert/strict';
import { RULES, RULE_KEYS } from './strategy-rules.js';
import { parseBookSnapshot, depthGate } from './order-book.js';
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
function parentFor(bars) {const last=bars.at(-1).end;return bullish(4*HOUR,last-20*4*HOUR+1,20);}
function book(closedAt,bidQty=2,askQty=1) {
  const raw={lastUpdateId:99121,
    bids:Array.from({length:100},(_,i)=>[(106-i*.001).toFixed(4),String(bidQty)]),
    asks:Array.from({length:100},(_,i)=>[(106.01+i*.001).toFixed(4),String(askQty)])};
  return parseBookSnapshot(raw,{market:'spot',symbol:'BTCUSDT',capturedAt:closedAt+2000});
}
test('research categories keep old volume and sweep IDs as archived not active',()=>{
  assert.deepEqual(RULES.map(r=>r.key),['v0.1','v0.2-D1','v0.3-D1']);
  assert.ok(RULE_KEYS.includes('v0.2'));
  assert.ok(RULE_KEYS.includes('v0.3-L1'));
  assert.equal(RULES[1].bookLevels,100);
  assert.equal(RULES[2].htf,true);
});
test('measured L2 book totals are price x quantity (USDT) on both sides',()=>{
  const b=book(12345);
  assert.ok(b);
  assert.equal(b.levels,100);
  assert.equal(b.lastUpdateId,99121);
  assert.ok(b.bidUsdt>20000 && b.askUsdt>10000);
  assert.ok(b.imbalance>0.6 && b.imbalance<0.7);
  assert.equal(b.source,'binance_rest_depth');
  assert.equal(parseBookSnapshot({lastUpdateId:5,bids:[],asks:[]},
    {market:'spot',symbol:'BTCUSDT',capturedAt:12345}),null);
});
test('depth gate rejects stale, future, mismatched and weak or invalid snapshots',()=>{
  const closedAt=5000000,s=book(closedAt);
  assert.equal(depthGate(s,{market:'spot',symbol:'BTCUSDT',side:'LONG',closedAt,observedAt:closedAt+3000}).allowed,true);
  assert.equal(depthGate(s,{market:'spot',symbol:'BTCUSDT',side:'SHORT',closedAt,observedAt:closedAt+3000}).allowed,false);
  assert.equal(depthGate(s,{market:'futures',symbol:'BTCUSDT',side:'LONG',closedAt,observedAt:closedAt+3000}).allowed,false);
  assert.equal(depthGate(s,{market:'spot',symbol:'BTCUSDT',side:'LONG',closedAt,observedAt:closedAt+30000}).allowed,false);
  assert.equal(depthGate(s,{market:'spot',symbol:'BTCUSDT',side:'LONG',closedAt:closedAt+5000,observedAt:closedAt+7000}).allowed,false);
  assert.equal(depthGate({...s,spreadPct:1},{market:'spot',symbol:'BTCUSDT',side:'LONG',closedAt,observedAt:closedAt+3000}).allowed,false);
});
test('parallel strategies use only a matched real book snapshot at publication time',()=>{
  const bars=bullish(),closedAt=bars.at(-1).end,s=book(closedAt);
  const parent=parentFor(bars);
  const without=detectResearchSignals(bars,'spot','BTCUSDT','1h',parent,null,closedAt+3000);
  assert.deepEqual(without.map(x=>x.ruleVersion),['v0.1']);
  const accepted=detectResearchSignals(bars,'spot','BTCUSDT','1h',parent,s,closedAt+3000);
  assert.deepEqual(accepted.map(x=>x.ruleVersion),RULES.map(x=>x.key));
  assert.equal(new Set(accepted.map(x=>x.id)).size,3);
  assert.ok(accepted[1].ruleSnapshot.book.bidUsdt>accepted[1].ruleSnapshot.book.askUsdt);
  assert.equal(accepted[1].detectedAt,s.capturedAt);
  assert.equal(accepted[1].events[0].at,s.capturedAt);
  assert.deepEqual(detectResearchSignals(bars,'spot','BTCUSDT','1h',null,s,closedAt+3000).map(x=>x.ruleVersion),
    ['v0.1','v0.2-D1']);
  const late=detectResearchSignals(bars,'spot','BTCUSDT','1h',parent,s,closedAt+20000);
  assert.deepEqual(late.map(x=>x.ruleVersion),['v0.1']);
});
test('candle traded volume never substitutes for book depth',()=>{
  const bars=bullish(),closedAt=bars.at(-1).end;
  bars.at(-1).volume=1e10;
  assert.deepEqual(detectResearchSignals(bars,'spot','BTCUSDT','1h',parentFor(bars),null,closedAt+3000).map(x=>x.ruleVersion),['v0.1']);
});
