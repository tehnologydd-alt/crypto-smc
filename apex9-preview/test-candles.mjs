import test from 'node:test';
import assert from 'node:assert/strict';
import {CANDLE_INTERVALS,parseKlines,fetchCandles,analyzeStructure} from './candles.mjs';
const step=CANDLE_INTERVALS['1h'],now=1700002800000;
const start=Math.floor((now-45*step)/step)*step;
function row(i,base=100){const t=start+i*step,open=base,close=base+.4;return [t,''+open,''+(base+1),''+(base-1),''+close,'123',t+step-1,'0'];}
test('OHLCV timestamps, closed bars, volumes are validated',()=>{
 const r=parseKlines([row(0),row(1)],'1h',now);
 assert.equal(r.length,2);assert.equal(r[0].volume,123);
 assert.equal(r[1].closeAt,r[1].t+step-1);
 assert.throws(()=>parseKlines([[...row(0).slice(0,2),'0',...row(0).slice(3)]],'1h',now));
 assert.throws(()=>parseKlines([row(1),row(0)],'1h',now),/OHLCV/);
 assert.throws(()=>parseKlines([[...row(0).slice(0,5),'-5',...row(0).slice(6)]],'1h',now));
});
test('fetch only approved public OHLCV and retains provider provenance',async()=>{
 let requested;
 const r=await fetchCandles('BTCUSDT','1h',{now:()=>now,limit:20,fetchImpl:async (url,opts)=>{
  requested={url,opts};return {ok:true,status:200,json:async()=>Array.from({length:20},(_,i)=>row(i))};
 }});
 assert.equal(r.state,'STALE'); // 20 older bars make last closed candle stale
 assert.ok(requested.url.includes('data-api.binance.vision/api/v3/klines?'));
 assert.equal(requested.opts.method,'GET');
 assert.equal(requested.opts.credentials,'omit');
 assert.equal(r.provider,'Binance Spot');
});
test('rate limit and network errors cannot create fake candles',async()=>{
 const limited=await fetchCandles('BTCUSDT','15m',{fetchImpl:async()=>({status:429,ok:false})});
 assert.equal(limited.state,'RATE_LIMITED');
 assert.equal(limited.candles.length,0);
 const offline=await fetchCandles('BTCUSDT','1h',{fetchImpl:async()=>{throw Error('network down')}});
 assert.equal(offline.state,'OFFLINE');
 assert.equal(offline.candles.length,0);
});
test('the developing candle is excluded from historical structure',()=>{
 const times=Array.from({length:21},(_,i)=>start+i*step);
 const rows=times.map((t,i)=>({t,closeAt:t+step-1,open:100,high:101,low:99,close:100,volume:1,closed:true}));
 rows[20]={...rows[20],closed:false,high:999,close:999};
 const r=analyzeStructure(rows);
 assert.equal(r.analyzedBars,20);
 assert.equal(r.events.length,0);
});
test('confirmed pivots never refer to future data; CHoCH marks reversal only after earlier break',()=>{
 const highs=[11,12,16,14,13,14,15,19,17,16,15,14,12,11,10,9,8,7,6,5];
 const lows=[9,10,13,11,10,11,12,16,14,13,12,11,9,8,7,6,5,4,3,2];
 const closes=[10,11,15,13,12,13,14,18,16,15,14,13,10,9,8,7,6,5,4,3];
 const bars=highs.map((high,i)=>({t:i*step,closeAt:(i+1)*step-1,open:closes[i],high,low:lows[i],close:closes[i],volume:1,closed:true}));
 const r=analyzeStructure(bars);
 assert.equal(r.status,'OK');
 for(const p of r.swings)assert.ok(p.confirmedAt>p.time,'swing right confirmation');
 for(const e of r.events)assert.ok(e.time>=e.confirmedAt,'no early break');
 assert.ok(r.events.every(e=>['BREAK','BOS','CHoCH'].includes(e.type)));
});
test('insufficient and malformed structure history is not guessed',()=>{
 assert.equal(analyzeStructure([]).status,'INSUFFICIENT');
 assert.equal(analyzeStructure([{close:1,closed:false}]).bias,'UNKNOWN');
});
