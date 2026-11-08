import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectClosedCandles,analyzeMarketFrame,compareMarketFrames,MARKET_FRAMES} from './market-core.mjs';
const step=3600000,t0=3600000*20000;
function bars({count=45,delta=.002,volume=100,unfinished=false,gapIndex=null}={}){
 let price=100;
 return Array.from({length:count},(_,i)=>{
  const t=t0+(i+(gapIndex!==null&&i>=gapIndex?1:0))*step;
  const open=price;
  price*=Math.exp(delta);
  return {t,closeAt:t+step-1,open,high:Math.max(open,price)*1.001,
   low:Math.min(open,price)*.999,close:price,
   volume:typeof volume==='function'?volume(i):volume,
   closed:!(unfinished&&i===count-1)};
 });
}
test('only completed bars enter market statistics',()=>{
 const a=bars({unfinished:true});
 a.at(-1).close=9000;
 const r=analyzeMarketFrame(a,'1h',{now:a.at(-1).closeAt+100});
 assert.equal(r.closedBars,44);assert.ok(r.latestClose<200);
});
test('observed direction and monotonic movement are descriptive',()=>{
 const a=bars();
 const p=analyzeMarketFrame(a,'1h',{now:a.at(-1).closeAt+100});
 assert.equal(p.status,'OK');assert.equal(p.mode,'DIRECTIONAL');
 assert.equal(p.direction,'UP');assert.ok(p.efficiency>.99);
 assert.ok(Math.abs(p.velocityPctPerBar-0.2)<.01);
 assert.equal(p.claim.includes('not a prediction'),true);
 const b=bars({delta:-.001});
 const d=analyzeMarketFrame(b,'1h',{now:b.at(-1).closeAt+100});
 assert.equal(d.direction,'DOWN');
});
test('constant volume ratio is one and rising volume is measured without signals',()=>{
 const a=bars({volume:i=>i===44?300:100});
 const r=analyzeMarketFrame(a,'1h',{now:a.at(-1).closeAt+100});
 assert.equal(r.volumeRatio,3);
 assert.ok(r.rangePosition>=0&&r.rangePosition<=1);
});
test('gaps and inconsistent candle data invalidate history rather than fabricate',()=>{
 const a=bars({gapIndex:35});
 const r=analyzeMarketFrame(a,'1h',{now:a.at(-1).closeAt+100});
 assert.equal(r.status,'GAP');assert.equal(r.mode,'UNKNOWN');
 const bad=bars();bad[12].high=0;
 assert.equal(inspectClosedCandles(bad,'1h').state,'INVALID');
});
test('stale historical data never counts as fresh for comparison',()=>{
 const a=bars();
 const r=analyzeMarketFrame(a,'1h',{now:a.at(-1).closeAt+10*step});
 assert.equal(r.status,'STALE');
});
test('multi-timeframe comparison requires at least two current independent frames',()=>{
 const frame={status:'OK',mode:'DIRECTIONAL',direction:'UP',volumeRatio:1.4};
 const make=(interval,asset='BTCUSDT',state='OK',summary=frame)=>({interval,asset,state,summary});
 const r=compareMarketFrames({'15m':make('15m'), '1h':make('1h')},{asset:'BTCUSDT'});
 assert.equal(r.state,'UP_CONTEXT');assert.equal(r.available,2);
 assert.equal(r.frames.length,MARKET_FRAMES.length);
 const insufficient=compareMarketFrames({'15m':make('15m'),
  '1h':make('1h','BTCUSDT','CACHE')},{asset:'BTCUSDT'});
 assert.equal(insufficient.state,'INSUFFICIENT');
 const badAsset=compareMarketFrames({'15m':make('15m','ETHUSDT'),
  '1h':make('1h','BTCUSDT')},{asset:'BTCUSDT'});
 assert.equal(badAsset.available,1);
});
test('mixed opposite directions are shown as conflict, not false alignment',()=>{
 const a={status:'OK',direction:'UP',mode:'DIRECTIONAL'};
 const b={status:'OK',direction:'DOWN',mode:'DIRECTIONAL'};
 const r=compareMarketFrames({
  '15m':{interval:'15m',asset:'BTCUSDT',state:'OK',summary:a},
  '4h':{interval:'4h',asset:'BTCUSDT',state:'OK',summary:b}
 },{asset:'BTCUSDT'});
 assert.equal(r.state,'DIVERGENT');assert.equal(r.counts.down,1);
});
