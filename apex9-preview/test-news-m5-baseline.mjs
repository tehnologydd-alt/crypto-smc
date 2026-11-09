import test from 'node:test';
import assert from 'node:assert/strict';
import {NEWS_M5_BASELINE_VERSION,newsM5BaselineEligibility,
 compareNewsM5Baseline,fetchNewsM5Baseline} from './news-m5-baseline.mjs';

const FIVE=300000,DAY=86400000,at=Date.UTC(2026,10,9,12);
const now=at+6*3600000;
const event={title:'Bitcoin network update announced',observedAt:at,
 timeKind:'PUBLISHED',href:'https://publisher.example/bitcoin'};
function rows(time=at,clock=now){
 const base=Math.floor(time/FIVE)*FIVE;
 const last=base+Math.ceil((time-base+240*60000-FIVE)/FIVE)*FIVE;
 const start=base-13*FIVE-2*DAY;
 const max=Math.min(last,Math.floor(clock/FIVE)*FIVE-FIVE);
 return Array.from({length:(max-start)/FIVE+1},(_,i)=>{
  const t=start+i*FIVE,price=100+i*.002;
  return [t,String(price),String(price+.09),String(price-.09),
   String(price+.01),String(20+i%13),t+FIVE-1];
 });
}
test('compares 3 real M5 windows at the same UTC clock, with 637 contiguous bars',()=>{
 const source=rows(),r=compareNewsM5Baseline(event,source,{now});
 assert.equal(source.length,637);
 assert.equal(r.state,'OBSERVED');
 assert.equal(r.version,NEWS_M5_BASELINE_VERSION);
 assert.equal(r.totalClosedCandles,637);
 assert.deepEqual(r.referenceAt,[at-DAY,at-2*DAY]);
 assert.deepEqual(r.comparison.map(x=>x.minutes),[15,60,240]);
 assert.ok(r.comparison.every(x=>x.referenceCount===2));
 assert.ok(r.comparison.every(x=>Number.isFinite(x.absoluteDifferencePercentagePoints)));
 assert.equal(r.eventFactVerified,false);
 assert.equal(r.causalImpact,'NOT_ESTABLISHED');
 assert.equal(r.statisticalSignificance,'NOT_EVALUATED');
 assert.equal(Object.hasOwn(r,'forecast'),false);
});
test('mid-M5 publication compares matching minutes and samples fully closed candles',()=>{
 const observedAt=at+2*60000;
 const r=compareNewsM5Baseline({...event,observedAt},
  rows(observedAt),{now});
 assert.equal(r.state,'OBSERVED');
 assert.equal(r.totalClosedCandles,638);
 assert.deepEqual(r.comparison.map(x=>x.sampledAfterMinutes),[18,63,243]);
 assert.equal(r.referenceAt[0],observedAt-DAY);
});
test('insufficient time and index-only sources do not trigger a historical GET',async()=>{
 assert.equal(newsM5BaselineEligibility(event,{now:at+60*60000}).state,'NOT_READY');
 assert.equal(newsM5BaselineEligibility({...event,timeKind:'INDEXED'},{now}).state,'INELIGIBLE');
 const result=await fetchNewsM5Baseline(event,{now:()=>at+60000,
  fetchImpl:async()=>{throw Error('should not fetch');}});
 assert.equal(result.state,'NOT_READY');
});
test('missing, duplicated, future, invalid and incomplete OHLCV fail closed',()=>{
 const original=rows();
 assert.equal(compareNewsM5Baseline(event,original.slice(1),{now}).state,'INCOMPLETE');
 const duplicate=original.map(x=>[...x]);duplicate[99]=duplicate[98];
 assert.equal(compareNewsM5Baseline(event,duplicate,{now}).state,'INVALID');
 const bad=original.map(x=>[...x]);bad[500][3]='90000';
 assert.equal(compareNewsM5Baseline(event,bad,{now}).state,'INVALID');
 const incomplete=original.map(x=>[...x]);incomplete.at(-1)[6]=now+1000;
 assert.equal(compareNewsM5Baseline(event,incomplete,{now}).state,'INVALID');
});
test('one authenticated-free bounded Binance GET fetches the entire reference set',async()=>{
 let hits=0;
 const r=await fetchNewsM5Baseline(event,{now:()=>now,
  fetchImpl:async(url,opts)=>{
   hits++;
   const u=new URL(url);
   assert.equal(u.hostname,'data-api.binance.vision');
   assert.equal(u.searchParams.get('interval'),'5m');
   assert.equal(u.searchParams.get('timeZone'),'0');
   assert.equal(Number(u.searchParams.get('limit')),637);
   assert.equal(Number(u.searchParams.get('startTime')),at-2*DAY-13*FIVE);
   assert.equal(opts.credentials,'omit');
   return {ok:true,json:async()=>rows()};
  }});
 assert.equal(hits,1);
 assert.equal(r.state,'OBSERVED');
 assert.equal((await fetchNewsM5Baseline(event,{now:()=>now,
  fetchImpl:async()=>({status:429,ok:false})})).state,'RATE_LIMITED');
});
