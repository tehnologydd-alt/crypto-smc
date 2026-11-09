import test from 'node:test';
import assert from 'node:assert/strict';
import {NEWS_M5_VERSION,newsM5Eligibility,compareNewsPublishedM5,
 fetchNewsPublishedM5} from './news-m5-reaction.mjs';

const FIVE=300000;
const at=Date.UTC(2026,10,9,12,0);
const event={title:'Bitcoin network update announced',
 href:'https://publisher.example/bitcoin',source:'CoinDesk RSS',
 observedAt:at,timeKind:'PUBLISHED'};
const now=at+6*3600000;
function makeBars(atEvent,clock){
 const base=Math.floor(atEvent/FIVE)*FIVE;
 const start=base-13*FIVE;
 // Match the production selector: the last complete five-minute bar whose
 // close reaches the 240-minute horizon from the actual publication time.
 const fullHorizon=Math.ceil((atEvent+240*60000-FIVE)/FIVE)*FIVE;
 const last=Math.min(fullHorizon,Math.floor(clock/FIVE)*FIVE-FIVE);
 return Array.from({length:(last-start)/FIVE+1},(_,i)=>{
  const t=start+i*FIVE;
  const price=100+i*.01;
  const volume=t<base?10:20;
  return [t,String(price),String(price+.1),String(price-.1),
   String(price+.02),String(volume),t+FIVE-1];
 });
}
test('only continuous fully closed Binance M5 measurements, 15/60/240m',()=>{
 const rows=makeBars(at,now);
 assert.equal(rows.length,61);
 const r=compareNewsPublishedM5(event,rows,{now,symbol:'BTCUSDT'});
 assert.equal(r.state,'OBSERVED');
 assert.equal(r.version,NEWS_M5_VERSION);
 assert.deepEqual(r.availableHorizons,[15,60,240]);
 assert.equal(r.closedCandles,61);
 assert.equal(r.observations[0].postCandles,3);
 assert.equal(r.observations[0].sampledAfterMinutes,15);
 assert.equal(r.observations[0].volumeVsPreviousHour,2);
 assert.ok(r.observations[2].highestPercent>0);
 assert.equal(r.causalImpact,'NOT_ESTABLISHED');
 assert.equal(r.publicationEventTime,'NOT_VERIFIED');
 assert.equal(Object.hasOwn(r,'confidence'),false);
 assert.equal(Object.hasOwn(r,'tradingSignal'),false);
});
test('mid-M5 publication avoids counting pre-publication volume from mixed bar',()=>{
 const time=at+2*60000;
 const r=compareNewsPublishedM5({...event,observedAt:time},
  makeBars(time,now),{now});
 assert.equal(r.state,'OBSERVED');
 assert.equal(r.mixedCandleCaveat,true);
 assert.equal(r.observations[0].postCandles,3);
 assert.equal(r.observations[0].sampledAfterMinutes,18);
 assert.equal(r.observations[0].partialHeadlineCandleExcluded,true);
});
test('only horizons fully completed at the current moment are reported',()=>{
 const clock=at+100*60000;
 const r=compareNewsPublishedM5(event,makeBars(at,clock),{now:clock});
 assert.equal(r.state,'PARTIAL');
 assert.deepEqual(r.availableHorizons,[15,60]);
 assert.equal(r.observations.length,2);
 const earliest=at+14*60000;
 assert.equal(newsM5Eligibility(event,{now:earliest}).state,'NOT_READY');
});
test('rejects indexed timestamps, unknown publisher URL and expired stories',()=>{
 assert.equal(newsM5Eligibility({...event,timeKind:'INDEXED'},{now}).state,'INELIGIBLE');
 assert.equal(newsM5Eligibility({...event,href:'http://example.org/news'},{now}).state,'INELIGIBLE');
 assert.equal(newsM5Eligibility({...event,observedAt:at-50*3600000},{now}).state,'INELIGIBLE');
});
test('missing M5 bars, duplicate timestamps and malformed OHLCV fail closed',()=>{
 const rows=makeBars(at,now);
 assert.equal(compareNewsPublishedM5(event,rows.slice(1),{now}).state,'INCOMPLETE');
 const duplicate=rows.map(x=>[...x]);duplicate[20]=[...duplicate[19]];
 assert.equal(compareNewsPublishedM5(event,duplicate,{now}).state,'INVALID');
 const bad=rows.map(x=>[...x]);bad[19][3]='999999';
 assert.equal(compareNewsPublishedM5(event,bad,{now}).state,'INVALID');
 const unfinished=rows.map(x=>[...x]);unfinished.at(-1)[6]=now+1000;
 assert.equal(compareNewsPublishedM5(event,unfinished,{now}).state,'INVALID');
});
test('one bounded public Spot request with no keys, handles 429 and not-ready without GET',async()=>{
 let calls=0;
 const response=await fetchNewsPublishedM5(event,{
  now:()=>now,symbol:'ETHUSDT',
  fetchImpl:async(url,opts)=>{
   calls++;
   const parsed=new URL(url);
   assert.equal(parsed.hostname,'data-api.binance.vision');
   assert.equal(parsed.searchParams.get('interval'),'5m');
   assert.equal(parsed.searchParams.get('timeZone'),'0');
   assert.equal(Number(parsed.searchParams.get('limit')),61);
   assert.equal(opts.method,'GET');assert.equal(opts.credentials,'omit');
   return {ok:true,json:async()=>makeBars(at,now)};
  }});
 assert.equal(calls,1);
 assert.equal(response.state,'OBSERVED');
 assert.equal(response.symbol,'ETHUSDT');
 const rate=await fetchNewsPublishedM5(event,{now:()=>now,
  fetchImpl:async()=>({ok:false,status:429})});
 assert.equal(rate.state,'RATE_LIMITED');
 const tooEarly=await fetchNewsPublishedM5(event,{now:()=>at+5*60000,
  fetchImpl:async()=>{throw Error('must not fetch');}});
 assert.equal(tooEarly.state,'NOT_READY');
});
